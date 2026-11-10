import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// WCAG 2 contrast between the interface's text colors and the surfaces they sit on, from the real
// token values in theme.css, so re-theming cannot quietly make the interface unreadable.
const css = readFileSync('packages/ui/src/theme.css', 'utf8')
const token = (name) => {
  const match = new RegExp(`--evo-${name}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`).exec(css)
  assert.ok(match, `--evo-${name} should be a hex color in theme.css`)
  let hex = match[1].slice(1)
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('')
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
}

const luminance = ([r, g, b]) => {
  const lin = (v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('the contrast function matches known values', () => {
  assert.ok(Math.abs(contrast([0, 0, 0], [255, 255, 255]) - 21) < 1e-9)
  assert.ok(Math.abs(contrast([119, 119, 119], [255, 255, 255]) - 4.48) < 0.01)
})

test('text colors reach WCAG AA (4.5:1) on every surface', () => {
  for (const surface of ['ink', 'ink-2', 'panel']) {
    for (const text of ['text', 'muted', 'dim', 'good', 'warn', 'bad', 'accent']) {
      const ratio = contrast(token(text), token(surface))
      assert.ok(
        ratio >= 4.5,
        `--evo-${text} on --evo-${surface} is ${ratio.toFixed(2)}:1, below 4.5:1`
      )
    }
  }
})

test('the hairlines stay visible but quiet against the surfaces', () => {
  for (const surface of ['ink', 'panel']) {
    const ratio = contrast(token('line'), token(surface))
    assert.ok(ratio > 1.1 && ratio < 3, `--evo-line on --evo-${surface} is ${ratio.toFixed(2)}:1`)
  }
})
