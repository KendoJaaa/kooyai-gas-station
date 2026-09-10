import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { SyncSettings } from '../shared/types'

const FILE = 'sync.json'

function settingsPath(): string {
  return join(app.getPath('userData'), FILE)
}

export async function loadSyncSettings(): Promise<SyncSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SyncSettings>
    return {
      mongodbUri: typeof parsed.mongodbUri === 'string' ? parsed.mongodbUri : '',
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : undefined,
      lastSyncError: typeof parsed.lastSyncError === 'string' ? parsed.lastSyncError : undefined
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { mongodbUri: '' }
    throw error
  }
}

export async function saveSyncSettings(settings: SyncSettings): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}
