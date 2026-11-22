/**
 * A deep copy of plain data: numbers, strings, booleans, `null`, `undefined`, arrays, typed arrays,
 * `Map`s, `Set`s and plain objects. Objects reached twice are copied once, so a genome shared by a
 * creature and its egg is still one object in the copy, and cycles are fine. Anything else (a class
 * instance, a function, a symbol) throws: a saved world state is data only, and a function or an
 * instance that slipped in would silently stay linked to the live world.
 *
 * Written here instead of using the host's `structuredClone` because the simulation package takes no
 * host APIs (docs/simulation/determinism.md), and so it checks what it copies.
 */
export function cloneData<T>(value: T): T {
  return copy(value, new Map()) as T
}

function copy(value: unknown, seen: Map<object, unknown>): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') {
      throw new TypeError(`cannot copy a ${typeof value} as plain data`)
    }
    return value
  }
  const known = seen.get(value)
  if (known !== undefined) return known

  if (Array.isArray(value)) {
    const out: unknown[] = new Array<unknown>(value.length)
    seen.set(value, out)
    for (let i = 0; i < value.length; i++) out[i] = copy(value[i], seen)
    return out
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as { slice(): unknown; constructor: { name: string } }
    if (value instanceof DataView) throw new TypeError('cannot copy a DataView as plain data')
    const out = view.slice()
    seen.set(value, out)
    return out
  }
  if (value instanceof Map) {
    const out = new Map<unknown, unknown>()
    seen.set(value, out)
    for (const [k, v] of value) out.set(copy(k, seen), copy(v, seen))
    return out
  }
  if (value instanceof Set) {
    const out = new Set<unknown>()
    seen.set(value, out)
    for (const v of value) out.add(copy(v, seen))
    return out
  }
  const prototype = Object.getPrototypeOf(value) as object | null
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      `cannot copy an instance of ${(prototype.constructor as { name?: string } | undefined)?.name ?? 'a class'} as plain data`
    )
  }
  const out: Record<string, unknown> = prototype === null ? Object.create(null) : {}
  seen.set(value, out)
  // The copy has the same keys in the same order whatever that order is; nothing reads it as a sequence.
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new TypeError('cannot copy a symbol key as plain data')
    out[key] = copy((value as Record<string, unknown>)[key], seen)
  }
  return out
}
