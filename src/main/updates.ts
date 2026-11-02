import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { GridFSBucket, ObjectId } from 'mongodb'
import { withDatabase } from './mongo'
import { dirname, join } from 'path'
import { app } from 'electron'
import type { AppUpdateStatus, UpdateInstallResult } from '../shared/types'
import windowsHelper from '../../resources/apply-update.ps1?raw'

const RELEASES = 'app_releases'

type UpdateChannel = 'win' | 'win7' | 'mac'

type ReleaseDoc = {
  _id: UpdateChannel
  version: string
  sha256: string
  fileId: ObjectId
}

function updateDir(): string {
  return join(app.getPath('appData'), 'kooyai-update')
}

function pendingAsar(): string {
  return join(updateDir(), 'app.asar')
}

function markerPath(): string {
  return join(updateDir(), 'ready.json')
}

function failurePath(): string {
  return join(updateDir(), 'failed.txt')
}

function updateChannel(): UpdateChannel {
  if (process.platform === 'darwin') return 'mac'
  const major = Number(process.versions.electron.split('.')[0])
  return major <= 22 ? 'win7' : 'win'
}

function supportsAutoUpdate(): boolean {
  return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin')
}

export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map((part) => Number(part) || 0)
  const b = right.split('.').map((part) => Number(part) || 0)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

async function readMarker(): Promise<{ version: string; sha256: string; channel?: string } | null> {
  try {
    const parsed = JSON.parse(await readFile(markerPath(), 'utf8')) as {
      version?: unknown
      sha256?: unknown
      channel?: unknown
    }
    if (typeof parsed.version !== 'string' || typeof parsed.sha256 !== 'string') return null
    return {
      version: parsed.version,
      sha256: parsed.sha256,
      channel: typeof parsed.channel === 'string' ? parsed.channel : undefined
    }
  } catch {
    return null
  }
}

async function spawnHelper(relaunch: boolean): Promise<void> {
  const marker = await readMarker()
  if (!marker) throw new Error('Missing update marker')
  let child: ReturnType<typeof spawn>
  if (process.platform === 'win32') {
    // Persist the attempt before launching. A missing or interrupted helper must
    // let the installed app open next time instead of looping at every startup.
    await writeFile(failurePath(), `${marker.sha256}\nThe update did not finish. Please retry.`, 'utf8')
    // Cloud updates replace app.asar only. Extract the helper from that archive
    // so existing installations also receive fixes to the updater itself.
    const helper = join(updateDir(), 'apply-update.ps1')
    await writeFile(helper, windowsHelper, 'utf8')
    child = spawn(
      join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', helper],
      {
        stdio: 'ignore',
        windowsHide: true,
        // Windows processes survive their parent without DETACHED_PROCESS,
        // which can create the visible black console shown during updates.
        detached: false,
        env: {
          ...process.env,
          KOOYAI_UPDATE_PENDING: pendingAsar(),
          KOOYAI_UPDATE_TARGET: join(process.resourcesPath, 'app.asar'),
          KOOYAI_UPDATE_MARKER: markerPath(),
          KOOYAI_UPDATE_FAILURE: failurePath(),
          KOOYAI_UPDATE_SHA256: marker.sha256,
          KOOYAI_UPDATE_PID: String(process.pid),
          KOOYAI_UPDATE_RELAUNCH: relaunch ? '1' : '0',
          KOOYAI_UPDATE_EXE: process.execPath
        }
      }
    )
  } else {
    const args = [
      pendingAsar(),
      join(process.resourcesPath, 'app.asar'),
      markerPath(),
      relaunch ? '1' : '0',
      process.execPath
    ]
    child = spawn('/bin/bash', [join(process.resourcesPath, 'apply-update.sh'), ...args], {
      detached: true,
      stdio: 'ignore'
    })
  }
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
  })
  child.unref()
}

export async function pendingUpdateReady(): Promise<boolean> {
  if (!supportsAutoUpdate()) return false
  const marker = await readMarker()
  if (!marker) return false
  if (compareVersions(marker.version, app.getVersion()) <= 0) {
    await rm(markerPath(), { force: true })
    await rm(pendingAsar(), { force: true })
    return false
  }
  if (marker.channel && marker.channel !== updateChannel()) return false
  try {
    if ((await readFile(failurePath(), 'utf8')).split('\n')[0] === marker.sha256) return false
  } catch {
    // No previous failed attempt.
  }
  try {
    if (await sha256(pendingAsar()) !== marker.sha256) return false
  } catch {
    return false
  }
  return true
}

// Returns true when this process is exiting so the helper can swap in the downloaded program.
export async function applyPendingUpdate(relaunch: boolean): Promise<boolean> {
  try {
    if (!(await pendingUpdateReady())) return false
    await spawnHelper(relaunch)
  } catch {
    // Keep running the installed app if the OS cannot launch its updater.
    return false
  }
  app.exit(0)
  return true
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve())
  })
  return hash.digest('hex')
}

async function downloadRelease(uri: string, release: ReleaseDoc): Promise<void> {
  const dir = updateDir()
  await mkdir(dir, { recursive: true })
  const part = join(dir, 'app.asar.part')
  await withDatabase(uri, async (db) => {
    const bucket = new GridFSBucket(db, { bucketName: 'app_updates' })
    await pipeline(bucket.openDownloadStream(release.fileId), createWriteStream(part))
  })

  const digest = await sha256(part)
  if (digest !== release.sha256) {
    await rm(part, { force: true })
    throw new Error('โปรแกรมที่ดาวน์โหลดไม่ตรงกับลายเซ็น')
  }
  await mkdir(dirname(pendingAsar()), { recursive: true })
  await rename(part, pendingAsar())
  await writeFile(
    markerPath(),
    JSON.stringify({ version: release.version, sha256: digest, channel: updateChannel() }),
    'utf8'
  )
}

export function installUpdateHooks(companyDatabaseUri: () => Promise<string>): void {
  if (!supportsAutoUpdate()) return

  let applying = false
  app.on('before-quit', (event) => {
    if (applying) return
    event.preventDefault()
    applying = true
    void pendingUpdateReady()
      .then(async (ready) => {
        if (ready) await spawnHelper(false)
      })
      .catch(() => undefined)
      .finally(() => {
        app.exit(0)
      })
  })

  app.whenReady().then(() => {
    void checkForUpdate(companyDatabaseUri)
  })
}

let knownAvailable: string | undefined

export async function getUpdateStatus(): Promise<AppUpdateStatus> {
  const current = app.getVersion()
  const ready = await pendingUpdateReady()
  const marker = await readMarker()
  let available = knownAvailable
  if ((!available || compareVersions(available, current) <= 0) && marker) {
    available = compareVersions(marker.version, current) > 0 ? marker.version : undefined
  }
  if (available && compareVersions(available, current) <= 0) available = undefined
  return { current, available, ready: Boolean(available) && ready }
}

async function fetchLatestRelease(uri: string): Promise<ReleaseDoc | null> {
  return withDatabase(uri, (db) =>
    db.collection<ReleaseDoc>(RELEASES).findOne({ _id: updateChannel() })
  )
}

export async function checkForUpdate(
  companyDatabaseUri: () => Promise<string>
): Promise<AppUpdateStatus> {
  try {
    const uri = await companyDatabaseUri()
    if (!uri) return getUpdateStatus()
    const release = await fetchLatestRelease(uri)
    if (!release?.version || !release.sha256 || !release.fileId) return getUpdateStatus()
    if (compareVersions(release.version, app.getVersion()) <= 0) {
      knownAvailable = undefined
      return getUpdateStatus()
    }
    knownAvailable = release.version
  } catch {
    // Offline stays on the program already installed.
  }
  return getUpdateStatus()
}

export async function downloadAvailableUpdate(
  companyDatabaseUri: () => Promise<string>
): Promise<UpdateInstallResult> {
  if (!supportsAutoUpdate()) {
    return { ok: false, message: 'รุ่นนี้ยังอัปเดตจากอินเทอร์เน็ตไม่ได้' }
  }
  try {
    const uri = await companyDatabaseUri()
    if (!uri) return { ok: false, message: 'โปรแกรมนี้ยังไม่ได้ใส่ฐานข้อมูลบริษัท' }
    const release = await fetchLatestRelease(uri)
    if (!release?.version || !release.sha256 || !release.fileId) {
      return { ok: false, message: 'ยังไม่มีรุ่นใหม่' }
    }
    if (compareVersions(release.version, app.getVersion()) <= 0) {
      return { ok: false, message: 'ยังไม่มีรุ่นใหม่' }
    }
    knownAvailable = release.version
    const marker = await readMarker()
    let validDownload = false
    if (marker?.version === release.version && marker.sha256 === release.sha256) {
      try {
        validDownload = await sha256(pendingAsar()) === release.sha256
      } catch {
        // The staged file may have been removed or damaged since the download.
      }
    }
    if (!validDownload) {
      await downloadRelease(uri, release)
    }
    // The user explicitly requested a retry; automatic startup never clears this.
    await rm(failurePath(), { force: true })
    const status = await getUpdateStatus()
    if (!status.ready) return { ok: false, message: 'ดาวน์โหลดรุ่นใหม่ไม่สำเร็จ ลองอีกครั้งเมื่อเน็ตดี' }
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ดาวน์โหลดรุ่นใหม่ไม่สำเร็จ'
    return { ok: false, message }
  }
}
