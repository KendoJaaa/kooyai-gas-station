import { createRequire } from 'node:module'
import { app } from 'electron'
import { join } from 'path'
import { SENTRY_DSN, SENTRY_RELEASE, scrubSecrets } from '../shared/sentry'

// The SDK stores queued events in userData, so the path has to be set first.
app.setPath('userData', join(app.getPath('appData'), 'แบบบันทึกสถานีน้ำมัน'))

// @sentry/electron 8 supports Electron 35 and newer. Windows 7 stays on Electron 22.
const electronMajor = Number(process.versions.electron.split('.')[0] ?? '0')
if (electronMajor >= 35) {
  const require = createRequire(import.meta.url)
  const Sentry = require('@sentry/electron/main') as typeof import('@sentry/electron/main')

  Sentry.init({
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
