// The interface is flat (docs/architecture/interface-design.md): no glow, blur, gradient or shadow,
// in the stylesheets, the React components or the renderer. This finds them in source text so a
// test can keep it that way. Comments are ignored (they may say what is not there).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** What is not allowed, with the reason reported. Matched against source with comments removed. */
const BANNED = [
  [/box-shadow|text-shadow|drop-shadow/i, 'a shadow'],
  [/backdrop-filter|\bfilter\s*:|\bblur\s*\(/i, 'a blur or filter'],
  [/gradient/i, 'a gradient'],
  [/glow/i, 'a glow'],
  [/shadow/i, 'a shadow'],
  [/BlurFilter|GlowFilter|DropShadowFilter|\.filters\b/, 'a Pixi filter'],
  [/blendMode\s*[:=]\s*['"](add|screen)['"]/, 'an additive blend']
]

/** The source with block comments and line comments removed (strings are left alone: a URL is not a comment here). */
export function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
}

/** The banned things found in `text`, as `{ line, what }`. */
export function findNonFlat(text) {
  const found = []
  const lines = withoutComments(text).split('\n')
  lines.forEach((line, index) => {
    for (const [pattern, what] of BANNED) {
      if (pattern.test(line)) found.push({ line: index + 1, what })
    }
  })
  return found
}

/** Every file under `dir` (recursively) with one of the extensions. */
export function filesUnder(dir, extensions) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, extensions))
    else if (extensions.some((ext) => name.endsWith(ext))) out.push(path)
  }
  return out
}
