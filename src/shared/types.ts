export type SaveResult =
  | { ok: true; synced?: boolean; syncMessage?: string }
  | { ok: false; message: string }

export type SyncSettings = {
  mongodbUri: string
  lastSyncAt?: string
  lastSyncError?: string
}

export type SyncTestResult = { ok: true } | { ok: false; message: string }

export type PdfResult =
  | { ok: true; filePath: string }
  | { ok: false; canceled: true }
  | { ok: false; message: string }
