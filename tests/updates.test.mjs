import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import { runInNewContext } from 'node:vm'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const helperPath = resolve('resources/apply-update.ps1')
const helperSource = await readFile(helperPath, 'utf8')
const bundle = await build({
  entryPoints: ['src/main/updates.ts'], bundle: true, platform: 'node', format: 'cjs',
  write: false, external: ['electron', 'mongodb', 'original-fs'],
  plugins: [{
    name: 'raw-helper',
    setup(builder) {
      builder.onResolve({ filter: /\.ps1\?raw$/ }, () => ({ path: helperPath, namespace: 'raw' }))
      builder.onLoad({ filter: /.*/, namespace: 'raw' }, () => ({ contents: helperSource, loader: 'text' }))
    }
  }]
})
const code = bundle.outputFiles[0].text
const archive = Buffer.from('verified new app archive')
const hash = createHash('sha256').update(archive).digest('hex')

async function fixture(t, { spawnError = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'kooyai update ทดสอบ & '))
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'kooyai-update')
  await mkdir(directory)
  const marker = { version: '1.1.12', sha256: hash, channel: 'win' }
  await writeFile(join(directory, 'app.asar'), archive)
  await writeFile(join(directory, 'ready.json'), JSON.stringify(marker))
  const exits = []
  const spawns = []
  const release = { ...marker, fileId: 'test-archive' }
  const mongodb = {
    MongoClient: class {
      async connect() {}
      async close() {}
      db() { return { collection: () => ({ findOne: async () => release }) } }
    },
    GridFSBucket: class {
      openDownloadStream() { return Readable.from([archive]) }
    }
  }
  const module = { exports: {} }
  runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      if (name === 'original-fs') return require('node:fs')
      if (name === 'electron') return { app: {
        isPackaged: true, getPath: () => root, getVersion: () => '1.1.11',
        exit: (value) => exits.push(value)
      } }
      if (name === 'mongodb') return mongodb
      if (name === 'child_process') return { spawn(...args) {
        spawns.push(args)
        const child = new EventEmitter()
        child.unref = () => {}
        queueMicrotask(() => child.emit(spawnError ? 'error' : 'spawn', new Error('Launch failed')))
        return child
      } }
      return require(name)
    },
    process: {
      platform: 'win32', versions: { electron: '39.8.10' }, env: { SystemRoot: 'C:\\Windows' },
      pid: process.pid, resourcesPath: join(root, 'installed app'), execPath: join(root, 'banthukpum.exe')
    },
    Buffer, URL, console
  })
  return { api: module.exports, root, directory, marker, exits, spawns }
}

test('only a complete verified archive for the correct channel is ready', async (t) => {
  const f = await fixture(t)
  assert.equal(await f.api.pendingUpdateReady(), true)
  await writeFile(join(f.directory, 'app.asar'), 'truncated download')
  assert.equal(await f.api.pendingUpdateReady(), false)
  await rm(join(f.directory, 'app.asar'))
  assert.equal(await f.api.pendingUpdateReady(), false)
  await writeFile(join(f.directory, 'app.asar'), archive)
  await writeFile(join(f.directory, 'ready.json'), JSON.stringify({ ...f.marker, channel: 'win7' }))
  assert.equal(await f.api.pendingUpdateReady(), false)
})

test('a failed or interrupted update lets subsequent launches open the app', async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.directory, 'failed.txt'), `${hash}\nCould not replace archive`)
  assert.equal(await f.api.applyPendingUpdate(true), false)
  assert.equal(f.exits.length, 0)
  assert.equal(f.spawns.length, 0)
})

test('the helper is delivered inside app updates and receives paths without shell parsing', async (t) => {
  const f = await fixture(t)
  assert.equal(await f.api.applyPendingUpdate(true), true)
  assert.equal(await readFile(join(f.directory, 'apply-update.ps1'), 'utf8'), helperSource)
  assert.ok((await readFile(join(f.directory, 'failed.txt'), 'utf8')).startsWith(hash))
  const [command, args, options] = f.spawns[0]
  assert.ok(command.endsWith('powershell.exe'))
  assert.equal(args.at(-1), join(f.directory, 'apply-update.ps1'))
  assert.equal(options.shell, undefined)
  assert.equal(options.windowsHide, true)
  assert.equal(options.detached, false)
  assert.equal(options.env.KOOYAI_UPDATE_PID, String(process.pid))
  assert.equal(options.env.KOOYAI_UPDATE_PENDING, join(f.directory, 'app.asar'))
  assert.deepEqual(f.exits, [0])
  // Even if the helper never executes, the next startup does not exit again.
  assert.equal(await f.api.applyPendingUpdate(true), false)
  assert.equal(f.spawns.length, 1)
})

test('a helper launch error keeps the installed app running', async (t) => {
  const f = await fixture(t, { spawnError: true })
  assert.equal(await f.api.applyPendingUpdate(true), false)
  assert.equal(f.exits.length, 0)
  assert.equal(await f.api.pendingUpdateReady(), false)
})

test('explicit retry downloads a damaged cached archive again and clears the failed attempt', async (t) => {
  const f = await fixture(t)
  await writeFile(join(f.directory, 'app.asar'), 'damaged')
  await writeFile(join(f.directory, 'failed.txt'), `${hash}\nInterrupted`)
  const result = await f.api.downloadAvailableUpdate(async () => 'mongodb://fixture')
  assert.equal(result.ok, true)
  assert.deepEqual(await readFile(join(f.directory, 'app.asar')), archive)
  assert.equal(await f.api.pendingUpdateReady(), true)
})

const powershell = process.env.KOOYAI_TEST_POWERSHELL
test('the replacement helper accepts the already-installed updater argument format', {
  skip: !powershell && 'Set KOOYAI_TEST_POWERSHELL to run the real helper'
}, async (t) => {
  const f = await fixture(t)
  const target = join(f.root, 'installed app.asar')
  await writeFile(target, 'old app')
  const result = spawnSync(powershell, [
    '-NoProfile', '-NonInteractive', '-File', helperPath,
    '-PendingPath', join(f.directory, 'app.asar'), '-TargetPath', target,
    '-MarkerPath', join(f.directory, 'ready.json'), '-Relaunch', '0', '-AppExe', 'unused'
  ], { encoding: 'utf8', timeout: 15_000 })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(await readFile(target), archive)
  assert.equal(await readFile(`${target}.previous`, 'utf8'), 'old app')
})

for (const corrupt of [false, true]) {
  test(`PowerShell helper ${corrupt ? 'preserves the old app when verification fails' : 'replaces the app and retains a rollback archive'}`, {
    skip: !powershell && 'Set KOOYAI_TEST_POWERSHELL to run the real helper'
  }, async (t) => {
    const f = await fixture(t)
    const target = join(f.root, 'installed app.asar')
    await writeFile(target, 'old app')
    if (corrupt) await writeFile(join(f.directory, 'app.asar'), 'corrupt')
    const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-File', helperPath], {
      encoding: 'utf8', timeout: 15_000,
      env: {
        ...process.env,
        KOOYAI_UPDATE_PENDING: join(f.directory, 'app.asar'), KOOYAI_UPDATE_TARGET: target,
        KOOYAI_UPDATE_MARKER: join(f.directory, 'ready.json'),
        KOOYAI_UPDATE_FAILURE: join(f.directory, 'failed.txt'), KOOYAI_UPDATE_SHA256: hash,
        KOOYAI_UPDATE_PID: '2147483647', KOOYAI_UPDATE_RELAUNCH: '0'
      }
    })
    assert.equal(result.status, 0, result.stderr)
    if (corrupt) {
      assert.equal(await readFile(target, 'utf8'), 'old app')
      assert.ok((await readFile(join(f.directory, 'failed.txt'), 'utf8')).includes('SHA-256'))
      assert.equal(await f.api.pendingUpdateReady(), false)
    } else {
      assert.deepEqual(await readFile(target), archive)
      assert.equal(await readFile(`${target}.previous`, 'utf8'), 'old app')
      await assert.rejects(readFile(join(f.directory, 'ready.json')), { code: 'ENOENT' })
    }
  })
}

test('PowerShell stops waiting after 30 seconds and leaves the running app intact', {
  skip: !powershell && 'Set KOOYAI_TEST_POWERSHELL to run the real helper'
}, async (t) => {
  const f = await fixture(t)
  const target = join(f.root, 'installed app.asar')
  await writeFile(target, 'old app')
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-File', helperPath], {
    encoding: 'utf8', timeout: 40_000,
    env: {
      ...process.env,
      KOOYAI_UPDATE_PENDING: join(f.directory, 'app.asar'), KOOYAI_UPDATE_TARGET: target,
      KOOYAI_UPDATE_MARKER: join(f.directory, 'ready.json'),
      KOOYAI_UPDATE_FAILURE: join(f.directory, 'failed.txt'), KOOYAI_UPDATE_SHA256: hash,
      KOOYAI_UPDATE_PID: String(process.pid), KOOYAI_UPDATE_RELAUNCH: '0'
    }
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(target, 'utf8'), 'old app')
  assert.ok((await readFile(join(f.directory, 'failed.txt'), 'utf8')).includes('30 seconds'))
  assert.equal(await f.api.applyPendingUpdate(true), false)
  assert.equal(f.exits.length, 0)
})
