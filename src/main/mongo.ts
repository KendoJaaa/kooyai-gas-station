import { MongoClient, type Collection } from 'mongodb'
import { isAppStore, migrateStore, type AppStore } from '../shared/store'

const DB_NAME = 'kooyai'
const COLLECTION = 'stations'
const DOC_ID = 'kooyai-station'

type StationDoc = {
  _id: string
  store: AppStore
}

function client(uri: string): MongoClient {
  return new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000
  })
}

async function withCollection<T>(
  uri: string,
  work: (collection: Collection<StationDoc>) => Promise<T>
): Promise<T> {
  const mongo = client(uri)
  try {
    await mongo.connect()
    return await work(mongo.db(DB_NAME).collection<StationDoc>(COLLECTION))
  } finally {
    await mongo.close()
  }
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
