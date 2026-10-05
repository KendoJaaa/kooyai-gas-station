import { randomBytes } from 'node:crypto'
import { request as httpsRequest } from 'node:https'
import { createRequire } from 'node:module'
import { app } from 'electron'
import { join } from 'path'
import { SENTRY_DSN, SENTRY_RELEASE, scrubSecrets } from '../shared/sentry'

type SentryMain = typeof import('@sentry/electron/main')

type SyncContext = {
  operation: string
  level?: 'error' | 'warning'
}

// The SDK stores queued events in userData, so the path has to be set first.
app.setPath('userData', join(app.getPath('appData'), 'แบบบันทึกสถานีน้ำมัน'))

let sentry: SentryMain | undefined

// @sentry/electron 8 supports Electron 35 and newer. Windows 7 stays on Electron 22
// and reports through the store API below instead.
const electronMajor = Number(process.versions.electron.split('.')[0] ?? '0')
if (electronMajor >= 35) {
  const require = createRequire(import.meta.url)
  sentry = require('@sentry/electron/main') as SentryMain

  sentry.init({
    dsn: SENTRY_DSN,
    release: SENTRY_RELEASE,
    beforeSend(event) {
      if (event.message) event.message = scrubSecrets(event.message)
      for (const exception of event.exception?.values ?? []) {
        if (exception.value) exception.value = scrubSecrets(exception.value)
      }
      return event
    }
  })
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    error.message = scrubSecrets(error.message)
    return error
  }
  return new Error(scrubSecrets(String(error)))
}

function eventId(): string {
  return randomBytes(16).toString('hex')
}

function postStoreEvent(event: Record<string, unknown>): void {
  try {
    const dsn = new URL(SENTRY_DSN)
    const project = dsn.pathname.replace(/^\//, '')
    const body = JSON.stringify(event)
    const req = httpsRequest(
      {
        hostname: dsn.hostname,
        path: `/api/${project}/store/`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=kooyai/${app.getVersion()}, sentry_key=${dsn.username}`
        }
      },
      (response) => {
        response.resume()
      }
    )
    req.on('error', () => undefined)
    req.end(body)
  } catch {
    // Reporting must never block a local save.
  }
}

function commonTags(operation: string): Record<string, string> {
  return {
    area: 'sync',
    operation,
    electron: process.versions.electron,
    platform: process.platform
  }
}

export function reportSyncFailure(error: unknown, context: SyncContext): void {
  const err = asError(error)
  const tags = commonTags(context.operation)
  const level = context.level ?? 'error'

  if (sentry) {
    sentry.captureException(err, { level, tags, extra: tags })
    return
  }

  postStoreEvent({
    event_id: eventId(),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level,
    logger: 'sync',
    release: SENTRY_RELEASE,
    environment: 'production',
    exception: {
      values: [{ type: err.name, value: err.message }]
    },
    tags,
    extra: tags
  })
}

export function reportSyncSkipped(operation: string, reason: string): void {
  reportSyncFailure(new Error(reason), { operation, level: 'warning' })
}
