import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb'
import { dirname, join } from 'path'
import { app } from 'electron'
import type { AppUpdateStatus, UpdateInstallResult } from '../shared/types'

const DB_NAME = 'kooyai'
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

async function readMarker(): Promise<{ version: string; sha256: string } | null> {
  try {
    const parsed = JSON.parse(await readFile(markerPath(), 'utf8')) as {
      version?: unknown
      sha256?: unknown
    }
    if (typeof parsed.version !== 'string' || typeof parsed.sha256 !== 'string') return null
    return { version: parsed.version, sha256: parsed.sha256 }
  } catch {
    return null
  }
}

function spawnHelper(relaunch: boolean): void {
  const args = [
    pendingAsar(),
    join(process.resourcesPath, 'app.asar'),
    markerPath(),
    relaunch ? '1' : '0',
    process.execPath
  ]
  const child =
    process.platform === 'darwin'
      ? spawn('/bin/bash', [join(process.resourcesPath, 'apply-update.sh'), ...args], {
          detached: true,
          stdio: 'ignore'
        })
      : spawn(join(process.resourcesPath, 'apply-update.cmd'), args, {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          shell: true
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
  return true
}

// Returns true when this process is exiting so the helper can swap in the downloaded program.
export async function applyPendingUpdate(relaunch: boolean): Promise<boolean> {
  if (!(await pendingUpdateReady())) return false
  spawnHelper(relaunch)
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
  const mongo = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000
  })
  try {
    await mongo.connect()
    const bucket = new GridFSBucket(mongo.db(DB_NAME), { bucketName: 'app_updates' })
    await new Promise<void>((resolve, reject) => {
      const stream = bucket.openDownloadStream(release.fileId)
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('error', reject)
      stream.on('end', () => {
        writeFile(part, Buffer.concat(chunks))
          .then(() => resolve())
          .catch(reject)
      })
    })
  } finally {
    await mongo.close()
  }

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
      .then((ready) => {
        if (ready) spawnHelper(false)
      })
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
  const mongo = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000
  })
  try {
    await mongo.connect()
    return await mongo
      .db(DB_NAME)
      .collection<ReleaseDoc>(RELEASES)
      .findOne({ _id: updateChannel() })
  } finally {
    await mongo.close()
  }
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
    if (!(marker?.version === release.version && marker.sha256 === release.sha256)) {
      await downloadRelease(uri, release)
    }
    const status = await getUpdateStatus()
    if (!status.ready) return { ok: false, message: 'ดาวน์โหลดรุ่นใหม่ไม่สำเร็จ ลองอีกครั้งเมื่อเน็ตดี' }
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ดาวน์โหลดรุ่นใหม่ไม่สำเร็จ'
    return { ok: false, message }
  }
}
