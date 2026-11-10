import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// The docked layout's two breakpoints live twice: in packages/ui/src/layout.ts (which arrangement
// the app renders) and in the media queries of apps/web/src/styles.css (how it is laid out). If they
// drift apart the app renders one arrangement inside the other's grid, so they are held together.
const layout = readFileSync('packages/ui/src/layout.ts', 'utf8')
const css = readFileSync('apps/web/src/styles.css', 'utf8')
const constant = (name) => {
  const match = new RegExp(`export const ${name} = (\\d+)`).exec(layout)
  assert.ok(match, `${name} should be a number in layout.ts`)
  return Number(match[1])
}
const queries = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map((m) => Number(m[1]))

test('the stylesheet has exactly the two breakpoints the layout helper names', () => {
  assert.deepEqual(
    [...queries].sort((a, b) => a - b),
    [constant('PHONE_MAX_WIDTH'), constant('LAPTOP_MAX_WIDTH')]
  )
})

test('no other width media query sneaks in', () => {
  assert.equal([...css.matchAll(/@media[^{]*width/g)].length, queries.length)
})
