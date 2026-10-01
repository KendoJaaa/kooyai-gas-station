import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir, stat } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { emptyStore, isAppStore, migrateStore, type AppStore } from '../shared/store'
import { mergeStores, touchStore } from '../shared/sync'
import { pruneOldDays } from '../shared/retention'
import type { PdfResult, SaveResult, SyncSettings } from '../shared/types'
import { pullRemoteStore, pushRemoteStore } from './mongo'
import { companyDatabaseUri } from './companyDb'
import { loadSyncSettings, saveSyncSettings } from './syncSettings'

const STORE_FILE = 'station.json'

function todayIso(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function pdfFileName(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return 'รายงานส่วนก-ข.pdf'
  const be = String(Number(match[1]) + 543)
  return `รายงานส่วนก-ข-${match[3]}-${match[2]}-${be}.pdf`
}

function taxPdfFileName(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return 'รายงานภาษีขาย.pdf'
  return `รายงานภาษีขาย-${match[2]}-${Number(match[1]) + 543}.pdf`
}

function storePath(): string {
  return join(app.getPath('userData'), STORE_FILE)
}

function rendererUrl(search = ''): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}${search}`
  }
  return ''
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(rendererUrl())
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

async function loadLocalStore(): Promise<AppStore> {
  try {
    const raw = await readFile(storePath(), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (isAppStore(parsed)) return migrateStore(parsed)
    return emptyStore(todayIso())
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return emptyStore(todayIso())
    throw error
  }
}

async function writeLocalStore(store: AppStore): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8')
}

function syncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'เชื่อมต่อ MongoDB ไม่สำเร็จ'
}

async function saveToCompanyDatabase(
  local: AppStore,
  uri: string,
  preferLocal: boolean
): Promise<AppStore> {
  const incoming = preferLocal ? touchStore(local) : local
  const remote = await pullRemoteStore(uri)
  const cloud = touchStore(remote ? mergeStores(incoming, remote) : incoming)
  await pushRemoteStore(uri, cloud)
  const onThisPc = pruneOldDays(cloud, todayIso())
  await writeLocalStore(onThisPc)
  return onThisPc
}

async function loadStore(): Promise<AppStore> {
  const local = await loadLocalStore()
  const uri = await companyDatabaseUri()
  const settings = await loadSyncSettings()
  if (!uri) {
    const onThisPc = pruneOldDays(local, todayIso())
    await writeLocalStore(onThisPc)
    return onThisPc
  }
  try {
    const onThisPc = await saveToCompanyDatabase(local, uri, false)
    await saveSyncSettings({
      ...settings,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: undefined
    })
    return onThisPc
  } catch (error) {
    await saveSyncSettings({
      ...settings,
      lastSyncError: syncErrorMessage(error)
    })
    const onThisPc = pruneOldDays(local, todayIso())
    await writeLocalStore(onThisPc)
    return onThisPc
  }
}

async function saveStore(store: AppStore): Promise<SaveResult> {
  const uri = await companyDatabaseUri()
  const settings = await loadSyncSettings()
  if (!uri) {
    await writeLocalStore(touchStore(pruneOldDays(store, todayIso())))
    return { ok: true, synced: false, syncMessage: 'โปรแกรมนี้ยังไม่ได้ใส่ฐานข้อมูลบริษัท' }
  }
  try {
    await saveToCompanyDatabase(store, uri, true)
    await saveSyncSettings({
      ...settings,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: undefined
    })
    return { ok: true, synced: true }
  } catch (error) {
    await writeLocalStore(touchStore(pruneOldDays(store, todayIso())))
    const message = syncErrorMessage(error)
    await saveSyncSettings({ ...settings, lastSyncError: message })
    return { ok: true, synced: false, syncMessage: message }
  }
}

function waitForPrintReady(printWindow: BrowserWindow, timeoutMs = 12_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ipcMain.removeListener('print:ready', onReady)
      reject(new Error('หน้าพิมพ์ไม่พร้อมภายในเวลาที่กำหนด'))
    }, timeoutMs)

    const onReady = (_event: Electron.IpcMainEvent): void => {
      if (_event.sender !== printWindow.webContents) return
      clearTimeout(timer)
      ipcMain.removeListener('print:ready', onReady)
      resolve()
    }

    ipcMain.on('print:ready', onReady)
  })
}

async function exportPdf(kind: 'daily' | 'tax' = 'daily', month = ''): Promise<PdfResult> {
  const tax = kind === 'tax'
  const printWindow = new BrowserWindow({
    width: tax ? 794 : 1123,
    height: tax ? 1123 : 794,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  try {
    const ready = waitForPrintReady(printWindow)
    const search = tax ? `?print=tax&month=${encodeURIComponent(month)}` : '?print=1'

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await printWindow.loadURL(rendererUrl(search))
    } else {
      await printWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        query: tax ? { print: 'tax', month } : { print: '1' }
      })
    }

    await ready

    const pdf = await printWindow.webContents.printToPDF(
      tax
        ? {
            printBackground: true,
            pageSize: 'A4',
            landscape: false,
            preferCSSPageSize: true,
            margins: { marginType: 'custom', top: 0.35, bottom: 0.35, left: 0.3, right: 0.3 }
          }
        : {
            printBackground: true,
            pageSize: 'A4',
            landscape: true,
            preferCSSPageSize: true
          }
    )

    const saved = await loadStore()
    const defaultName = tax ? taxPdfFileName(month) : pdfFileName(saved.activeDate || todayIso())
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'บันทึกไฟล์ PDF',
      defaultPath: join(app.getPath('documents'), defaultName),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (canceled || !filePath) {
      return { ok: false, canceled: true }
    }

    await writeFile(filePath, pdf)
    return { ok: true, filePath }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ส่งออก PDF ไม่สำเร็จ'
    return { ok: false, message }
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close()
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.kooyai.gasstation')
  Menu.setApplicationMenu(null)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('store:load', async (): Promise<AppStore> => {
    return loadStore()
  })

  ipcMain.handle('store:save', async (_event, store: AppStore): Promise<SaveResult> => {
    try {
      if (!isAppStore(store)) {
        return { ok: false, message: 'รูปแบบข้อมูลไม่ถูกต้อง' }
      }
      return await saveStore(store)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ'
      return { ok: false, message }
    }
  })

  ipcMain.handle('sync:getSettings', async (): Promise<SyncSettings> => {
    const settings = await loadSyncSettings()
    const uri = await companyDatabaseUri()
    return {
      configured: Boolean(uri),
      lastSyncAt: settings.lastSyncAt,
      lastSyncError: settings.lastSyncError
    }
  })

  ipcMain.handle('sync:now', async (): Promise<SaveResult> => {
    try {
      const uri = await companyDatabaseUri()
      if (!uri) {
        return { ok: false, message: 'โปรแกรมนี้ยังไม่ได้ใส่ฐานข้อมูลบริษัท' }
      }
      const local = await loadLocalStore()
      const settings = await loadSyncSettings()
      await saveToCompanyDatabase(local, uri, false)
      await saveSyncSettings({
        ...settings,
        lastSyncAt: new Date().toISOString(),
        lastSyncError: undefined
      })
      return { ok: true, synced: true }
    } catch (error) {
      return { ok: false, message: syncErrorMessage(error) }
    }
  })

  ipcMain.handle('pdf:export', async (): Promise<PdfResult> => {
    return exportPdf('daily')
  })

  ipcMain.handle('pdf:exportTax', async (_event, month: unknown): Promise<PdfResult> => {
    if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      return { ok: false, message: 'เดือนไม่ถูกต้อง' }
    }
    return exportPdf('tax', month)
  })

  ipcMain.handle('file:open', async (_event, filePath: unknown): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (typeof filePath !== 'string' || !filePath.toLowerCase().endsWith('.pdf')) {
      return { ok: false, message: 'เปิดไฟล์ไม่ได้' }
    }
    try {
      const info = await stat(filePath)
      if (!info.isFile()) return { ok: false, message: 'เปิดไฟล์ไม่ได้' }
    } catch {
      return { ok: false, message: 'หาไฟล์ไม่เจอ' }
    }
    const error = await shell.openPath(filePath)
    if (error) return { ok: false, message: 'เปิดไฟล์ไม่ได้' }
    return { ok: true }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
