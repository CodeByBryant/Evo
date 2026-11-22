import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runQueue } from './probe-queue.mjs'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

test('never runs more jobs than the limit, and runs them all in order of starting', async () => {
  let running = 0
  let peak = 0
  const started = []
  const jobs = Array.from({ length: 7 }, (_, i) => ({ name: `j${i}` }))
  const results = await runQueue(jobs, 3, async (job) => {
    started.push(job.name)
    running++
    peak = Math.max(peak, running)
    await wait(5)
    running--
    return 0
  })
  assert.equal(peak, 3)
  assert.deepEqual(
    started,
    jobs.map((j) => j.name)
  )
  assert.deepEqual(
    results.map((r) => r.name),
    jobs.map((j) => j.name)
  )
  assert.ok(results.every((r) => r.code === 0))
})

test('a failing job is recorded and does not stop the rest (negative: no job is dropped)', async () => {
  const jobs = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
  const results = await runQueue(jobs, 2, async (job) => {
    if (job.name === 'b') throw new Error('boom')
    return job.name === 'c' ? 1 : 0
  })
  assert.deepEqual(results, [
    { name: 'a', code: 0 },
    { name: 'b', code: -1 },
    { name: 'c', code: 1 }
  ])
})

test('a limit of one runs jobs one at a time, and a limit above the job count is harmless', async () => {
  let running = 0
  let peak = 0
  const run = async () => {
    running++
    peak = Math.max(peak, running)
    await wait(2)
    running--
    return 0
  }
  await runQueue([{ name: 'x' }, { name: 'y' }, { name: 'z' }], 1, run)
  assert.equal(peak, 1)
  const results = await runQueue([{ name: 'only' }], 8, run)
  assert.equal(results.length, 1)
  assert.deepEqual(await runQueue([], 4, run), [])
})
