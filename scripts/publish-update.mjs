import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { GridFSBucket } from 'mongodb'
import { RELEASE_CHANNELS, withCompanyDb } from './atlas.mjs'

// Publishing every slot at once goes through scripts/release.mjs, which builds
// Windows 7 separately on Electron 22. This script replaces one slot.
const channel = process.argv[2]
const asarPath = process.argv[3]
if (!RELEASE_CHANNELS.includes(channel) || !asarPath) {
  console.error('usage: node scripts/publish-update.mjs <win|win7|mac> <app.asar>')
  process.exit(1)
}

const version = JSON.parse(readFileSync('package.json', 'utf8')).version

function sha256(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

const digest = await sha256(asarPath)
await withCompanyDb(async (db) => {
  const bucket = new GridFSBucket(db, { bucketName: 'app_updates' })
  const releases = db.collection('app_releases')

  const upload = bucket.openUploadStream(`${channel}-${version}.asar`)
  await new Promise((resolve, reject) => {
    createReadStream(asarPath).pipe(upload).on('error', reject).on('finish', resolve)
  })
  await releases.updateOne(
    { _id: channel },
    { $set: { version, sha256: digest, fileId: upload.id, publishedAt: new Date() } },
    { upsert: true }
  )
  console.log(`published ${channel} ${version} ${digest.slice(0, 12)}`)

  const current = await releases.find({}).toArray()
  const keep = new Set(current.map((release) => String(release.fileId)))
  const stored = await db
    .collection('app_updates.files')
    .find({}, { projection: { _id: 1, filename: 1 } })
    .toArray()
  for (const file of stored) {
    if (keep.has(String(file._id))) continue
    await bucket.delete(file._id).catch(() => undefined)
    console.log(`removed ${file.filename}`)
  }
})
