import {
  BODY_SLOT_COUNT,
  PART_DEFINITIONS,
  PART_EXTENT_STAT,
  PART_STATS,
  PART_STAT_COUNT,
  PART_TYPES,
  STAT_FIELDS,
  SURFACE_PARTS,
  slotGeneIndex,
  statValue,
  visualGeneIndex
} from '@evo/contracts'
import type { Anatomy, AnatomyConfig, AnatomyPart, PartDefinition } from '@evo/contracts'
import { atan2, cos, sin } from '../math/trig'
import { developOutline, rimAt } from './outline'

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

/** A part as it is being developed: its anchor and axis as vectors, before the angle is taken. */
interface Draft {
  part: Omit<AnatomyPart, 'functional'>
  axisX: number
  axisY: number
  /** Length along the axis in outline units (zero for parts without one). */
  extent: number
}

/**
 * Grows an anatomy from body genes (ADR 0012, 0016). A pure function with no randomness: the same
 * genes and configuration always give the same body, so an anatomy never needs to be saved.
 *
 * 1. Slots with `present = 1` become parts, in slot order.
 * 2. Parts are admitted while their total `size` stays within `structuralBudget`; a part that
 *    would exceed it does not develop (its slot is reported as undeveloped), so lower slots win.
 * 3. Each part is anchored. A part whose `parent` names an earlier, developed part hangs from it:
 *    its anchor is `offset` of the way along the parent's axis and it points `orientation` away
 *    from the parent's axis. Any other part attaches to the body: surface parts sit exactly on the
 *    outline at `angle`, interior parts at `offset` times the outline radius there. A body part
 *    points `orientation` away from the outline's outward direction, so it can never float.
 * 4. Stats are decoded to real units, and dependencies are resolved: a part with an unmet token
 *    requirement, or whose parent does not work, is kept but not functional.
 */
export function developAnatomy(
  body: readonly number[],
  config: AnatomyConfig,
  definitions: readonly PartDefinition[] = PART_DEFINITIONS
): Anatomy {
  const outline = developOutline(body)
  const drafts: Draft[] = []
  const draftOfSlot = new Map<number, number>()
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
    const orientation = body[slotGeneIndex(slot, 'orientation')] as number
    const integrity = body[slotGeneIndex(slot, 'integrity')] as number
    const stats = STAT_FIELDS.map((field) => body[slotGeneIndex(slot, field)] as number)
    const statValues: Record<string, number> = {}
    PART_STATS[type].slice(0, PART_STAT_COUNT).forEach((spec, index) => {
      statValues[spec.key] = statValue(spec, stats[index] as number)
    })
    const extentKey = PART_EXTENT_STAT[type]
    const extent =
      extentKey === undefined ? 0 : (statValues[extentKey] as number) * outline.areaRadius

    // A parent is a lower slot that developed; anything else attaches to the body.
    const parentGene = Math.round(body[slotGeneIndex(slot, 'parent')] as number)
    const parentDraft = parentGene >= 1 ? draftOfSlot.get(parentGene - 1) : undefined
    const parent = parentDraft === undefined ? undefined : (drafts[parentDraft] as Draft)

    let x: number
    let y: number
    let baseX: number
    let baseY: number
    if (parent === undefined) {
      const rim = rimAt(outline, angle)
      const depth = SURFACE_PARTS[type] ? 1 : offset
      x = rim.x * depth
      y = rim.y * depth
      baseX = rim.nx
      baseY = rim.ny
    } else {
      x = parent.part.x + parent.axisX * offset * parent.extent
      y = parent.part.y + parent.axisY * offset * parent.extent
      baseX = parent.axisX
      baseY = parent.axisY
    }
    const c = cos(orientation)
    const sn = sin(orientation)
    const axisX = baseX * c - baseY * sn
    const axisY = baseX * sn + baseY * c
    draftOfSlot.set(slot, drafts.length)
    drafts.push({
      part: {
        slot,
        type,
        parent: parent === undefined ? -1 : parent.part.slot,
        size,
        integrity,
        angle,
        offset,
        orientation,
        stats,
        statValues,
        x,
        y,
        axis: atan2(axisY, axisX),
        tipX: x + axisX * extent,
        tipY: y + axisY * extent
      },
      axisX,
      axisY,
      extent
    })
  }
  const working = resolveFunctional(
    drafts.map((draft) => draft.part.type),
    definitions
  )
  // A part whose parent does not work cannot work either; parents always come first in slot order.
  const slotIndex = new Map(drafts.map((draft, index) => [draft.part.slot, index]))
  drafts.forEach((draft, index) => {
    const parentIndex = draft.part.parent < 0 ? undefined : slotIndex.get(draft.part.parent)
    if (parentIndex !== undefined && working[parentIndex] !== true) working[index] = false
  })
  return {
    parts: drafts.map((draft, index) => ({ ...draft.part, functional: working[index] === true })),
    undeveloped,
    sizeUsed,
    outline,
    look: {
      pattern: body[visualGeneIndex('pattern')] as number,
      accentHue: body[visualGeneIndex('accentHue')] as number
    }
  }
}
