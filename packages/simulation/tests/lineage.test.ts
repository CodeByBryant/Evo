import { describe, expect, it } from 'vitest'
import { LineageStore } from '../src/lineage/LineageStore'

/**
 * Genome ids double as organism ids here to keep the fixture readable:
 *
 *   0   1        10          (founders; 10 is unrelated to 0 and 1)
 *    \ / \
 *     2   3       2 = (0,1)  3 = (0,1)
 *      \ /
 *       4         4 = (2,3)
 *        \
 *         5       5 = (4,10)
 */
function build(): LineageStore {
  const store = new LineageStore()
  const add = (id: number, parents: number[], tick: number): void =>
    store.register({ genomeId: id, parentGenomeIds: parents, organismId: id, tick })
  add(0, [], 0)
  add(1, [], 0)
  add(10, [], 0)
  add(2, [0, 1], 5)
  add(3, [0, 1], 6)
  add(4, [2, 3], 12)
  add(5, [4, 10], 20)
  return store
}

describe('LineageStore: records', () => {
  it('stores what the roadmap asks for about each genome', () => {
    expect(build().record(4)).toEqual({
      genomeId: 4,
      parentGenomeIds: [2, 3],
      organismIds: [4],
      createdAtTick: 12,
      descendantCount: 1
    })
  })

  it('returns undefined for a genome it has never seen', () => {
    expect(build().record(99)).toBeUndefined()
  })

  it('counts every genome ever registered', () => {
    expect(build().size).toBe(7)
    expect(new LineageStore().size).toBe(0)
  })

  it('stores parents in ascending order whatever order they were given', () => {
    const store = new LineageStore()
    store.register({ genomeId: 0, parentGenomeIds: [], organismId: 0, tick: 0 })
    store.register({ genomeId: 1, parentGenomeIds: [], organismId: 1, tick: 0 })
    store.register({ genomeId: 2, parentGenomeIds: [1, 0], organismId: 2, tick: 1 })
    expect(store.parentsOf(2)).toEqual([0, 1])
  })

  it('rejects registering the same genome twice', () => {
    const store = build()
    expect(() =>
      store.register({ genomeId: 2, parentGenomeIds: [], organismId: 2, tick: 30 })
    ).toThrow(RangeError)
  })

  it('rejects a genome whose parent was never registered', () => {
    const store = new LineageStore()
    expect(() =>
      store.register({ genomeId: 5, parentGenomeIds: [3], organismId: 5, tick: 1 })
    ).toThrow(RangeError)
  })

  it('hands out copies, so callers cannot corrupt the store', () => {
    const store = build()
    store.parentsOf(4).push(99)
    store.ancestorsOf(4).push(99)
    store.descendantsOf(0).push(99)
    store.founders().push(99)
    ;(store.record(4)!.parentGenomeIds as number[]).push(99)
    expect(store.parentsOf(4)).toEqual([2, 3])
    expect(store.ancestorsOf(4)).toEqual([0, 1, 2, 3])
    expect(store.descendantsOf(0)).toEqual([2, 3, 4, 5])
    expect(store.founders()).toEqual([0, 1, 10])
    expect(store.record(4)!.parentGenomeIds).toEqual([2, 3])
  })
})

describe('LineageStore: parent, ancestor and descendant lookup', () => {
  const store = build()

  it('finds parents', () => {
    expect(store.parentsOf(0)).toEqual([])
    expect(store.parentsOf(5)).toEqual([4, 10])
    expect(store.parentsOf(99)).toEqual([])
  })

  it('finds every ancestor transitively, once each, ascending', () => {
    // 4 reaches 0 and 1 by two different paths; each appears once.
    expect(store.ancestorsOf(4)).toEqual([0, 1, 2, 3])
    expect(store.ancestorsOf(5)).toEqual([0, 1, 2, 3, 4, 10])
    expect(store.ancestorsOf(0)).toEqual([])
  })

  it('finds every descendant transitively, once each, ascending', () => {
    expect(store.descendantsOf(0)).toEqual([2, 3, 4, 5])
    expect(store.descendantsOf(2)).toEqual([4, 5])
    expect(store.descendantsOf(10)).toEqual([5])
    expect(store.descendantsOf(5)).toEqual([])
  })

  it('does not count a genome as its own ancestor or descendant', () => {
    expect(store.ancestorsOf(4)).not.toContain(4)
    expect(store.descendantsOf(4)).not.toContain(4)
  })

  it('computes descendantCount on demand from the descendants', () => {
    expect(store.record(0)!.descendantCount).toBe(4)
    expect(store.record(10)!.descendantCount).toBe(1)
    expect(store.record(5)!.descendantCount).toBe(0)
  })

  it('reports no ancestry for an unknown genome', () => {
    expect(store.ancestorsOf(99)).toEqual([])
    expect(store.descendantsOf(99)).toEqual([])
  })
})

describe('LineageStore: common ancestor', () => {
  const store = build()

  it('is the most recent shared ancestor of siblings', () => {
    expect(store.commonAncestor(2, 3)).toBe(1) // shared parents 0 and 1; the more recent is 1
  })

  it('counts a genome as its own ancestor, so ancestor and descendant share the ancestor', () => {
    expect(store.commonAncestor(4, 0)).toBe(0)
    expect(store.commonAncestor(5, 4)).toBe(4)
    expect(store.commonAncestor(4, 4)).toBe(4)
  })

  it('finds an ancestor reached through different branches', () => {
    expect(store.commonAncestor(5, 3)).toBe(3)
    expect(store.commonAncestor(5, 1)).toBe(1)
  })

  it('is null when the ancestries never meet', () => {
    expect(store.commonAncestor(10, 0)).toBeNull()
    expect(store.commonAncestor(10, 2)).toBeNull()
  })

  it('is null when either genome is unknown', () => {
    expect(store.commonAncestor(99, 0)).toBeNull()
    expect(store.commonAncestor(0, 99)).toBeNull()
  })

  it('is symmetric', () => {
    for (const [a, b] of [
      [2, 3],
      [5, 3],
      [4, 10],
      [5, 0]
    ] as const) {
      expect(store.commonAncestor(a, b)).toBe(store.commonAncestor(b, a))
    }
  })
})

describe('LineageStore: founders', () => {
  const store = build()

  it('lists founders in ascending order', () => {
    expect(store.founders()).toEqual([0, 1, 10])
  })

  it('identifies founders', () => {
    expect(store.isFounder(0)).toBe(true)
    expect(store.isFounder(10)).toBe(true)
    expect(store.isFounder(4)).toBe(false)
    expect(store.isFounder(99)).toBe(false)
  })
})

describe('LineageStore: death and lineage extinction', () => {
  it('keeps a genome’s record after its organism dies', () => {
    const store = build()
    store.markDeath(2)
    expect(store.record(2)).toBeDefined()
    expect(store.parentsOf(4)).toEqual([2, 3])
    expect(store.ancestorsOf(4)).toContain(2)
  })

  it('is not extinct while the genome itself has a living organism', () => {
    const store = build()
    expect(store.isLineageExtinct(2)).toBe(false)
  })

  it('is not extinct while any descendant lives, even if the genome itself has died', () => {
    const store = build()
    store.markDeath(0)
    store.markDeath(2)
    store.markDeath(3)
    // 0 died, but its descendants 4 and 5 still live.
    expect(store.isLineageExtinct(0)).toBe(false)
    expect(store.isLineageExtinct(2)).toBe(false)
  })

  it('is extinct once the genome and every descendant have died', () => {
    const store = build()
    for (const id of [0, 2, 3, 4, 5]) store.markDeath(id)
    expect(store.isLineageExtinct(0)).toBe(true)
    expect(store.isLineageExtinct(2)).toBe(true)
    // 1 and 10 still live, and 10 is an ancestor of 5 but not descended from 0.
    expect(store.isLineageExtinct(1)).toBe(false)
    expect(store.isLineageExtinct(10)).toBe(false)
  })

  it('is extinct for a genome that was never registered', () => {
    expect(build().isLineageExtinct(99)).toBe(true)
  })

  it('does not revive a lineage: a dead organism stays dead', () => {
    const store = build()
    for (const id of [0, 1, 2, 3, 4, 5, 10]) store.markDeath(id)
    for (const id of [0, 1, 2, 3, 4, 5, 10]) expect(store.isLineageExtinct(id)).toBe(true)
  })

  it('ignores deaths of organisms it does not know and repeated deaths', () => {
    const store = build()
    expect(() => {
      store.markDeath(999)
      store.markDeath(5)
      store.markDeath(5)
    }).not.toThrow()
    expect(store.isLineageExtinct(5)).toBe(true)
    expect(store.isLineageExtinct(4)).toBe(false)
  })
})

describe('LineageStore: scale', () => {
  it('stays consistent across a long chain of generations', () => {
    const store = new LineageStore()
    store.register({ genomeId: 0, parentGenomeIds: [], organismId: 0, tick: 0 })
    store.register({ genomeId: 1, parentGenomeIds: [], organismId: 1, tick: 0 })
    for (let id = 2; id < 500; id++) {
      store.register({ genomeId: id, parentGenomeIds: [id - 1, id - 2], organismId: id, tick: id })
    }
    expect(store.ancestorsOf(499)).toHaveLength(499)
    expect(store.descendantsOf(0)).toHaveLength(498)
    expect(store.record(0)!.descendantCount).toBe(498)
    expect(store.commonAncestor(499, 250)).toBe(250)
    expect(store.size).toBe(500)
  })
})
