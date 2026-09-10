import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppStore } from '../shared/store'
import type { PdfResult, SaveResult, SyncSettings, SyncTestResult } from '../shared/types'

const api = {
  loadStore: (): Promise<AppStore> => ipcRenderer.invoke('store:load'),
  saveStore: (store: AppStore): Promise<SaveResult> => ipcRenderer.invoke('store:save', store),
  exportPdf: (): Promise<PdfResult> => ipcRenderer.invoke('pdf:export'),
  getSyncSettings: (): Promise<SyncSettings> => ipcRenderer.invoke('sync:getSettings'),
  saveSyncUri: (uri: string): Promise<SyncTestResult> => ipcRenderer.invoke('sync:saveUri', uri),
  syncNow: (): Promise<SaveResult> => ipcRenderer.invoke('sync:now'),
  notifyPrintReady: (): void => {
    ipcRenderer.send('print:ready')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore defined in dts
  window.electron = electronAPI
  // @ts-ignore defined in dts
  window.api = api
}
