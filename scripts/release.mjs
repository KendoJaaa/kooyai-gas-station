import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { RELEASE_CHANNELS, withCompanyDb } from './atlas.mjs'

// One command for a release: next version, Windows + Mac on the current Electron,
// Windows 7 on Electron 22, each update slot gets its own app.asar.
// The folder name contains ":", so tools are run by file path, not from node_modules/.bin.

const require = createRequire(import.meta.url)
const { extractFile } = require('@electron/asar')

const RELEASE_DIR = 'dist/release'
const DESKTOP = join(homedir(), 'Desktop')

function run(args, extraEnv = {}) {
  const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', ...extraEnv }
  if (!('ELECTRON_MAJOR_VER' in extraEnv)) delete env.ELECTRON_MAJOR_VER
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`${args.join(' ')} exited with code ${code}`))
    })
  })
}

function parts(version) {
  return version.split('.').map((part) => Number(part) || 0)
}

function compareVersions(left, right) {
  const a = parts(left)
  const b = parts(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function bumpPatch(version) {
  const [major = 0, minor = 0, patch = 0] = parts(version)
  return `${major}.${minor}.${patch + 1}`
}

// Stations only download a version higher than the one they run.
async function nextVersion() {
  const local = JSON.parse(readFileSync('package.json', 'utf8')).version
  const published = await withCompanyDb((db) =>
    db.collection('app_releases').find({}, { projection: { version: 1 } }).toArray()
  )
  const cloud = published
    .map((release) => release.version)
    .filter((version) => typeof version === 'string')
    .sort(compareVersions)
    .at(-1)
  if (!cloud || compareVersions(local, cloud) > 0) return local
  return bumpPatch(cloud)
}

function setVersion(version) {
  const text = readFileSync('package.json', 'utf8')
  writeFileSync('package.json', text.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`))
}

function productName() {
  const match = /^productName:\s*(.+)$/m.exec(readFileSync('electron-builder.yml', 'utf8'))
  if (!match) throw new Error('productName missing from electron-builder.yml')
  return match[1].trim()
}

function keepAsar(from, channel, version) {
  if (!existsSync(from)) throw new Error(`missing ${from}`)
  const inside = JSON.parse(extractFile(from, 'package.json').toString()).version
  if (inside !== version) throw new Error(`${from} is ${inside}, expected ${version}`)
  const to = join(RELEASE_DIR, `${channel}.asar`)
  copyFileSync(from, to)
  return to
}

const version = await nextVersion()
setVersion(version)
mkdirSync(RELEASE_DIR, { recursive: true })
console.log(`\nRelease ${version}: Windows, Windows 7, Mac\n`)

await run(['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.node.json', '--composite', 'false'])
await run(['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.web.json', '--composite', 'false'])

await run(['node_modules/electron-vite/bin/electron-vite.js', 'build'])
await run(['node_modules/electron-builder/cli.js', '--win', '--x64'])
const asars = { win: keepAsar('dist/win-unpacked/resources/app.asar', 'win', version) }

await run(['node_modules/electron-builder/cli.js', '--mac', 'dmg'])
asars.mac = keepAsar(
  join('dist/mac-arm64', `${productName()}.app`, 'Contents/Resources/app.asar'),
  'mac',
  version
)

await run(['node_modules/electron-vite/bin/electron-vite.js', 'build'], { ELECTRON_MAJOR_VER: '22' })
await run(['node_modules/electron-builder/cli.js', '--win', '--config', 'electron-builder.win7.yml'])
asars.win7 = keepAsar('dist/win-ia32-unpacked/resources/app.asar', 'win7', version)

for (const channel of RELEASE_CHANNELS) {
  await run(['scripts/publish-update.mjs', channel, asars[channel]])
}

const installers = [
  ['dist/ปั้ม.exe', 'Pum.exe'],
  ['dist/ปั้ม-Windows7-ia32.exe', 'Pum-Windows7-32bit.exe'],
  ['dist/ปั้ม-Mac.dmg', 'Pum-Mac.dmg']
]
for (const [from, name] of installers) copyFileSync(from, join(DESKTOP, name))

console.log(`\nReleased ${version} to win, win7, and mac.`)
console.log(`Installers on the Desktop: ${installers.map(([, name]) => name).join(', ')}`)
console.log('Commit and push package.json with this version.')
