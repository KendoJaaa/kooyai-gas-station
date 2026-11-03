import { copyFile, mkdir, writeFile, readFile, chmod, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const { getPath7za } = require('app-builder-lib/out/toolsets/7zip')
const path7za = await getPath7za()
const folder = resolve('dist/Pum-Updater-Repair')
const archive = resolve('dist/Pum-Updater-Repair.zip')
await rm(folder, { recursive: true, force: true })
await mkdir(folder, { recursive: true })
const entries = []
for (const [from, name] of [
  ['resources/apply-update.cmd', 'apply-update.cmd'],
  ['resources/apply-update.ps1', 'apply-update.ps1'],
  ['scripts/repair-windows-updater.ps1', 'repair-windows-updater.ps1']
]) {
  const source = (await readFile(from, 'utf8')).replace(/^\uFEFF/, '').replace(/\r?\n/g, '\r\n')
  // Windows PowerShell 2.0 needs a UTF-8 BOM for the Thai interface.
  const bytes = Buffer.from((name.endsWith('.ps1') ? '\uFEFF' : '') + source, 'utf8')
  await writeFile(join(folder, name), bytes)
  entries.push(name + '|' + bytes.toString('base64'))
}
const payload = entries.join('\n')
const digest = createHash('sha256').update(payload).digest('hex')
const bootstrap = (await readFile('scripts/repair-bootstrap.ps1', 'utf8')).replace('__PUM_PAYLOAD_HASH__', digest)
const command = '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoLogo -NoProfile -STA -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' + Buffer.from(bootstrap, 'utf16le').toString('base64')
if (command.length > 7800) throw new Error('Repair launcher exceeds the Windows CMD command-line limit (' + command.length + ')')
const launcher = [
  '@echo off', 'setlocal DisableDelayedExpansion', 'title Pum repair',
  'set "PUM_REPAIR_SELF=%~f0"', command, 'exit /b %errorlevel%',
  ':__PUM_REPAIR_FILES__', ...entries, ''
].join('\r\n')
await writeFile(join(folder, 'Repair-Pum.cmd'), launcher, 'ascii')
await writeFile(join(folder, 'READ-ME.txt'), '\uFEFF' + [
  'ซ่อมโปรแกรมบันทึกปั้ม', '',
  '1. รีสตาร์ต Windows ก่อน และยังไม่ต้องเปิดโปรแกรมบันทึกปั้ม',
  '2. เปิดไฟล์ Repair-Pum.cmd แล้วรอจนเสร็จ',
  '3. ถ้า Windows ขออนุญาตให้ซ่อมโปรแกรม ให้กด Yes',
  '',
  'ไฟล์ Repair-Pum.cmd รวมทุกอย่างไว้แล้ว ไม่ต้องหาไฟล์อื่นเพิ่ม',
  'เมื่อซ่อมสำเร็จ โปรแกรมบันทึกปั้มจะเปิดให้เอง',
  'ถ้ามีข้อความผิดพลาด ให้ส่งภาพข้อความพร้อมรหัสให้ผู้ดูแล ไม่ต้องเลือกไฟล์โปรแกรมเอง',
  '',
  'การซ่อมนี้ไม่ถอนการติดตั้ง ไม่เปลี่ยนชื่อโปรแกรม และไม่ลบข้อมูลบันทึกสถานี',
  'ยังไม่ใช่การอัปเดตโปรแกรมรุ่นใหม่ และอาจไม่แก้ปัญหาที่เกิดจากสาเหตุอื่น', ''
].join('\r\n'), 'utf8')
await rm(archive, { force: true })
if (process.platform !== 'win32') await chmod(path7za, 0o755)
const zip = spawnSync(path7za, ['a', '-tzip', archive, 'Repair-Pum.cmd', 'READ-ME.txt'], { cwd: folder, stdio: 'inherit' })
if (zip.status !== 0) throw new Error('Could not package the updater repair')
if (!process.argv.includes('--no-desktop')) {
  await copyFile(archive, join(homedir(), 'Desktop', 'Pum-Updater-Repair.zip'))
  await copyFile(join(folder, 'Repair-Pum.cmd'), join(homedir(), 'Desktop', 'Repair-Pum.cmd'))
}
console.log('Single-file repair: ' + join(folder, 'Repair-Pum.cmd'))
console.log('Repair package: ' + archive)
