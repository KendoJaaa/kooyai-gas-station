import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { MongoClient, GridFSBucket } from 'mongodb'

const channel = process.argv[2]
const asarPath = process.argv[3]
if ((channel !== 'win' && channel !== 'win7') || !asarPath) {
  console.error('usage: node scripts/publish-update.mjs <win|win7> <app.asar>')
  process.exit(1)
}

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const uri = JSON.parse(readFileSync('resources/company-db.json', 'utf8')).mongodbUri

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
const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
await mongo.connect()
try {
  const db = mongo.db('kooyai')
  const bucket = new GridFSBucket(db, { bucketName: 'app_updates' })
  const releases = db.collection('app_releases')
  const previous = await releases.findOne({ _id: channel })
  const upload = bucket.openUploadStream(`${channel}-${version}.asar`)
  await new Promise((resolve, reject) => {
    createReadStream(asarPath).pipe(upload).on('error', reject).on('finish', resolve)
  })
  await releases.updateOne(
    { _id: channel },
    {
      $set: {
        version,
        sha256: digest,
        fileId: upload.id,
        publishedAt: new Date()
      }
    },
    { upsert: true }
  )
  if (previous?.fileId && String(previous.fileId) !== String(upload.id)) {
    await bucket.delete(previous.fileId).catch(() => undefined)
  }
  console.log(`published ${channel} ${version} ${digest.slice(0, 12)}`)
} finally {
  await mongo.close()
}
