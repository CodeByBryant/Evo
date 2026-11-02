import {
  BODY_SLOT_COUNT,
  PART_DEFINITIONS,
  PART_TYPES,
  slotGeneIndex,
  visualGeneIndex
} from '@evo/contracts'
import type { Anatomy, AnatomyConfig, AnatomyPart, PartDefinition } from '@evo/contracts'
import { cos, sin } from '../math/trig'

/** The part of a definition table the resolver needs; generic over the type names so tests can use their own. */
export interface DependencyRule {
  readonly type: string
  readonly requires: readonly string[]
  readonly provides: readonly string[]
}

/**
 * Decides which parts work. A part is functional when every capability token it requires is
 * provided by a functional part (ADR 0012 "Development"): a stinger needs stored toxin, which a
 * sac provides only if it has toxin, which a gland provides. Resolved to a fixed point, so the
 * order of the parts does not matter and a cycle simply never becomes functional.
 *
 * Returns one flag per entry of `types`, in order. Pure and deterministic.
 */
export function resolveFunctional(
  types: readonly string[],
  definitions: readonly DependencyRule[]
): boolean[] {
  const rules = types.map((type) => definitions.find((rule) => rule.type === type))
  const functional = rules.map((rule) => rule !== undefined && rule.requires.length === 0)
  const provided = new Set<string>()
  const collect = (): boolean => {
    let added = false
    rules.forEach((rule, index) => {
      if (!functional[index] || rule === undefined) return
      for (const token of rule.provides) {
        if (!provided.has(token)) {
          provided.add(token)
          added = true
        }
      }
    })
    return added
  }
  collect()
  // At most one new part becomes functional per pass, so `types.length` passes always suffice.
  for (let pass = 0; pass <= types.length; pass++) {
    let changed = false
    rules.forEach((rule, index) => {
      if (functional[index] || rule === undefined) return
      if (rule.requires.every((token) => provided.has(token))) {
        functional[index] = true
        changed = true
      }
    })
    if (!changed) break
    collect()
  }
  return functional
}

/**
 * Grows an anatomy from body genes (ADR 0012). A pure function with no randomness: the same genes
 * and configuration always give the same body, so an anatomy never needs to be saved.
 *
 * 1. Slots with `present = 1` become parts, in slot order.
 * 2. Parts are admitted while their total `size` stays within `structuralBudget`; a part that
 *    would exceed it does not develop (its slot is reported as undeveloped), so lower slots win.
 * 3. Each part is placed at `offset * (cos angle, sin angle)` in body-radius units (x forward).
 * 4. Dependencies are resolved: a part with an unmet requirement is kept but not functional.
 */
export function developAnatomy(
  body: readonly number[],
  config: AnatomyConfig,
  definitions: readonly PartDefinition[] = PART_DEFINITIONS
): Anatomy {
  const admitted: Omit<AnatomyPart, 'functional'>[] = []
  const undeveloped: number[] = []
  let sizeUsed = 0
  for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
    if (body[slotGeneIndex(slot, 'present')] !== 1) continue
    const type = PART_TYPES[body[slotGeneIndex(slot, 'type')] as number]
    if (type === undefined) continue
    const size = body[slotGeneIndex(slot, 'size')] as number
    if (sizeUsed + size > config.structuralBudget) {
      undeveloped.push(slot)
      continue
    }
    sizeUsed += size
    const angle = body[slotGeneIndex(slot, 'angle')] as number
    const offset = body[slotGeneIndex(slot, 'offset')] as number
    admitted.push({
      slot,
      type,
      size,
      angle,
      offset,
      orientation: body[slotGeneIndex(slot, 'orientation')] as number,
      param: body[slotGeneIndex(slot, 'param')] as number,
      x: offset * cos(angle),
      y: offset * sin(angle)
    })
  }
  const functional = resolveFunctional(
    admitted.map((part) => part.type),
    definitions
  )
  return {
    parts: admitted.map((part, index) => ({ ...part, functional: functional[index] === true })),
    undeveloped,
    sizeUsed,
    look: {
      shape: body[visualGeneIndex('shape')] as number,
      pattern: body[visualGeneIndex('pattern')] as number,
      accentHue: body[visualGeneIndex('accentHue')] as number
    }
  }
}
