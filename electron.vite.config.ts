import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { version } from './package.json'

const env = loadEnv(process.env.NODE_ENV ?? 'production', process.cwd(), '')
const sentryBuildEnv = readSentryBuildEnv()
const sentryRelease = `kooyai-gas-station@${version}`

let warnedAboutSentry = false

function readSentryBuildEnv(): Record<string, string> {
  const path = resolve('.env.sentry-build-plugin')
  if (!existsSync(path)) return {}
  const values: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim()
  }
  return values
}

function sentryPlugins() {
  const authToken = process.env.SENTRY_AUTH_TOKEN || env.SENTRY_AUTH_TOKEN || sentryBuildEnv.SENTRY_AUTH_TOKEN
  const org = process.env.SENTRY_ORG || env.SENTRY_ORG || sentryBuildEnv.SENTRY_ORG || 'kooyai-gas-station'
  const project = process.env.SENTRY_PROJECT || env.SENTRY_PROJECT || sentryBuildEnv.SENTRY_PROJECT || 'kooyai-gas-station'
  if (!authToken) {
    if (!warnedAboutSentry) {
      warnedAboutSentry = true
      console.warn(
        'Sentry source maps were not uploaded. Add SENTRY_AUTH_TOKEN to .env.sentry-build-plugin.'
      )
    }
    return []
  }
  return [sentryVitePlugin({
    url: 'https://sentry.io',
    org,
    project,
    authToken,
    telemetry: false,
    release: { name: sentryRelease },
    sourcemaps: {
      assets: './out/**/*.{js,map}',
      filesToDeleteAfterUpload: ['./out/**/*.map']
    }
  })]
}

export default defineConfig({
  main: {
    plugins: sentryPlugins(),
    build: { sourcemap: 'hidden' }
  },
  preload: {
    plugins: sentryPlugins(),
    build: { sourcemap: 'hidden' }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), ...sentryPlugins()],
    build: { sourcemap: 'hidden' },
    server: {
      fs: {
        // Folder name contains ":", which Vite's strict file check rejects.
        strict: false
      }
    }
  }
})
