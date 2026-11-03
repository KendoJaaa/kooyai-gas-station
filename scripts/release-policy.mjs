// Mac installers are distributed manually; Atlas stores only Windows updates.
export const RELEASE_CHANNELS = ['win', 'win7']

// Conservative free-tier budget, including indexes. Keep space for station data
// and GridFS document/index overhead while retaining previous Windows releases.
const FREE_STORAGE_BYTES = 500_000_000
const RESERVED_BYTES = 32 * 1024 * 1024

export async function readAtlasStorage(client) {
  // authorizedDatabases:false must succeed: a partial inventory could hide
  // another application's data that consumes the same cluster allowance.
  const inventory = await client.db('admin').command({
    listDatabases: 1, nameOnly: true, authorizedDatabases: false
  })
  if (!Array.isArray(inventory.databases)) {
    throw new Error('Publication blocked: cannot verify the Atlas database inventory.')
  }
  const names = inventory.databases.map((entry) => entry.name)
  if (names.some((name) => typeof name !== 'string' || !name)) {
    throw new Error('Publication blocked: cannot verify the Atlas database inventory.')
  }
  const databases = names.filter((name) => !['admin', 'config', 'local'].includes(name))
  const sizes = await Promise.all(databases.map((name) => client.db(name).command({ dbStats: 1, scale: 1 })))
  if (sizes.some((stats) => [stats.dataSize, stats.indexSize].some((size) => !Number.isFinite(size) || size < 0))) {
    throw new Error('Publication blocked: cannot verify Atlas storage capacity.')
  }
  return sizes.reduce((total, stats) => ({
    dataSize: total.dataSize + stats.dataSize,
    indexSize: total.indexSize + stats.indexSize
  }), { dataSize: 0, indexSize: 0 })
}

export function assertAtlasCapacity(stats, uploadBytes) {
  const sizes = [stats.dataSize, stats.indexSize, uploadBytes]
  if (sizes.some((size) => !Number.isFinite(size) || size < 0)) {
    throw new Error('Publication blocked: cannot verify Atlas storage capacity.')
  }
  const projected = stats.dataSize + stats.indexSize + uploadBytes
  if (projected > FREE_STORAGE_BYTES - RESERVED_BYTES) {
    throw new Error('Publication blocked: the new Windows archives would leave insufficient free-tier space for station records. Archive older updates locally or increase Atlas storage before publishing.')
  }
}
