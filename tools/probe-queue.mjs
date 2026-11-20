// Runs probe jobs through a small worker pool, so a sweep never starts more processes than the
// machine has cores (an oversubscribed box makes every job slower and the whole sweep no faster).
//
//   node tools/probe-queue.mjs jobs.json [--parallel N]
//
// `jobs.json` is an array of `{ "name": "arm-a", "probe": "tests/probe/x.probe.ts", "env": { ... } }`.
// Each job runs `pnpm exec vitest run --config vitest.probe.config.ts <probe>` in `packages/simulation`
// with its `env` added; its output goes to `<tmpdir>/evo-probe/queue/<name>.log`. Jobs start in file
// order, so put the one you want first at the top.
import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs'
import { cpus, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Runs `jobs` with at most `parallel` at once, in order, through `run(job)` (a promise of an exit
 * code). A failing job is recorded and the others still run. Resolves to `[{ name, code }]` in the
 * order the jobs were given.
 */
export async function runQueue(jobs, parallel, run, onEvent = () => {}) {
  const results = new Array(jobs.length)
  let next = 0
  async function worker() {
    for (;;) {
      const index = next++
      if (index >= jobs.length) return
      const job = jobs[index]
      onEvent({ type: 'start', name: job.name })
      let code
      try {
        code = await run(job)
      } catch {
        code = -1
      }
      results[index] = { name: job.name, code }
      onEvent({ type: 'finish', name: job.name, code })
    }
  }
  const workers = Math.max(1, Math.min(parallel, jobs.length))
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}

function runProbe(job, simulationDir, logDir) {
  return new Promise((done, fail) => {
    const log = createWriteStream(join(logDir, `${job.name}.log`))
    const child = spawn(
      'pnpm',
      ['exec', 'vitest', 'run', '--config', 'vitest.probe.config.ts', job.probe],
      { cwd: simulationDir, env: { ...process.env, ...(job.env ?? {}) } }
    )
    child.stdout.pipe(log, { end: false })
    child.stderr.pipe(log, { end: false })
    child.on('error', fail)
    child.on('close', (code) => {
      log.end()
      done(code ?? -1)
    })
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  if (file === undefined) {
    console.error('usage: node tools/probe-queue.mjs jobs.json [--parallel N]')
    process.exit(2)
  }
  const flag = args.indexOf('--parallel')
  const parallel = flag >= 0 ? Number(args[flag + 1]) : Math.max(1, cpus().length)
  const jobs = JSON.parse(readFileSync(file, 'utf8'))
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const logDir = join(tmpdir(), 'evo-probe', 'queue')
  mkdirSync(logDir, { recursive: true })
  const started = Date.now()
  const stamp = () => `${Math.round((Date.now() - started) / 1000)}s`
  const results = await runQueue(
    jobs,
    parallel,
    (job) => runProbe(job, join(root, 'packages', 'simulation'), logDir),
    (e) =>
      console.log(
        `${stamp()} ${e.type} ${e.name}${e.code === undefined ? '' : ` (exit ${e.code})`}`
      )
  )
  const failed = results.filter((r) => r.code !== 0)
  console.log(
    `${results.length - failed.length} of ${results.length} jobs passed in ${stamp()}; logs in ${logDir}`
  )
  process.exit(failed.length === 0 ? 0 : 1)
}
