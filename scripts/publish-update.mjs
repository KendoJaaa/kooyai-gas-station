import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createRequire } from 'node:module'
import { GridFSBucket } from 'mongodb'
import { RELEASE_CHANNELS, withCompanyDb } from './atlas.mjs'

const require = createRequire(import.meta.url)
const { extractFile } = require('@electron/asar')
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const [mode, ...paths] = process.argv.slice(2)
const channels = mode === '--all' ? RELEASE_CHANNELS : [mode]
if (channels.some((channel) => !RELEASE_CHANNELS.includes(channel)) || paths.length !== channels.length) {
  throw new Error('usage: node scripts/publish-update.mjs <win|win7|mac> <app.asar> OR --all <win.asar> <win7.asar> <mac.asar>')
}

function compareVersions(left, right) {
  if (!/^\d+\.\d+\.\d+$/.test(left) || !/^\d+\.\d+\.\d+$/.test(right)) {
    throw new Error('Invalid release version')
  }
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}

async function digest(stream) {
  const hash = createHash('sha256')
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

// Validate every archive before uploading any of them.
const artifacts = []
for (const [index, path] of paths.entries()) {
  const inside = JSON.parse(extractFile(path, 'package.json').toString())
  if (inside.version !== version) throw new Error(`${path} has version ${inside.version}, expected ${version}`)
  artifacts.push({ channel: channels[index], path, sha256: await digest(createReadStream(path)) })
}

await withCompanyDb(async (db, client) => {
  const releases = db.collection('app_releases')
  const bucket = new GridFSBucket(db, { bucketName: 'app_updates' })
  for (const artifact of artifacts) {
    const previous = await releases.findOne({ _id: artifact.channel })
    if (previous && compareVersions(version, previous.version) <= 0) {
      throw new Error(`${artifact.channel} already has ${previous.version}; refusing a same-version update or downgrade`)
    }
  }

  const staged = []
  for (const artifact of artifacts) {
    const filename = `${artifact.channel}-${version}.asar`
    let stored = await db.collection('app_updates.files').findOne({
      filename, 'metadata.sha256': artifact.sha256
    })
    if (!stored) {
      const upload = bucket.openUploadStream(filename, {
        metadata: { channel: artifact.channel, version, sha256: artifact.sha256 }
      })
      await pipeline(createReadStream(artifact.path), upload)
      stored = { _id: upload.id }
    }
    const uploadedHash = await digest(bucket.openDownloadStream(stored._id))
    if (uploadedHash !== artifact.sha256) throw new Error(`Uploaded ${artifact.channel} checksum mismatch`)
    staged.push({ channel: artifact.channel, fileId: stored._id, sha256: uploadedHash })
    console.log(`verified upload ${artifact.channel} ${version} ${uploadedHash.slice(0, 12)}`)
  }

  // Switch all channels together only after every download has been verified.
  const session = client.startSession()
  try {
    await session.withTransaction(async () => {
      for (const artifact of staged) {
        const current = await releases.findOne({ _id: artifact.channel }, { session })
        if (current && compareVersions(version, current.version) <= 0) {
          throw new Error(`${artifact.channel} changed during publication; refusing to overwrite ${current.version}`)
        }
        await releases.updateOne({ _id: artifact.channel }, {
          $set: { version, sha256: artifact.sha256, fileId: artifact.fileId, publishedAt: new Date() }
        }, { upsert: true, session })
      }
    }, { writeConcern: { w: 'majority' } })
  } finally {
    await session.endSession()
  }

  for (const artifact of staged) {
    const live = await releases.findOne({ _id: artifact.channel })
    if (live.version !== version || live.sha256 !== artifact.sha256 || !live.fileId.equals(artifact.fileId)) {
      throw new Error(`Live ${artifact.channel} metadata does not match the verified upload`)
    }
    console.log(`published ${artifact.channel} ${version}`)
  }
  // Keep previous release files so an interrupted rollout can be rolled back.
})
