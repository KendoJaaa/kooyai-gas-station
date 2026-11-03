import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertWindowsValidation } from '../scripts/verify-windows-ci.mjs'
import { RELEASE_CHANNELS, assertAtlasCapacity, readAtlasStorage } from '../scripts/release-policy.mjs'
import { spawnSync } from 'node:child_process'

const sha = 'exact-source-commit'
const run = { head_sha: sha, status: 'completed', conclusion: 'success', path: '.github/workflows/windows-upgrade.yml' }
const jobs = ['win', 'win7'].map((target) => ({ name: `Windows upgrade (${target})`, status: 'completed', conclusion: 'success' }))

test('publication requires both native Windows targets for the exact source commit', () => {
  assert.doesNotThrow(() => assertWindowsValidation(sha, run, jobs))
  assert.throws(() => assertWindowsValidation('untested-source', run, jobs), /exact commit/)
  assert.throws(() => assertWindowsValidation(sha, { ...run, path: '.github/workflows/other.yml' }, jobs), /workflow/)
  assert.throws(() => assertWindowsValidation(sha, run, jobs.slice(0, 1)), /win7/)
  assert.throws(() => assertWindowsValidation(sha, run, [jobs[0], { ...jobs[1], conclusion: 'skipped' }]), /win7/)
  assert.throws(() => assertWindowsValidation(sha, { ...run, conclusion: 'failure' }, jobs), /workflow/)
})

test('Atlas publication supports only Windows and rejects Mac before opening an archive or connection', () => {
  assert.deepEqual(RELEASE_CHANNELS, ['win', 'win7'])
  const result = spawnSync(process.execPath, ['scripts/publish-update.mjs', 'mac', '/missing.asar'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Mac updates are not stored in Atlas/)
  assert.doesNotMatch(result.stderr, /ENOENT|MongoServer|mongodb:\/\//)
})

test('publication reserves space for station records before any new archives are uploaded', () => {
  assert.doesNotThrow(() => assertAtlasCapacity({ dataSize: 250_000_000, indexSize: 400_000 }, 173_000_000))
  assert.throws(() => assertAtlasCapacity({ dataSize: 423_000_000, indexSize: 400_000 }, 173_000_000), /insufficient free-tier space/)
  assert.throws(() => assertAtlasCapacity({ dataSize: 470_000_000, indexSize: 0 }, 0), /insufficient free-tier space/)
  assert.throws(() => assertAtlasCapacity({ dataSize: undefined, indexSize: 0 }, 0), /cannot verify/)
  assert.throws(() => assertAtlasCapacity({ dataSize: 1, indexSize: 0 }, -1), /cannot verify/)
})

test('the free-tier guard counts data and indexes across every application database', async () => {
  const checked = []
  const client = { db(name) { return { async command(command) {
    if (command.listDatabases) {
      assert.equal(command.authorizedDatabases, false)
      return { databases: ['kooyai', 'another-app', 'admin', 'local', 'config'].map((name) => ({ name })) }
    }
    checked.push(name)
    assert.equal(command.scale, 1)
    return name === 'kooyai'
      ? { dataSize: 250_000_000, indexSize: 400_000 }
      : { dataSize: 100_000_000, indexSize: 100_000 }
  } } } }
  const storage = await readAtlasStorage(client)
  assert.deepEqual(checked.sort(), ['another-app', 'kooyai'])
  assert.deepEqual(storage, { dataSize: 350_000_000, indexSize: 500_000 })
  assert.throws(() => assertAtlasCapacity(storage, 173_000_000), /insufficient free-tier space/)
})

test('an incomplete inventory or unreadable database cannot pass the storage check', async () => {
  await assert.rejects(readAtlasStorage({ db: () => ({ command: async () => ({}) }) }), /cannot verify/)
  await assert.rejects(readAtlasStorage({ db: () => ({ command: async () => { throw new Error('Inventory access denied') } }) }), /access denied/)
  const client = { db() { return { async command(command) {
    return command.listDatabases ? { databases: [{ name: 'kooyai' }] } : { dataSize: 100 }
  } } } }
  await assert.rejects(readAtlasStorage(client), /cannot verify/)
})
