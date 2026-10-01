import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
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

async function pullAndMerge(local: AppStore, uri: string): Promise<AppStore> {
  const today = todayIso()
  const prunedLocal = pruneOldDays(local, today)
  const remote = await pullRemoteStore(uri)
  if (!remote) return prunedLocal
  const merged = pruneOldDays(mergeStores(prunedLocal, remote), today)
  await writeLocalStore(merged)
  if (Object.keys(merged.days).length < Object.keys(remote.days).length) {
    await pushRemoteStore(uri, touchStore(merged))
  }
  return merged
}

async function loadStore(): Promise<AppStore> {
  const local = pruneOldDays(await loadLocalStore(), todayIso())
  const uri = await companyDatabaseUri()
  const settings = await loadSyncSettings()
  if (!uri) {
    await writeLocalStore(local)
    return local
  }
  try {
    const merged = await pullAndMerge(local, uri)
    await saveSyncSettings({
      ...settings,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: undefined
    })
    return merged
  } catch (error) {
    await saveSyncSettings({
      ...settings,
      lastSyncError: syncErrorMessage(error)
    })
    return local
  }
}

async function saveStore(store: AppStore): Promise<SaveResult> {
  const stamped = touchStore(pruneOldDays(store, todayIso()))
  await writeLocalStore(stamped)
  const uri = await companyDatabaseUri()
  const settings = await loadSyncSettings()
  if (!uri) return { ok: true, synced: false, syncMessage: 'โปรแกรมนี้ยังไม่ได้ใส่ฐานข้อมูลบริษัท' }
  try {
    await pushRemoteStore(uri, stamped)
    await saveSyncSettings({
      ...settings,
      lastSyncAt: new Date().toISOString(),
      lastSyncError: undefined
    })
    return { ok: true, synced: true }
  } catch (error) {
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

async function exportPdf(): Promise<PdfResult> {
  const printWindow = new BrowserWindow({
    width: 1123,
    height: 794,
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

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      await printWindow.loadURL(rendererUrl('?print=1'))
    } else {
      await printWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        query: { print: '1' }
      })
    }

    await ready

    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: true,
      preferCSSPageSize: true
    })

    const saved = await loadStore()
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'บันทึกไฟล์ PDF',
      defaultPath: join(app.getPath('documents'), pdfFileName(saved.activeDate || todayIso())),
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
      const merged = await pullAndMerge(local, uri)
      await pushRemoteStore(uri, touchStore(merged))
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
    return exportPdf()
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
