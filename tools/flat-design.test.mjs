import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { filesUnder, findNonFlat, withoutComments } from './flat-design.mjs'

test('the scanner finds each kind of non-flat styling', () => {
  const cases = {
    shadow: '.a { box-shadow: 0 0 10px red; }',
    'text shadow': '.a { text-shadow: 0 1px black; }',
    blur: '.a { backdrop-filter: blur(18px); }',
    filter: '.a { filter: drop-shadow(0 0 4px red); }',
    gradient: '.a { background: linear-gradient(#000, #111); }',
    'radial gradient in script': 'const g = context.createRadialGradient(0, 0, 0, 1, 1, 1)',
    glow: 'const glowAlpha = 0.3',
    'a Pixi filter': 'sprite.filters = [new BlurFilter()]',
    'an additive blend': "container.blendMode = 'add'"
  }
  for (const [name, source] of Object.entries(cases)) {
    assert.ok(findNonFlat(source).length > 0, `should find ${name}`)
  }
})

test('the scanner ignores comments, flat rules and ordinary words', () => {
  assert.deepEqual(
    findNonFlat('/* no glow, blur, gradient or shadow here */\n.a { color: red; }'),
    []
  )
  assert.deepEqual(findNonFlat('// a line comment about a glow\nconst x = 1'), [])
  assert.deepEqual(findNonFlat('.a { border: 1px solid #1f1f1f; opacity: 0.5; }'), [])
  assert.deepEqual(findNonFlat('const url = "https://example.com/a.png" // fine'), [])
})

test('comments are removed without eating code after a URL', () => {
  const kept = withoutComments('a { background: url(https://x/y.svg); } /* gone */')
  assert.ok(kept.includes('https://x/y.svg'))
  assert.ok(!kept.includes('gone'))
})

test('no stylesheet, component or renderer source has a glow, blur, gradient or shadow', () => {
  const roots = [
    ['packages/ui/src', ['.css', '.ts', '.tsx']],
    ['packages/renderer/src', ['.ts']],
    ['apps/web/src', ['.css', '.ts', '.tsx']]
  ]
  const problems = []
  for (const [root, extensions] of roots) {
    for (const file of filesUnder(root, extensions)) {
      for (const { line, what } of findNonFlat(readFileSync(file, 'utf8'))) {
        problems.push(`${file}:${line} has ${what}`)
      }
    }
  }
  assert.deepEqual(problems, [])
})
