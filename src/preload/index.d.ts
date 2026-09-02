import { ElectronAPI } from '@electron-toolkit/preload'
import type { PdfResult, SaveResult, StationRecord } from '../shared/types'

export interface AppApi {
  loadForm: () => Promise<StationRecord | null>
  saveForm: (record: StationRecord) => Promise<SaveResult>
  exportPdf: () => Promise<PdfResult>
  notifyPrintReady: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
