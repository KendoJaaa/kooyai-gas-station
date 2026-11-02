import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertWindowsValidation } from '../scripts/verify-windows-ci.mjs'

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
