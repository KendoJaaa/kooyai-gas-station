import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'

const atlas = JSON.parse(readFileSync(new URL('../src/main/atlas.json', import.meta.url), 'utf8'))

export const RELEASE_CHANNELS = ['win', 'win7', 'mac']

// Same rewrite as directMongoUri in src/main/mongo.ts: station DNS refuses SRV lookups.
function directMongoUri(uri) {
  if (!uri.startsWith('mongodb+srv://')) return uri
  const parsed = new URL(uri)
  const database = parsed.pathname.replace(/^\//, '') || atlas.database
  const user = encodeURIComponent(decodeURIComponent(parsed.username))
  const password = encodeURIComponent(decodeURIComponent(parsed.password))
  return `mongodb://${user}:${password}@${atlas.hosts.join(',')}/${database}?tls=true&replicaSet=${atlas.replicaSet}&authSource=admin&retryWrites=true&w=majority`
}

export async function withCompanyDb(work) {
  const file = new URL('../resources/company-db.json', import.meta.url)
  const uri = directMongoUri(JSON.parse(readFileSync(file, 'utf8')).mongodbUri)
  const mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 })
  await mongo.connect()
  try {
    return await work(mongo.db(atlas.database))
  } finally {
    await mongo.close()
  }
}
