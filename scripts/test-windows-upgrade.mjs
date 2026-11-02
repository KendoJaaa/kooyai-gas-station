// Runs on a disposable Windows VM, using test-only company configuration and data.
// Exercises the real NSIS installer, packaged Electron app, and updater together.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { build as bundle } from 'esbuild'
import { build, Platform, Arch } from 'electron-builder'

if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Run this installer test only on a disposable GitHub Actions Windows VM')
}
const win7 = process.env.KOOYAI_TEST_TARGET === 'win7'
const root = await mkdtemp(join(tmpdir(), 'Pum upgrade & ทดสอบ '))
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

async function makeInstaller(version) {
  const output = join(root, `build-${version}`)
  await build({
    targets: Platform.WINDOWS.createTarget(['nsis'], win7 ? Arch.ia32 : Arch.x64),
    config: {
      extends: resolve(win7 ? 'electron-builder.win7.yml' : 'electron-builder.yml'),
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
store.days[today] = emptyDay()
const dataDir = join(appData, 'แบบบันทึกสถานีน้ำมัน')
await mkdir(dataDir, { recursive: true })
const stationFile = join(dataDir, 'station.json')
await writeFile(stationFile, JSON.stringify(store))

try {
  const first = await makeInstaller('1.1.11')
  const next = await makeInstaller('1.1.12')
  await install(first.installer)
  let app = await openApp('1.1.11', '01-initial-install')
  const initial = await app.evaluate('window.api.loadStore()')
  assert.equal(initial.identity.stationName, store.identity.stationName)
  await app.close()

  // Repair the installed updater directly, without NSIS or identity changes.
  await run(process.execPath, ['scripts/package-updater-repair.mjs', '--no-desktop'])
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve('dist/Pum-Updater-Repair/repair-windows-updater.ps1'), '-AppExe', exe, '-NoLaunch'])
  assert.deepEqual(JSON.parse(await readFile(stationFile, 'utf8')).days, initial.days)
  await mkdir(updateDir, { recursive: true })

  // A corrupt pending update must not block startup or damage the installed app.
  const nextHash = await digest(next.archive)
  const marker = { version: '1.1.12', sha256: nextHash, channel: win7 ? 'win7' : 'win' }
  await writeFile(join(updateDir, 'app.asar'), 'interrupted download')
  await writeFile(join(updateDir, 'ready.json'), JSON.stringify(marker))
  app = await openApp('1.1.11', '02-corrupt-update-still-opens')
  const oldHash = await digest(installedAsar)
  await app.close()
  assert.equal(await digest(installedAsar), oldHash)

  // A complete pending update also must not hijack startup. It applies on close.
  await copyFile(next.archive, join(updateDir, 'app.asar'))
  app = await openApp('1.1.11', '03-valid-update-before-close')
  await app.close()
  await until(async () => (await digest(installedAsar)) === nextHash, 'OTA archive replacement')
  await until(async () => {
    try { await readFile(join(updateDir, 'ready.json')); return false } catch (error) { return error.code === 'ENOENT' }
  }, 'update cleanup')
  assert.equal(await digest(`${installedAsar}.previous`), oldHash)
  app = await openApp('1.1.12', '04-after-ota-update')
  assert.deepEqual((await app.evaluate('window.api.loadStore()')).days, initial.days)
  await app.close()

  // Repeat a same-identity NSIS upgrade and reinstall. Never change appId or name.
  for (const attempt of [1, 2]) {
    await install(next.installer)
    app = await openApp('1.1.12', `05-same-name-reinstall-${attempt}`)
    assert.deepEqual((await app.evaluate('window.api.loadStore()')).days, initial.days)
    await app.close()
  }
  assert.deepEqual(JSON.parse(await readFile(stationFile, 'utf8')).days, initial.days)
  console.log(`PASS: ${win7 ? 'Electron 22 ia32' : 'current Windows x64'} install, corrupt-update recovery, OTA update, and two same-name reinstalls; station records preserved.`)
} catch (error) {
  console.error(`Test files retained at ${root}`)
  throw error
}
