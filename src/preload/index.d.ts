import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppStore } from '../shared/store'
import type {
  AppUpdateStatus,
  OpenPathResult,
  PdfResult,
  SaveResult,
  SyncSettings,
  UpdateInstallResult
} from '../shared/types'

export interface AppApi {
  loadStore: () => Promise<AppStore>
  saveStore: (store: AppStore) => Promise<SaveResult>
  exportPdf: () => Promise<PdfResult>
  exportTaxPdf: (month: string) => Promise<PdfResult>
  getSyncSettings: () => Promise<SyncSettings>
  syncNow: () => Promise<SaveResult>
  getUpdateStatus: () => Promise<AppUpdateStatus>
  checkForUpdate: () => Promise<AppUpdateStatus>
  downloadUpdate: () => Promise<UpdateInstallResult>
  notifyPrintReady: () => void
  openPath: (filePath: string) => Promise<OpenPathResult>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
