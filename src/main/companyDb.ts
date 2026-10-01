import { readFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { isMongoUri } from './mongo'

type CompanyDbFile = {
  mongodbUri?: unknown
}

function uriFromFile(parsed: CompanyDbFile): string {
  return typeof parsed.mongodbUri === 'string' ? parsed.mongodbUri.trim() : ''
}

async function readUriFile(path: string): Promise<string> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as CompanyDbFile
    const uri = uriFromFile(parsed)
    return isMongoUri(uri) ? uri : ''
  } catch {
    return ''
  }
}

// One company, one database. Every installer reads the same file.
// A per-machine URI is intentionally not used.
export async function companyDatabaseUri(): Promise<string> {
  const fromEnv = process.env.KOOYAI_MONGODB_URI?.trim() ?? ''
  if (isMongoUri(fromEnv)) return fromEnv

  const packaged = await readUriFile(join(process.resourcesPath, 'company-db.json'))
  if (packaged) return packaged

  return readUriFile(join(app.getAppPath(), 'resources', 'company-db.json'))
}
