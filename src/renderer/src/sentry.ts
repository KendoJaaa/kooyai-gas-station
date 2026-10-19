import { SENTRY_DSN } from '../../shared/sentry'

// The page cannot read process. Electron 22 on Windows 7 cannot load this SDK.
const electronMajor = Number(navigator.userAgent.match(/Electron\/(\d+)/)?.[1] ?? '0')
if (electronMajor >= 35) {
  void import('@sentry/electron/renderer').then((Sentry) => {
    Sentry.init({
      dsn: SENTRY_DSN
    })
  })
}
