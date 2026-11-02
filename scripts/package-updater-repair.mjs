import { copyFile, mkdir, writeFile, chmod, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const { getPath7za } = require('app-builder-lib/out/toolsets/7zip')
const path7za = await getPath7za()
const folder = resolve('dist/Pum-Updater-Repair')
const archive = resolve('dist/Pum-Updater-Repair.zip')
await mkdir(folder, { recursive: true })
for (const [from, name] of [
  ['resources/apply-update.cmd', 'apply-update.cmd'],
  ['resources/apply-update.ps1', 'apply-update.ps1'],
  ['scripts/repair-windows-updater.cmd', 'Repair-Pum.cmd'],
  ['scripts/repair-windows-updater.ps1', 'repair-windows-updater.ps1']
]) await copyFile(from, join(folder, name))
await writeFile(join(folder, 'READ-ME.txt'), [
  'Pum updater repair - no reinstall or app rename',
  '',
  '1. Restart Windows. Do not open Pum yet.',
  '2. Extract ALL files in this ZIP into one folder.',
  '3. Double-click Repair-Pum.cmd.',
  '',
  'The tool repairs only the updater helpers in the existing installation.',
  'It preserves the installed application, database connection, and station records.',
  'The stuck update cache and previous helpers are kept as backups.',
  'If Pum cannot be located automatically, select its installed banthukpum.exe.',
  'This repair does not download or publish a new app release.',
  ''
].join('\r\n'), 'utf8')
await rm(archive, { force: true })
if (process.platform !== 'win32') await chmod(path7za, 0o755)
const zip = spawnSync(path7za, ['a', '-tzip', archive, 'apply-update.cmd', 'apply-update.ps1', 'Repair-Pum.cmd', 'repair-windows-updater.ps1', 'READ-ME.txt'], { cwd: folder, stdio: 'inherit' })
if (zip.status !== 0) throw new Error('Could not package the updater repair')
if (!process.argv.includes('--no-desktop')) {
  await copyFile(archive, join(homedir(), 'Desktop', 'Pum-Updater-Repair.zip'))
}
console.log(`Repair package: ${archive}`)
