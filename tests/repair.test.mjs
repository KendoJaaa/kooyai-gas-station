import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const windows = process.platform === 'win32'
const ps = process.env.KOOYAI_TEST_POWERSHELL || 'powershell.exe'
const coordinator = await readFile('scripts/repair-windows-updater.ps1', 'utf8')
const run = (args) => spawnSync(ps, ['-NoProfile', '-STA', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { encoding: 'utf8', timeout: 30_000 })
const exists = async (path) => access(path).then(() => true, () => false)
const result = async (path) => Object.fromEntries((await readFile(path, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.split(/=(.*)/s).slice(0, 2)))

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "Pum repair [ทดสอบ] & O'Neil "))
  const resources = join(root, 'installed app', 'resources')
  const source = join(root, 'repair files')
  const appData = join(root, 'user data')
  const output = join(root, 'results')
  await Promise.all([mkdir(resources, { recursive: true }), mkdir(source), mkdir(join(appData, 'kooyai-update'), { recursive: true })])
  const exe = join(root, 'installed app', 'banthukpum.exe')
  await writeFile(exe, 'fixture executable - not launched')
  await writeFile(join(resources, 'app.asar'), 'original program archive')
  await writeFile(join(resources, 'company-db.json'), '{"mongodbUri":"fixture-only"}')
  await writeFile(join(appData, 'station.json'), 'important station records')
  await writeFile(join(appData, 'kooyai-update', 'ready.json'), 'stalled marker')
  await writeFile(join(resources, 'apply-update.cmd'), 'original cmd helper')
  await writeFile(join(resources, 'apply-update.ps1'), 'original powershell helper')
  for (const [from, to] of [['resources/apply-update.cmd', 'apply-update.cmd'], ['resources/apply-update.ps1', 'apply-update.ps1']]) {
    await copyFile(from, join(source, to))
  }
  await writeFile(join(source, 'repair-windows-updater.ps1'), '\uFEFF' + coordinator)
  t.after(async () => {
    if (windows) spawnSync('attrib.exe', ['-R', join(resources, 'apply-update.cmd')])
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  const invoke = () => run(['-File', join(source, 'repair-windows-updater.ps1'), '-AppExe', exe, '-AppDataPath', appData, '-ResultRoot', output, '-Quiet', '-NoLaunch'])
  const unchanged = async () => {
    assert.equal(await readFile(join(resources, 'apply-update.cmd'), 'utf8'), 'original cmd helper')
    assert.equal(await readFile(join(resources, 'apply-update.ps1'), 'utf8'), 'original powershell helper')
    assert.equal(await readFile(join(resources, 'app.asar'), 'utf8'), 'original program archive')
    assert.equal(await readFile(join(resources, 'company-db.json'), 'utf8'), '{"mongodbUri":"fixture-only"}')
    assert.equal(await readFile(join(appData, 'station.json'), 'utf8'), 'important station records')
  }
  return { root, resources, source, appData, output, exe, invoke, unchanged }
}

test('single-file repair contains all payloads, a checksum, CRLF and a bounded CMD command line', async () => {
  const packed = spawnSync(process.execPath, ['scripts/package-updater-repair.mjs', '--no-desktop'], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(packed.status, 0, packed.stdout + packed.stderr)
  const cmd = await readFile('dist/Pum-Updater-Repair/Repair-Pum.cmd', 'ascii')
  assert.ok(!/(?<!\r)\n/.test(cmd))
  const lines = cmd.trimEnd().split('\r\n')
  const index = lines.indexOf(':__PUM_REPAIR_FILES__')
  assert.equal(lines.length - index - 1, 3)
  const command = lines.find((line) => line.includes('-EncodedCommand '))
  assert.ok(command.length < 7800)
  assert.ok(command.includes('-STA'))
  const boot = Buffer.from(command.split('-EncodedCommand ')[1], 'base64').toString('utf16le')
  const payload = lines.slice(index + 1).join('\n')
  const digest = createHash('sha256').update(payload).digest('hex')
  assert.ok(boot.includes(digest))
  const files = Object.fromEntries(lines.slice(index + 1).map((line) => {
    const separator = line.indexOf('|')
    return [line.slice(0, separator), Buffer.from(line.slice(separator + 1), 'base64')]
  }))
  assert.deepEqual(Object.keys(files).sort(), ['apply-update.cmd', 'apply-update.ps1', 'repair-windows-updater.ps1'])
  assert.equal(files['repair-windows-updater.ps1'].subarray(0, 3).toString('hex'), 'efbbbf')
  assert.ok(files['repair-windows-updater.ps1'].toString('utf8').includes('ซ่อมเสร็จแล้ว'))
})

test('missing helper is rejected before any installation or cache change', { skip: !windows }, async (t) => {
  const f = await fixture(t)
  await rm(join(f.source, 'apply-update.cmd'))
  const repair = f.invoke()
  assert.equal(repair.status, 1, repair.stderr)
  assert.equal((await result(join(f.output, 'last-result.txt'))).code, 'R01')
  await f.unchanged()
  assert.equal(await readFile(join(f.appData, 'kooyai-update', 'ready.json'), 'utf8'), 'stalled marker')
})

test('read-only target is rejected before either helper or cache changes', { skip: !windows }, async (t) => {
  const f = await fixture(t)
  assert.equal(spawnSync('attrib.exe', ['+R', join(f.resources, 'apply-update.cmd')]).status, 0)
  const repair = f.invoke()
  assert.equal(repair.status, 1, repair.stderr)
  assert.equal((await result(join(f.output, 'last-result.txt'))).code, 'R04')
  await f.unchanged()
  assert.ok(await exists(join(f.appData, 'kooyai-update', 'ready.json')))
})

test('a second-file lock restores the first helper instead of leaving a partial repair', { skip: !windows }, async (t) => {
  const f = await fixture(t)
  const lock = join(f.root, 'lock.ps1')
  const signal = join(f.root, 'locked.txt')
  const stop = join(f.root, 'stop.txt')
  await writeFile(lock, 'param($Path,$Signal,$Stop)\n$stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)\ntry {[IO.File]::WriteAllText($Signal,"locked");while(![IO.File]::Exists($Stop)){Start-Sleep -Milliseconds 100}}finally{$stream.Dispose()}\n')
  const holder = spawn(ps, ['-NoProfile', '-NonInteractive', '-File', lock, join(f.resources, 'apply-update.cmd'), signal, stop], { stdio: 'ignore' })
  try {
    const deadline = Date.now() + 10_000
    while (!(await exists(signal)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
    assert.ok(await exists(signal), 'lock holder started')
    const repair = f.invoke()
    assert.equal(repair.status, 1, repair.stderr)
    assert.equal((await result(join(f.output, 'last-result.txt'))).code, 'R06')
    await f.unchanged()
    assert.equal(await exists(join(f.appData, 'kooyai-update')), false, 'the blocked startup marker stays quarantined')
  } finally {
    await writeFile(stop, 'stop')
    await new Promise((r) => holder.exitCode !== null ? r() : holder.once('exit', r))
  }
})

test('repair is repeatable, preserves originals, and does not claim to have opened an app under NoLaunch', { skip: !windows }, async (t) => {
  const f = await fixture(t)
  for (const attempt of [1, 2]) {
    const repair = f.invoke()
    assert.equal(repair.status, 0, repair.stderr)
    const status = await result(join(f.output, 'last-result.txt'))
    assert.equal(status.status, 'repaired')
    assert.equal(status.pid, '0')
    for (const name of ['apply-update.cmd', 'apply-update.ps1']) {
      assert.deepEqual(await readFile(join(f.resources, name)), await readFile(join(f.source, name)))
    }
    assert.equal(await readFile(join(f.appData, 'station.json'), 'utf8'), 'important station records')
  }
})

test('damaged single-file CMD fails its checksum before invoking the repair', { skip: !windows }, async (t) => {
  const f = await fixture(t)
  const standalone = join(f.root, 'Repair-Pum.cmd')
  const cmd = await readFile('dist/Pum-Updater-Repair/Repair-Pum.cmd', 'ascii')
  await writeFile(standalone, cmd.replace('apply-update.ps1|', 'apply-update.ps1|A'), 'ascii')
  const repair = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', '""' + standalone + '""'], {
    windowsVerbatimArguments: true, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, GITHUB_ACTIONS: 'true', KOOYAI_REPAIR_AUTOMATED: '1' }
  })
  assert.equal(repair.status, 1, repair.stdout + repair.stderr)
  assert.ok(repair.stderr.includes('damaged'), repair.stderr)
  await f.unchanged()
  assert.ok(await exists(join(f.appData, 'kooyai-update', 'ready.json')))
})
