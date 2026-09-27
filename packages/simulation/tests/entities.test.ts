import { describe, expect, it } from 'vitest'
import { IdGenerator } from '../src/entities/IdGenerator'
import { OrganismStore } from '../src/entities/OrganismStore'
import type { OrganismState } from '../src/entities/OrganismStore'
import { ResourceStore } from '../src/entities/ResourceStore'
import type { ResourceState } from '../src/entities/ResourceStore'

describe('IdGenerator', () => {
  it('allocates a strictly increasing sequence starting at 0', () => {
    const ids = new IdGenerator()
    expect(ids.nextId).toBe(0)
    expect(ids.allocate()).toBe(0)
    expect(ids.allocate()).toBe(1)
    expect(ids.allocate()).toBe(2)
    expect(ids.nextId).toBe(3)
  })

  it('never reuses an id, even across many allocations', () => {
    const ids = new IdGenerator()
    const seen = new Set<number>()
    for (let i = 0; i < 10_000; i++) {
      const id = ids.allocate()
      expect(seen.has(id)).toBe(false)
      seen.add(id)
    }
  })
})

const organism = (id: number, overrides: Partial<OrganismState> = {}): OrganismState => ({
  id,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  heading: 0,
  age: 0,
  energy: 50,
  ...overrides
})

describe('OrganismStore', () => {
  it('adds, gets, and reports size', () => {
    const store = new OrganismStore()
    expect(store.size).toBe(0)
    store.add(organism(1))
    store.add(organism(2))
    expect(store.size).toBe(2)
    expect(store.get(1)?.id).toBe(1)
    expect(store.has(2)).toBe(true)
    expect(store.has(3)).toBe(false)
    expect(store.get(3)).toBeUndefined()
  })

  it('rejects adding a duplicate id', () => {
    const store = new OrganismStore()
    store.add(organism(1))
    expect(() => store.add(organism(1))).toThrow(RangeError)
  })

  it('removes organisms and reports whether one was present', () => {
    const store = new OrganismStore()
    store.add(organism(1))
    expect(store.remove(1)).toBe(true)
    expect(store.remove(1)).toBe(false)
    expect(store.size).toBe(0)
  })

  it('requires ids in strictly increasing order, matching the shared IdGenerator', () => {
    const store = new OrganismStore()
    store.add(organism(5))
    expect(() => store.add(organism(3))).toThrow(RangeError)
    expect(() => store.add(organism(5))).toThrow(RangeError)
  })

  it('values() stays in ascending id order across interleaved adds and removes', () => {
    const store = new OrganismStore()
    store.add(organism(1))
    store.add(organism(3))
    store.add(organism(5))
    store.remove(3)
    store.add(organism(7))
    expect(store.values().map((o) => o.id)).toEqual([1, 5, 7])
  })

  it('never allows an id to be reused, even after the entity holding it is removed', () => {
    const store = new OrganismStore()
    store.add(organism(5))
    store.remove(5)
    expect(() => store.add(organism(5))).toThrow(RangeError)
  })

  it('values() returns a fresh array each call, but the same live, mutable objects', () => {
    const store = new OrganismStore()
    store.add(organism(1))
    const first = store.values()
    const second = store.values()
    expect(first).not.toBe(second)
    expect(first[0]).toBe(second[0])
    ;(first[0] as OrganismState).energy = 999
    expect(store.get(1)?.energy).toBe(999)
  })
})

const resource = (id: number, overrides: Partial<ResourceState> = {}): ResourceState => ({
  id,
  x: 0,
  y: 0,
  remaining: 30,
  ...overrides
})

describe('ResourceStore', () => {
  it('behaves the same way as OrganismStore for the shared contract', () => {
    const store = new ResourceStore()
    store.add(resource(1))
    store.add(resource(2))
    expect(store.values().map((r) => r.id)).toEqual([1, 2])
    expect(store.size).toBe(2)
    expect(() => store.add(resource(1))).toThrow(RangeError)
    expect(() => store.add(resource(2))).toThrow(RangeError)
    expect(store.remove(1)).toBe(true)
    expect(store.has(1)).toBe(false)
    expect(store.get(2)?.remaining).toBe(30)
  })
})
