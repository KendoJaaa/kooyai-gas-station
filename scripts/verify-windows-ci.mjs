import { execFileSync } from 'node:child_process'

const repository = 'KendoJaaa/kooyai-gas-station'
const workflowPath = '.github/workflows/windows-upgrade.yml'

export function assertWindowsValidation(sha, run, jobs) {
  if (run?.head_sha !== sha || run?.status !== 'completed' || run?.conclusion !== 'success' || run?.path?.split('@')[0] !== workflowPath) {
    throw new Error('Release blocked: this exact commit has not passed the Windows upgrade workflow.')
  }
  for (const target of ['win', 'win7']) {
    const job = jobs.find((candidate) => candidate.name === `Windows upgrade (${target})`)
    if (job?.status !== 'completed' || job?.conclusion !== 'success') {
      throw new Error(`Release blocked: native Windows checks for ${target} did not pass.`)
    }
  }
}

export async function verifyWindowsCi() {
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim()
  if (dirty) throw new Error('Release blocked: commit and push the source changes, then wait for the Windows upgrade workflow to pass.')
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const headers = { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  async function request(path) {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, { headers, signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`Release blocked: cannot verify Windows CI (GitHub HTTP ${response.status}).`)
    return response.json()
  }
  const runs = await request(`actions/workflows/windows-upgrade.yml/runs?head_sha=${sha}&per_page=10`)
  const run = runs.workflow_runs.find((candidate) => candidate.head_sha === sha && candidate.status === 'completed' && candidate.conclusion === 'success')
  if (!run) throw new Error('Release blocked: the Windows upgrade workflow must pass for this exact commit before publishing.')
  const jobs = await request(`actions/runs/${run.id}/jobs?per_page=100`)
  assertWindowsValidation(sha, run, jobs.jobs)
  console.log(`Verified native Windows checks: ${run.html_url}`)
}
