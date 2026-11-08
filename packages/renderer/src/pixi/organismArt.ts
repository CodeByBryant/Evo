import type { Graphics } from 'pixi.js'
import type { PartSnapshot, RenderOrganism } from '@evo/contracts'
import {
  TAU,
  beatRate,
  blinkOpen,
  ciliaRow,
  exitPoint,
  feelerPoints,
  mouthOpen,
  phaseOf,
  pulse,
  pupilOffset,
  tailPolygon
} from '../animation'
import { hexToNumber, hslToHex } from '../colors'

/**
 * How a creature is drawn: a soft translucent cell whose parts grow out of its body. The body is
 * painted once (`paintBodyArt`); the parts that move are redrawn each animation frame
 * (`drawParts`) only while the camera is close. Presentation only: nothing here reads the engine.
 */

/** The colors of one creature, from its hue, as Pixi numbers. */
export interface BodyPalette {
  readonly deep: number
  readonly mid: number
  readonly light: number
  readonly rim: number
  readonly tail: number
  readonly spot: number
  readonly gut: number
  readonly halo: number
  readonly cilia: number
}

const WHITE = 0xe9eee6
const DARK = 0x0a0c12
const LEAF = 0x8fdc72
const FAT = 0xf2e08a
const ARMOR = 0xb4b9bd
const HEAL = 0x76c79d

const paletteCache = new Map<number, BodyPalette>()

/** The palette for a hue (cached per whole degree: the colors only need to be close, not exact). */
export function paletteOf(hue: number): BodyPalette {
  const key = Math.round(((hue % 360) + 360) % 360)
  let palette = paletteCache.get(key)
  if (palette === undefined) {
    const color = (s: number, l: number, shift = 0): number =>
      hexToNumber(hslToHex(key + shift, s, l))
    palette = {
      deep: color(0.38, 0.28),
      mid: color(0.42, 0.46),
      light: color(0.5, 0.7),
      rim: color(0.35, 0.74),
      tail: color(0.42, 0.66),
      spot: color(0.45, 0.4),
      gut: color(0.9, 0.62, 20),
      halo: color(0.38, 0.68),
      cilia: color(0.4, 0.72)
    }
    paletteCache.set(key, palette)
  }
  return palette
}

/**
 * Traces the outline as a smooth closed curve through its points (Catmull-Rom segments turned into
 * Beziers), so a body of `n` points reads as a soft creature and not as a polygon. `scale` and an
 * offset shrink and shift it, for the layers that give the body its depth.
 */
export function traceOutline(
  g: Graphics,
  points: readonly number[],
  scale: number,
  offsetX = 0,
  offsetY = 0
): void {
  const n = points.length / 2
  const at = (i: number, axis: 0 | 1): number =>
    (points[(((i % n) + n) % n) * 2 + axis] as number) * scale + (axis === 0 ? offsetX : offsetY)
  g.moveTo(at(0, 0), at(0, 1))
  for (let i = 0; i < n; i++) {
    g.bezierCurveTo(
      at(i, 0) + (at(i + 1, 0) - at(i - 1, 0)) / 6,
      at(i, 1) + (at(i + 1, 1) - at(i - 1, 1)) / 6,
      at(i + 1, 0) - (at(i + 2, 0) - at(i, 0)) / 6,
      at(i + 1, 1) - (at(i + 2, 1) - at(i, 1)) / 6,
      at(i + 1, 0),
      at(i + 1, 1)
    )
  }
  g.closePath()
}

/**
 * The body, painted once: a deep base, two lighter layers offset toward the light so it reads as
 * a lit, translucent cell, the painted pattern, a nucleus and a few granules placed from the
 * creature's id, and a thin bright membrane.
 */
export function paintBodyArt(g: Graphics, o: RenderOrganism, p: BodyPalette): void {
  const r = o.radius
  const accent = hexToNumber(o.accentColor)
  g.clear()
  traceOutline(g, o.outline, 1)
  g.fill({ color: p.deep, alpha: 0.88 })
  traceOutline(g, o.outline, 0.86, -r * 0.05, -r * 0.06)
  g.fill({ color: p.mid, alpha: 0.72 })
  traceOutline(g, o.outline, 0.55, -r * 0.12, -r * 0.14)
  g.fill({ color: p.light, alpha: 0.5 })

  if (o.pattern === 1) {
    traceOutline(g, o.outline, 0.5)
    g.fill({ color: accent, alpha: 0.35 })
  } else if (o.pattern === 2) {
    for (let i = 0; i + 1 < o.outline.length; i += 2) {
      g.circle((o.outline[i] as number) * 0.72, (o.outline[i + 1] as number) * 0.72, r * 0.1).fill({
        color: accent,
        alpha: 0.55
      })
    }
  } else if (o.pattern === 3) {
    g.circle(-r * 0.2, 0, r * 0.3).fill({ color: accent, alpha: 0.5 })
  }

  // Organelles: a nucleus toward the front (so the heading reads) and granules around it.
  const phase = phaseOf(o.id)
  g.circle(r * 0.22, -r * 0.1, r * 0.2).fill({ color: p.deep, alpha: 0.7 })
  for (let i = 0; i < 4; i++) {
    const angle = phase + i * 1.9
    const radius = r * (0.3 + (0.16 * ((i * 37) % 3)) / 3)
    g.circle(Math.cos(angle) * radius, Math.sin(angle) * radius, r * 0.05).fill({
      color: p.light,
      alpha: 0.45
    })
  }

  // A faint inner line, then the membrane.
  traceOutline(g, o.outline, 0.9)
  g.stroke({ width: Math.max(0.2, r * 0.025), color: p.rim, alpha: 0.16 })
  traceOutline(g, o.outline, 1)
  g.stroke({ width: Math.max(0.35, r * 0.035), color: p.rim, alpha: 0.5 })
}

/** The angle of a part as seen from the body's centre, falling back to its axis when it sits at the centre. */
function placement(part: PartSnapshot, bodyRadius: number): number {
  return Math.hypot(part.x, part.y) > bodyRadius * 0.06
    ? Math.atan2(part.y, part.x)
    : part.orientation
}

/** The parts that sit behind the body: tails and the halo. Cleared first. */
function drawBack(g: Graphics, o: RenderOrganism, p: BodyPalette, time: number): void {
  g.clear()
  const r = o.radius
  const phase = phaseOf(o.id)
  let index = 0
  for (const part of o.parts) {
    index++
    const alpha = part.functional ? 1 : 0.35
    const t = part.functional ? time : 0
    if (part.type === 'flagellum') {
      // The part is anchored on the outline and points outward; its tail trails along that axis.
      const dirX = Math.cos(part.orientation)
      const dirY = Math.sin(part.orientation)
      const polygon = tailPolygon({
        baseX: part.x - dirX * r * 0.05,
        baseY: part.y - dirY * r * 0.05,
        dirX,
        dirY,
        length: r * 1.5 + part.radius * 5,
        baseWidth: Math.max(r * 0.06, part.radius * 0.35),
        time: t,
        phase: phase + index * 1.3,
        rate: beatRate(o.speedRatio)
      })
      g.poly(polygon).fill({ color: p.tail, alpha: 0.85 * alpha })
    } else if (part.type === 'membrane') {
      const halo = 0.14 + 0.08 * pulse(t, phase)
      traceOutline(g, o.outline, 1.2)
      g.stroke({ width: Math.max(0.3, r * 0.07), color: p.halo, alpha: halo * alpha })
    }
  }
}

/**
 * A mouth, drawn by its form so the diet is readable at a glance (ADR 0017): a sprout's leafy tuft,
 * a proboscis' thin tube, a mandible's pincers, a radula's toothed scraper and a jaw's hinged V.
 * It sits on the rim and points along the part's axis; `open` in `[0.3, 1]` animates it.
 */
function drawMouth(
  g: Graphics,
  part: PartSnapshot,
  r: number,
  open: number,
  alpha: number,
  p: BodyPalette
): void {
  const s = Math.max(part.radius, r * 0.12) * 1.5
  const ux = Math.cos(part.orientation)
  const uy = Math.sin(part.orientation)
  const vx = -uy
  const vy = ux
  const bx = part.x
  const by = part.y
  const at = (along: number, across: number): [number, number] => [
    bx + ux * along + vx * across,
    by + uy * along + vy * across
  ]
  const line = (
    from: [number, number],
    to: [number, number],
    width: number,
    color: number,
    a: number
  ): void => {
    g.moveTo(from[0], from[1])
      .lineTo(to[0], to[1])
      .stroke({ width: Math.max(0.25, width), color, alpha: a * alpha, cap: 'round' })
  }
  switch (part.form) {
    case 0: {
      // sprout: a fan of three leaves
      for (const k of [-1, 0, 1]) {
        const reach = s * (1.5 + 0.4 * open) * (k === 0 ? 1.2 : 1)
        line(at(0, 0), at(reach, k * s * 0.9), s * 0.45, LEAF, 0.95)
        g.circle(...at(reach, k * s * 0.9), Math.max(0.25, s * 0.22)).fill({
          color: LEAF,
          alpha: 0.9 * alpha
        })
      }
      break
    }
    case 1: {
      // proboscis: a thin tube that extends and retracts
      const length = s * (1.6 + 1.4 * open)
      line(at(0, 0), at(length, 0), s * 0.32, DARK, 0.85)
      g.circle(...at(length, 0), Math.max(0.25, s * 0.28)).fill({ color: DARK, alpha: 0.9 * alpha })
      break
    }
    case 2: {
      // mandible: two pincers that close on what they hold
      for (const side of [-1, 1]) {
        const gap = s * (1.0 - 0.55 * (1 - open))
        const points = [
          ...at(0, side * s * 0.5),
          ...at(s * 1.2, side * gap),
          ...at(s * 1.9, side * s * 0.2)
        ]
        g.poly(points, false).stroke({
          width: Math.max(0.3, s * 0.42),
          color: DARK,
          alpha: 0.9 * alpha,
          cap: 'round',
          join: 'round'
        })
      }
      break
    }
    case 3: {
      // radula: a bar across the mouth with a row of rasping teeth
      line(at(s * 0.5, -s), at(s * 0.5, s), s * 0.55, p.tail, 0.9)
      for (const k of [-0.7, 0, 0.7]) {
        line(at(s * 0.5, k * s), at(s * (1.2 + 0.4 * open), k * s), s * 0.2, DARK, 0.9)
      }
      break
    }
    default: {
      // jaw: a hinge that opens and shuts, with teeth
      const spread = 0.2 + 0.55 * open
      for (const side of [-1, 1]) {
        const a = part.orientation + side * spread
        const tip: [number, number] = [bx + Math.cos(a) * s * 2.4, by + Math.sin(a) * s * 2.4]
        line([bx, by], tip, s * 0.5, DARK, 0.92)
        const mid: [number, number] = [bx + Math.cos(a) * s * 1.6, by + Math.sin(a) * s * 1.6]
        const inward: [number, number] = [
          mid[0] - Math.sin(a) * side * -s * 0.45,
          mid[1] + Math.cos(a) * side * -s * 0.45
        ]
        line(mid, inward, s * 0.18, WHITE, 0.9)
      }
      break
    }
  }
  g.circle(bx, by, Math.max(0.25, s * 0.4 * open)).fill({ color: DARK, alpha: 0.8 * alpha })
}

/** The parts on and in the body: plates, gut, cilia, feelers, mouth, eyes. Cleared first. */
function drawFront(g: Graphics, o: RenderOrganism, p: BodyPalette, time: number): void {
  g.clear()
  const r = o.radius
  const phase = phaseOf(o.id)
  const speedRate = beatRate(o.speedRatio)
  const order: readonly PartSnapshot['type'][] = [
    'armor',
    'skeleton',
    'intestine',
    'stomach',
    'lipid',
    'gyro',
    'mender',
    'cilia',
    'sniffer',
    'join',
    'eyestalk',
    'pheromone',
    'mouth',
    'eye'
  ]
  for (const type of order) {
    let index = 0
    for (const part of o.parts) {
      if (part.type !== type) continue
      index++
      const alpha = part.functional ? 1 : 0.35
      const t = part.functional ? time : 0
      const offset = phase + index * 1.7
      switch (type) {
        case 'armor': {
          const centre = placement(part, r)
          for (let k = -2; k <= 2; k++) {
            const a = centre + k * 0.2
            const rim = exitPoint(o.outline, 0, 0, Math.cos(a), Math.sin(a))
            g.moveTo(rim.x * 0.92, rim.y * 0.92)
              .lineTo(rim.x * 1.05, rim.y * 1.05)
              .stroke({
                width: Math.max(0.5, r * 0.12),
                color: ARMOR,
                alpha: 0.85 * alpha,
                cap: 'round'
              })
          }
          break
        }
        case 'intestine': {
          const radius = Math.max(part.radius, r * 0.12)
          g.moveTo(part.x + radius, part.y)
          for (let k = 1; k <= 24; k++) {
            const angle = (k / 24) * TAU * 2.2
            const spiral = radius * (1 - 0.5 * (k / 24))
            g.lineTo(part.x + Math.cos(angle) * spiral, part.y + Math.sin(angle) * spiral)
          }
          g.stroke({ width: Math.max(0.25, radius * 0.3), color: p.gut, alpha: 0.55 * alpha })
          break
        }
        case 'stomach': {
          const radius = Math.max(part.radius, r * 0.15)
          g.circle(part.x, part.y, radius).fill({ color: 0xffffff, alpha: 0.1 * alpha })
          g.circle(part.x, part.y, radius).stroke({
            width: Math.max(0.2, radius * 0.1),
            color: 0xffffff,
            alpha: 0.3 * alpha
          })
          // The contents grow with the creature's energy.
          const wobble = 1 + 0.05 * Math.sin(t * 2 + offset)
          g.circle(part.x, part.y, radius * 0.9 * Math.sqrt(o.energyRatio) * wobble).fill({
            color: p.gut,
            alpha: 0.75 * alpha
          })
          break
        }
        case 'mender': {
          const size = part.radius * (0.8 + 0.25 * pulse(t, offset, 3))
          g.rect(part.x - size, part.y - size * 0.3, size * 2, size * 0.6).fill({
            color: HEAL,
            alpha: 0.9 * alpha
          })
          g.rect(part.x - size * 0.3, part.y - size, size * 0.6, size * 2).fill({
            color: HEAL,
            alpha: 0.9 * alpha
          })
          break
        }
        case 'skeleton': {
          // a spine along its axis with ribs across it
          const end = {
            x: part.x + Math.cos(part.orientation) * Math.max(part.length, r * 0.4),
            y: part.y + Math.sin(part.orientation) * Math.max(part.length, r * 0.4)
          }
          g.moveTo(part.x, part.y)
            .lineTo(end.x, end.y)
            .stroke({
              width: Math.max(0.4, r * 0.07),
              color: p.light,
              alpha: 0.7 * alpha,
              cap: 'round'
            })
          for (const k of [0.3, 0.55, 0.8]) {
            const cx = part.x + (end.x - part.x) * k
            const cy = part.y + (end.y - part.y) * k
            const nx = -Math.sin(part.orientation) * r * 0.16
            const ny = Math.cos(part.orientation) * r * 0.16
            g.moveTo(cx - nx, cy - ny)
              .lineTo(cx + nx, cy + ny)
              .stroke({
                width: Math.max(0.3, r * 0.04),
                color: p.light,
                alpha: 0.6 * alpha,
                cap: 'round'
              })
          }
          break
        }
        case 'lipid': {
          const radius = Math.max(part.radius * 1.2, r * 0.14)
          g.circle(part.x, part.y, radius).fill({ color: FAT, alpha: 0.55 * alpha })
          g.circle(part.x - radius * 0.3, part.y - radius * 0.3, radius * 0.3).fill({
            color: 0xffffff,
            alpha: 0.4 * alpha
          })
          break
        }
        case 'gyro': {
          const radius = Math.max(part.radius, r * 0.12)
          g.circle(part.x, part.y, radius).stroke({
            width: Math.max(0.3, r * 0.04),
            color: p.light,
            alpha: 0.8 * alpha
          })
          for (const k of [0, 1]) {
            const a = t * 3 + (k * Math.PI) / 2
            g.moveTo(part.x - Math.cos(a) * radius, part.y - Math.sin(a) * radius)
              .lineTo(part.x + Math.cos(a) * radius, part.y + Math.sin(a) * radius)
              .stroke({ width: Math.max(0.3, r * 0.035), color: p.light, alpha: 0.8 * alpha })
          }
          break
        }
        case 'join':
        case 'eyestalk': {
          // a stalk from the rim along the axis; whatever hangs from it is drawn at its own anchor
          const reach = Math.max(part.length, r * 0.15)
          const tip = {
            x: part.x + Math.cos(part.orientation) * reach,
            y: part.y + Math.sin(part.orientation) * reach
          }
          g.moveTo(part.x, part.y)
            .lineTo(tip.x, tip.y)
            .stroke({
              width: Math.max(0.4, r * (type === 'join' ? 0.12 : 0.07)),
              color: p.tail,
              alpha: 0.9 * alpha,
              cap: 'round'
            })
          g.circle(tip.x, tip.y, Math.max(0.3, r * 0.05)).fill({
            color: p.tail,
            alpha: 0.9 * alpha
          })
          break
        }
        case 'pheromone': {
          // three arcs of scent drifting outwards
          const wave = pulse(t, offset, 1.2)
          for (const k of [1, 2, 3]) {
            const reach = r * (0.1 + 0.07 * k) * (0.8 + 0.4 * wave)
            const a0 = part.orientation - 0.5
            const a1 = part.orientation + 0.5
            g.arc(part.x, part.y, reach, a0, a1).stroke({
              width: Math.max(0.3, r * 0.03),
              color: FAT,
              alpha: (0.8 - 0.2 * k) * alpha
            })
          }
          break
        }
        case 'cilia': {
          const hairs = ciliaRow(
            o.outline,
            placement(part, r),
            1.3,
            Math.max(r * 0.35, part.radius * 1.6),
            t,
            offset,
            speedRate
          )
          for (const hair of hairs) {
            g.moveTo(hair.x0, hair.y0).quadraticCurveTo(hair.x1, hair.y1, hair.x2, hair.y2)
          }
          g.stroke({ width: Math.max(0.25, r * 0.035), color: p.cilia, alpha: 0.6 * alpha })
          break
        }
        case 'sniffer': {
          // Anchored on the outline: the feelers start at the part itself.
          const base = { x: part.x, y: part.y }
          for (const side of [-1, 1]) {
            const angle = part.orientation + side * 0.3
            const points = feelerPoints(
              base.x,
              base.y,
              angle,
              r * 1.1 + part.radius * 2,
              t,
              offset + side,
              6
            )
            g.poly(points, false).stroke({
              width: Math.max(0.3, r * 0.05),
              color: p.tail,
              alpha: 0.7 * alpha
            })
            const tipX = points[points.length - 2] as number
            const tipY = points[points.length - 1] as number
            g.circle(tipX, tipY, Math.max(0.3, r * 0.06)).fill({
              color: p.light,
              alpha: 0.85 * alpha
            })
          }
          break
        }
        case 'mouth': {
          drawMouth(g, part, r, mouthOpen(t, offset), alpha, p)
          break
        }
        case 'eye': {
          const radius = Math.max(part.radius, r * 0.13)
          const blink = blinkOpen(t, offset)
          const pupil = pupilOffset(t, offset)
          const cos = Math.cos(part.orientation)
          const sin = Math.sin(part.orientation)
          g.ellipse(part.x, part.y, radius, radius * blink).fill({
            color: WHITE,
            alpha: 0.92 * alpha
          })
          const px = part.x + (pupil.x * cos - pupil.y * sin) * radius * 0.4
          const py = part.y + (pupil.x * sin + pupil.y * cos) * radius * 0.4
          g.ellipse(px, py, radius * 0.55, radius * 0.55 * blink).fill({ color: DARK, alpha })
          g.circle(px - radius * 0.15, py - radius * 0.2, radius * 0.16).fill({
            color: 0xffffff,
            alpha: 0.5 * alpha * blink
          })
          break
        }
      }
    }
  }
}

/** Redraws a creature's moving parts at `time` seconds: the back layer (tails, halo) and the front layer. */
export function drawParts(
  back: Graphics,
  front: Graphics,
  o: RenderOrganism,
  p: BodyPalette,
  time: number
): void {
  drawBack(back, o, p, time)
  drawFront(front, o, p, time)
}
