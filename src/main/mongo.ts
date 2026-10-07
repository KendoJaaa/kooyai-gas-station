import { MongoClient, type Collection, type Db } from 'mongodb'
import { isAppStore, migrateStore, type AppStore } from '../shared/store'
import atlas from './atlas.json'

const DB_NAME = atlas.database
const COLLECTION = 'stations'
const DOC_ID = 'kooyai-station'

type StationDoc = {
  _id: string
  store: AppStore
}

export function directMongoUri(uri: string): string {
  const trimmed = uri.trim()
  if (!trimmed.startsWith('mongodb+srv://')) return trimmed
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return trimmed
  }
  const database = parsed.pathname.replace(/^\//, '') || DB_NAME
  const user = encodeURIComponent(decodeURIComponent(parsed.username))
  const password = encodeURIComponent(decodeURIComponent(parsed.password))
  return `mongodb://${user}:${password}@${atlas.hosts.join(',')}/${database}?tls=true&replicaSet=${atlas.replicaSet}&authSource=admin&retryWrites=true&w=majority`
}

// The only place a Mongo client is opened. Callers cannot use the SRV address.
export async function withDatabase<T>(uri: string, work: (db: Db) => Promise<T>): Promise<T> {
  const mongo = new MongoClient(directMongoUri(uri), {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000
  })
  try {
    await mongo.connect()
    return await work(mongo.db(DB_NAME))
  } finally {
    await mongo.close()
  }
}

async function withCollection<T>(
  uri: string,
  work: (collection: Collection<StationDoc>) => Promise<T>
): Promise<T> {
  return withDatabase(uri, (db) => work(db.collection<StationDoc>(COLLECTION)))
}

export function isMongoUri(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('mongodb://') || trimmed.startsWith('mongodb+srv://')
}

export async function pullRemoteStore(uri: string): Promise<AppStore | null> {
  return withCollection(uri, async (collection) => {
    const doc = await collection.findOne({ _id: DOC_ID })
    if (!doc?.store || !isAppStore(doc.store)) return null
    return migrateStore(doc.store)
  })
}

export async function pushRemoteStore(uri: string, store: AppStore): Promise<void> {
  await withCollection(uri, async (collection) => {
    await collection.updateOne(
      { _id: DOC_ID },
      { $set: { store } },
      { upsert: true }
    )
  })
}

export async function testMongoUri(uri: string): Promise<void> {
  await withCollection(uri, async (collection) => {
    await collection.findOne({ _id: DOC_ID })
  })
}
