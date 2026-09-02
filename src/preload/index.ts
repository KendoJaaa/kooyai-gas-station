import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { PdfResult, SaveResult, StationRecord } from '../shared/types'

const api = {
  loadForm: (): Promise<StationRecord | null> => ipcRenderer.invoke('form:load'),
  saveForm: (record: StationRecord): Promise<SaveResult> => ipcRenderer.invoke('form:save', record),
  exportPdf: (): Promise<PdfResult> => ipcRenderer.invoke('pdf:export'),
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
