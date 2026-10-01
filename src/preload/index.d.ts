import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppStore } from '../shared/store'
import type { PdfResult, SaveResult, SyncSettings } from '../shared/types'

export interface AppApi {
  loadStore: () => Promise<AppStore>
  saveStore: (store: AppStore) => Promise<SaveResult>
  exportPdf: () => Promise<PdfResult>
  getSyncSettings: () => Promise<SyncSettings>
  syncNow: () => Promise<SaveResult>
  notifyPrintReady: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
