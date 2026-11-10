import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

// The determinism job runs the suite in shards named by file in .github/workflows/quality.yml. A
// test file that no shard names would silently never run in CI, and one named twice would run twice,
// so the lists are held to the directory.
const workflow = readFileSync('.github/workflows/quality.yml', 'utf8')
const onDisk = readdirSync('packages/simulation/tests/determinism')
  .filter((name) => name.endsWith('.test.ts'))
  .map((name) => `tests/determinism/${name}`)
  .sort()
const named = [...workflow.matchAll(/tests\/determinism\/[\w.-]+\.test\.ts/g)]
  .map((match) => match[0])
  .sort()

test('every determinism test file is in exactly one CI shard', () => {
  assert.deepEqual(named, onDisk)
})

test('there are no empty shards', () => {
  const shards = [...workflow.matchAll(/^\s+files: (.+)$/gm)].map((match) => match[1].trim())
  assert.ok(shards.length >= 2, 'the determinism job should be sharded')
  for (const files of shards) assert.ok(files.split(/\s+/).length >= 1 && files.length > 0)
})
