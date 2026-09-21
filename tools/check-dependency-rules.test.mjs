import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkImports, checkManifests, checkSystemImports, run } from './check-dependency-rules.mjs'

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

const SYS = 'packages/simulation/src/systems'

test('systems may not import sibling systems', () => {
  const files = [
    { path: `${SYS}/MovementSystem.ts`, text: "import { x } from './PerceptionSystem'" },
    { path: `${SYS}/DeathSystem.ts`, text: "import type { Y } from './MovementSystem.js'" }
  ]
  assert.equal(checkSystemImports(files).length, 2)
})

test('systems may not import from world/ or the systems barrel', () => {
  const files = [
    { path: `${SYS}/MovementSystem.ts`, text: "import { World } from '../world/World'" },
    { path: `${SYS}/DeathSystem.ts`, text: "import { all } from './index'" }
  ]
  assert.equal(checkSystemImports(files).length, 2)
})

test('extensionless and directory imports of world/ and systems/ are caught', () => {
  const files = [
    { path: `${SYS}/MovementSystem.ts`, text: "import { w } from '../world'" },
    { path: `${SYS}/DeathSystem.ts`, text: "import { s } from '.'" },
    { path: `${SYS}/EnvironmentSystem.ts`, text: "import { s } from '../systems/DeathSystem'" }
  ]
  assert.equal(checkSystemImports(files).length, 3)
})

test('systems may import shared services, buffers and external packages', () => {
  const files = [
    {
      path: `${SYS}/MovementSystem.ts`,
      text: [
        "import { a } from '../entities/OrganismStore'",
        "import { b } from '../random/SeededRandom'",
        "import { c } from '@evo/contracts'",
        "import { d } from 'vitest'"
      ].join('\n')
    }
  ]
  assert.deepEqual(checkSystemImports(files), [])
})

test('files outside systems/ are not subject to the systems rule', () => {
  const files = [
    {
      path: 'packages/simulation/src/world/World.ts',
      text: "import { m } from '../systems/MovementSystem'"
    }
  ]
  assert.deepEqual(checkSystemImports(files), [])
})

test('the real workspace currently satisfies the rules', () => {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..')
  assert.deepEqual(run(root).errors, [])
})
