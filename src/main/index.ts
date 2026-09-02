import { app, shell, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import type { PdfResult, SaveResult, StationRecord } from '../shared/types'

const STORE_FILE = 'record.json'

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
    width: 1100,
    height: 860,
    minWidth: 760,
    minHeight: 640,
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

async function loadRecord(): Promise<StationRecord | null> {
  try {
    const raw = await readFile(storePath(), 'utf8')
    return JSON.parse(raw) as StationRecord
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    throw error
  }
}

async function saveRecord(record: StationRecord): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(storePath(), JSON.stringify(record, null, 2), 'utf8')
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
    width: 794,
    height: 1123,
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
      landscape: false,
      preferCSSPageSize: true
    })

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'บันทึกไฟล์ PDF',
      defaultPath: join(app.getPath('documents'), 'แบบบันทึกสถานีน้ำมัน.pdf'),
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

  ipcMain.handle('form:load', async (): Promise<StationRecord | null> => {
    return loadRecord()
  })

  ipcMain.handle('form:save', async (_event, record: StationRecord): Promise<SaveResult> => {
    try {
      await saveRecord(record)
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ'
      return { ok: false, message }
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
