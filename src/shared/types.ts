export type SaveResult =
  | { ok: true; synced?: boolean; syncMessage?: string }
  | { ok: false; message: string }

export type SyncSettings = {
  configured: boolean
  lastSyncAt?: string
  lastSyncError?: string
}

export type OpenPathResult = { ok: true } | { ok: false; message: string }

export type PdfResult =
  | { ok: true; filePath: string }
  | { ok: false; canceled: true }
  | { ok: false; message: string }

export type AppUpdateStatus = {
  current: string
  available?: string
  ready: boolean
}

export type UpdateInstallResult = { ok: true } | { ok: false; message: string }
