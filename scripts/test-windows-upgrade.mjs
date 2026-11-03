// Runs on a disposable Windows VM, using test-only company configuration and data.
// Exercises the real NSIS installer, packaged Electron app, and updater together.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile, copyFile, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { build as bundle } from 'esbuild'
import { build, Platform, Arch } from 'electron-builder'
import { x as extractTar } from 'tar'

if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Run this installer test only on a disposable GitHub Actions Windows VM')
}
const win7 = process.env.KOOYAI_TEST_TARGET === 'win7'
// Vite resolves entry files to long paths, so its root must not use RUNNER~1.
const root = await realpath(await mkdtemp(join(tmpdir(), 'Pum upgrade & ทดสอบ ')))
const screenshots = resolve('test-results', win7 ? 'win7' : 'win')
await mkdir(screenshots, { recursive: true })
// Include the exact historical installation path that the old cleanup macro
// deleted before trying to run its uninstaller.
const installDir = join(process.env.LOCALAPPDATA, 'Programs', 'kooyai-gas-station')
// Electron resolves appData through the Windows shell, not an APPDATA override.
// The dedicated CI VM has no real station installation or records.
const appData = process.env.APPDATA
const updateDir = join(appData, 'kooyai-update')
const exe = join(installDir, 'banthukpum.exe')
const installedAsar = join(installDir, 'resources', 'app.asar')
await mkdir(updateDir, { recursive: true })
const companyConfig = join(root, 'company-db.json')
await writeFile(companyConfig, JSON.stringify({ mongodbUri: '' }))
const digest = async (path) => createHash('sha256').update(await readFile(path)).digest('hex')
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms))

async function run(command, args, options = {}) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Timed out: ${command}`)) }, 180_000)
    child.once('error', reject)
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolveRun()
      else reject(new Error(`${command} exited with ${code}`))
    })
  })
}

async function until(check, label, timeout = 60_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { const value = await check(); if (value) return value } catch { /* starting or swapping */ }
    await delay(250)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function makeInstaller(version, projectDir = process.cwd()) {
  const output = join(root, `build-${version}`)
  await build({
    projectDir,
    publish: 'never',
    targets: Platform.WINDOWS.createTarget(['nsis'], win7 ? Arch.ia32 : Arch.x64),
    config: {
      extends: join(projectDir, win7 ? 'electron-builder.win7.yml' : 'electron-builder.yml'),
      directories: { output },
      extraMetadata: { version },
      // No production database configuration or build credentials enter this test.
      extraResources: [{ from: companyConfig, to: 'company-db.json' }],
      nsis: {
        artifactName: 'Setup-${version}.exe',
        perMachine: false, runAfterFinish: false
      },
      publish: null
    }
  })
  return {
    installer: join(output, `Setup-${version}.exe`),
    archive: join(output, win7 ? 'win-ia32-unpacked' : 'win-unpacked', 'resources', 'app.asar')
  }
}

async function install(installer) {
  // NSIS /D consumes the remaining command line and must not be quoted.
  await run(installer, ['/S', `/D=${installDir}`], { windowsVerbatimArguments: true })
}

async function legacySource() {
  // Compile the real older source, rather than relabelling the fixed code.
  const legacy = join(root, 'legacy source')
  const archive = join(root, 'legacy-source.tar')
  await mkdir(legacy)
  await run('git', ['archive', '--format=tar', '-o', archive, '110d800fcfd584e31d2f5e60592b92d42f2f05c5'])
  // The Windows tar.exe build loses Thai characters in command-line paths.
  await extractTar({ file: archive, cwd: legacy })
  await symlink(resolve('node_modules'), join(legacy, 'node_modules'), 'junction')
  await run(process.execPath, [resolve('node_modules/electron-vite/bin/electron-vite.js'), 'build'], {
    cwd: legacy, env: { ...process.env, ELECTRON_MAJOR_VER: win7 ? '22' : '39' }
  })
  return legacy
}

function parseRepairResult(text) {
  return Object.fromEntries(text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => {
    const equals = line.indexOf('=')
    return [line.slice(0, equals), line.slice(equals + 1)]
  }))
}

async function closeVisiblePum() {
  const script = join(root, 'close-visible-pum.ps1')
  await writeFile(script, [
    'param($AppExe)',
    '$deadline=[DateTime]::UtcNow.AddSeconds(30)',
    'while([DateTime]::UtcNow -lt $deadline){',
    'foreach($p in @(Get-Process -Name banthukpum -ErrorAction SilentlyContinue)){',
    'if($p.MainModule.FileName -ieq $AppExe -and $p.MainWindowHandle -ne [IntPtr]::Zero){',
    'if(!$p.CloseMainWindow()){throw "Cannot close Pum"}',
    'if(!$p.WaitForExit(30000)){throw "Pum did not exit"}',
    'exit 0',
    '}}',
    'Start-Sleep -Milliseconds 200',
    '}',
    'throw "Pum did not open a visible window"'
  ].join('\r\n'))
  await run('powershell.exe', ['-NoProfile', '-File', script, exe])
}

async function openApp(version, screenshotName) {
  const server = createServer()
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const port = server.address().port
  await new Promise((resolveClose) => server.close(resolveClose))
  const child = spawn(exe, [`--remote-debugging-port=${port}`], {
    env: { ...process.env, APPDATA: appData, KOOYAI_MONGODB_URI: '' }, stdio: 'inherit'
  })
  const target = await until(async () => {
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    return pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl)
  }, `Electron ${version} renderer`)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  const requests = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) { requests.get(message.id)?.(message); requests.delete(message.id) }
  })
  async function cdp(method, params = {}) {
    const id = ++nextId
    const response = await new Promise((resolveMessage, reject) => {
      const timer = setTimeout(() => { requests.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15_000)
      requests.set(id, (message) => { clearTimeout(timer); resolveMessage(message) })
      socket.send(JSON.stringify({ id, method, params }))
    })
    if (response.error) throw new Error(JSON.stringify(response.error))
    return response.result
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await until(async () => {
    const status = await evaluate('window.api?.getUpdateStatus()')
    return status?.current === version
  }, `app version ${version}`)
  await until(async () => (await evaluate('document.body.innerText')).includes('บันทึกปั้ม'), 'visible app')
  const image = await cdp('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(screenshots, `${screenshotName}.png`), Buffer.from(image.data, 'base64'))
  return {
    evaluate,
    async close() {
      await evaluate('window.close()').catch(() => undefined)
      socket.close()
      await until(() => child.exitCode !== null, 'app exit')
    }
  }
}

const fixtureBundle = await bundle({
  stdin: { contents: "export { emptyStore } from './src/shared/store'; export { emptyDay } from './src/shared/reports'; export { DEFAULT_STATION } from './src/shared/station'", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false
})
const { emptyStore, emptyDay, DEFAULT_STATION } = await import(`data:text/javascript;base64,${Buffer.from(fixtureBundle.outputFiles[0].text).toString('base64')}`)
const today = new Date().toLocaleDateString('en-CA')
const store = emptyStore(today)
store.config = structuredClone(DEFAULT_STATION)
store.identity.stationName = 'Windows update test station'
store.setupCompleted = true
for (let offset = 0; offset < 3; offset++) {
  const date = new Date()
  date.setDate(date.getDate() - offset)
  const day = emptyDay()
  day.meters = Object.fromEntries(store.config.machines.map((machine) => [machine.id, machine.openingMeter + (3 - offset) * 100]))
  store.days[date.toLocaleDateString('en-CA')] = day
}
const dataDir = join(appData, 'แบบบันทึกสถานีน้ำมัน')
await mkdir(dataDir, { recursive: true })
const stationFile = join(dataDir, 'station.json')
await writeFile(stationFile, JSON.stringify(store))

try {
  const first = await makeInstaller('1.1.11', await legacySource())
  const next = await makeInstaller('1.1.12')
  const latest = await makeInstaller('1.1.13')
  await install(first.installer)
  let app = await openApp('1.1.11', '01-initial-install')
  const initial = await app.evaluate('window.api.loadStore()')
  assert.equal(initial.identity.stationName, store.identity.stationName)
  await run(process.execPath, ['scripts/package-updater-repair.mjs', '--no-desktop'])
  const refusal = spawn('powershell.exe', [
    '-NoProfile', '-STA', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', resolve('dist/Pum-Updater-Repair/repair-windows-updater.ps1'),
    '-AppExe', exe, '-Quiet', '-NoLaunch', '-ResultRoot', join(root, 'running-refusal')
  ], { stdio: 'inherit' })
  const refusalCode = await new Promise((r) => refusal.once('exit', r))
  assert.equal(refusalCode, 1)
  assert.equal(parseRepairResult(await readFile(join(root, 'running-refusal', 'last-result.txt'), 'utf8')).code, 'R03')
  await app.close()

  // Repair a genuine old release with a stuck download, through the real CMD.
  const companyFile = join(installDir, 'resources', 'company-db.json')
  const companyBeforeRepair = await readFile(companyFile)
  const oldHash = await digest(installedAsar)
  await writeFile(join(updateDir, 'ready.json'), JSON.stringify({ version: '1.1.12', sha256: await digest(next.archive), channel: win7 ? 'win7' : 'win' }))
  await writeFile(join(updateDir, 'app.asar'), 'interrupted old download')
  const soloDir = join(root, "Repair [ทดสอบ] & O'Neil")
  await mkdir(soloDir)
  const soloCmd = join(soloDir, 'Repair-Pum.cmd')
  await copyFile(resolve('dist/Pum-Updater-Repair/Repair-Pum.cmd'), soloCmd)
  await run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', '""' + soloCmd + '""'], {
    windowsVerbatimArguments: true, cwd: root,
    env: { ...process.env, KOOYAI_REPAIR_AUTOMATED: '1' }
  })
  const repairRoot = join(process.env.LOCALAPPDATA, 'Pum-Repair')
  const repairStatus = parseRepairResult(await readFile(join(repairRoot, 'last-result.txt'), 'utf8'))
  assert.equal(repairStatus.status, 'success', JSON.stringify(repairStatus))
  assert.ok(Number(repairStatus.pid) > 0, 'the real repair must open the app automatically')
  assert.equal(await digest(installedAsar), oldHash, 'repair preserves the installed program')
  assert.deepEqual(JSON.parse(await readFile(stationFile, 'utf8')).days, initial.days)
  assert.deepEqual(await readFile(companyFile), companyBeforeRepair)
  await closeVisiblePum()
  await mkdir(updateDir, { recursive: true })

  // Prove the repaired old updater can reach the new code over the air.
  await copyFile(next.archive, join(updateDir, 'app.asar'))
  await writeFile(join(updateDir, 'ready.json'), JSON.stringify({ version: '1.1.12', sha256: await digest(next.archive), channel: win7 ? 'win7' : 'win' }))
  const legacyStart = spawn(exe, [], { stdio: 'inherit' })
  await until(() => legacyStart.exitCode !== null, 'legacy startup handoff')
  await until(async () => (await digest(installedAsar)) === (await digest(next.archive)), 'legacy-to-fixed OTA replacement')
  await closeVisiblePum()
  app = await openApp('1.1.12', '02-after-real-legacy-upgrade')
  assert.deepEqual((await app.evaluate('window.api.loadStore()')).days, initial.days)
  await app.close()

  // A corrupt pending update must not block startup or damage the installed app.
  const nextHash = await digest(latest.archive)
  const marker = { version: '1.1.13', sha256: nextHash, channel: win7 ? 'win7' : 'win' }
  await writeFile(join(updateDir, 'app.asar'), 'interrupted download')
  await writeFile(join(updateDir, 'ready.json'), JSON.stringify(marker))
  app = await openApp('1.1.12', '03-corrupt-update-still-opens')
  const beforeUpdateHash = await digest(installedAsar)
  await app.close()
  assert.equal(await digest(installedAsar), beforeUpdateHash)

  // A complete pending update also must not hijack startup. It applies on close.
  await copyFile(latest.archive, join(updateDir, 'app.asar'))
  app = await openApp('1.1.12', '04-valid-update-before-close')
  assert.equal((await app.evaluate('window.api.getUpdateStatus()')).ready, true, 'the app must verify raw ASAR bytes')
  await app.close()
  await until(async () => (await digest(installedAsar)) === nextHash, 'OTA archive replacement')
  await until(async () => {
    try { await readFile(join(updateDir, 'ready.json')); return false } catch (error) { return error.code === 'ENOENT' }
  }, 'update cleanup')
  assert.equal(await digest(`${installedAsar}.previous`), beforeUpdateHash)
  app = await openApp('1.1.13', '05-after-ota-update')
  assert.deepEqual((await app.evaluate('window.api.loadStore()')).days, initial.days)
  await app.close()

  // Repeat a same-identity NSIS upgrade and reinstall. Never change appId or name.
  for (const attempt of [1, 2]) {
    await install(latest.installer)
    app = await openApp('1.1.13', `06-same-name-reinstall-${attempt}`)
    assert.deepEqual((await app.evaluate('window.api.loadStore()')).days, initial.days)
    await app.close()
  }
  assert.deepEqual(JSON.parse(await readFile(stationFile, 'utf8')).days, initial.days)
  console.log(`PASS: ${win7 ? 'Electron 22 ia32' : 'current Windows x64'} install, corrupt-update recovery, OTA update, and two same-name reinstalls; station records preserved.`)
} catch (error) {
  console.error(`Test files retained at ${root}`)
  try {
    const failure = await readFile(join(updateDir, 'failed.txt'), 'utf8')
    await writeFile(join(screenshots, 'updater-failure.txt'), failure)
    console.error(`Updater failure: ${failure}`)
  } catch { /* no helper failure record */ }
  try {
    const log = await readFile(join(updateDir, 'helper.log'), 'utf8')
    await writeFile(join(screenshots, 'helper.log'), log)
    console.error(`Helper log: ${log}`)
  } catch { /* helper did not create a log */ }
  throw error
}
