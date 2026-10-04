import { version } from '../../package.json'

export const SENTRY_DSN =
  'https://36eeb796cfdcc8dccf90f29a5550226b@o4512192712998912.ingest.us.sentry.io/4512192716734464'

export const SENTRY_RELEASE = `kooyai-gas-station@${version}`

export function scrubSecrets(value: string): string {
  return value.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, 'mongodb://redacted')
}
