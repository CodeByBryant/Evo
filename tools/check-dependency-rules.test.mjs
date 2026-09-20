import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkImports, checkManifests, run } from './check-dependency-rules.mjs'

const pkg = (name, dependencies = {}) => ({ name: `@evo/${name}`, dir: name, dependencies })

test('allows the documented edges', () => {
  const errors = checkManifests([
    pkg('contracts'),
    pkg('config', { '@evo/contracts': 'workspace:*' }),
    pkg('simulation', { '@evo/contracts': 'workspace:*', '@evo/config': 'workspace:*' }),
    pkg('web', { '@evo/simulation': 'workspace:*', react: '^19.0.0' })
  ])
  assert.deepEqual(errors, [])
})

test('contracts may not depend on any internal package', () => {
  const errors = checkManifests([pkg('contracts', { '@evo/config': 'workspace:*' })])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /forbidden dependency on @evo\/config/)
})

test('renderer and ui may not depend on simulation', () => {
  const errors = checkManifests([
    pkg('renderer', { '@evo/simulation': 'workspace:*' }),
    pkg('ui', { '@evo/simulation': 'workspace:*' })
  ])
  assert.equal(errors.length, 2)
})

test('simulation may not depend on UI, bundler, or desktop packages', () => {
  const errors = checkManifests([
    pkg('simulation', {
      react: '^19.0.0',
      vite: '^7.0.0',
      electron: '^40.0.0',
      '@evo/renderer': 'workspace:*'
    })
  ])
  assert.equal(errors.length, 4)
})

test('unknown workspace packages and unscoped names are rejected', () => {
  assert.equal(checkManifests([pkg('mystery')]).length, 1)
  assert.equal(checkManifests([{ name: 'plain', dir: 'plain' }]).length, 1)
})

test('source imports are checked too', () => {
  const files = [
    { path: 'a.ts', text: "import { x } from '@evo/renderer'" },
    { path: 'b.ts', text: "import React from 'react'" },
    { path: 'c.ts', text: "import { y } from '@evo/contracts'" }
  ]
  assert.equal(checkImports('simulation', files).length, 2)
})

test('the real workspace currently satisfies the rules', () => {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..')
  assert.deepEqual(run(root).errors, [])
})
