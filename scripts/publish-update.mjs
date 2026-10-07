import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { MongoClient, GridFSBucket } from 'mongodb'

const CHANNELS = ['win', 'win7', 'mac']
const requested = process.argv[2] ?? 'all'
const asarPath = process.argv[3]
const channels = requested === 'all' ? CHANNELS : [requested]

if (!channels.every((channel) => CHANNELS.includes(channel)) || !asarPath) {
  console.error('usage: node scripts/publish-update.mjs [all|win|win7|mac] <app.asar>')
  process.exit(1)
}

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const atlas = JSON.parse(readFileSync(new URL('../src/main/atlas.json', import.meta.url), 'utf8'))

function directMongoUri(uri) {
  if (!uri.startsWith('mongodb+srv://')) return uri
  const parsed = new URL(uri)
  const database = parsed.pathname.replace(/^\//, '') || atlas.database
  const user = encodeURIComponent(decodeURIComponent(parsed.username))
  const password = encodeURIComponent(decodeURIComponent(parsed.password))
  return `mongodb://${user}:${password}@${atlas.hosts.join(',')}/${database}?tls=true&replicaSet=${atlas.replicaSet}&authSource=admin&retryWrites=true&w=majority`
}

const uri = directMongoUri(JSON.parse(readFileSync('resources/company-db.json', 'utf8')).mongodbUri)

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

  for (const channel of channels) {
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
  }

  const current = await releases.find({}).toArray()
  const keep = new Set(current.map((release) => String(release.fileId)))
  const stored = await db.collection('app_updates.files').find({}, { projection: { _id: 1, filename: 1 } }).toArray()
  for (const file of stored) {
    if (keep.has(String(file._id))) continue
    await bucket.delete(file._id).catch(() => undefined)
    console.log(`removed ${file.filename}`)
  }
} finally {
  await mongo.close()
}
