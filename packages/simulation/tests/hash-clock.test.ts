import { describe, expect, it } from 'vitest'
import { HASH_SCHEMA_VERSION, SimulationClock, StateHasher, utf8Encode } from '../src/index'

/** Test vectors from docs/simulation/determinism.md, section 10. */
describe('StateHasher', () => {
  it('matches the published vectors', () => {
    expect(new StateHasher().digest()).toBe('027ae52ecfc796215593990d4b41437c')
    expect(StateHasher.withHeader().digest()).toBe('900b01e9654563a45806cca4a0353b67')
    const sample = StateHasher.withHeader()
      .writeUint32(7)
      .writeFloat64(-0)
      .writeFloat64(0.5)
      .writeUint8(1)
    expect(sample.digest()).toBe('a81b84c3f1dd01f771fbffcae405f4e6')
  })

  it('canonicalizes -0 to +0', () => {
    const negative = StateHasher.withHeader()
      .writeUint32(7)
      .writeFloat64(-0)
      .writeFloat64(0.5)
      .writeUint8(1)
    const positive = StateHasher.withHeader()
      .writeUint32(7)
      .writeFloat64(0)
      .writeFloat64(0.5)
      .writeUint8(1)
    expect(negative.digest()).toBe(positive.digest())
  })

  it('throws on NaN and infinities instead of hashing them', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(() => new StateHasher().writeFloat64(bad)).toThrow(RangeError)
    }
  })

  it('distinguishes numerically close floats (exact bit pattern)', () => {
    const a = new StateHasher().writeFloat64(0.1 + 0.2).digest()
    const b = new StateHasher().writeFloat64(0.3).digest()
    expect(a).not.toBe(b)
  })

  it('validates integer widths', () => {
    expect(() => new StateHasher().writeUint8(256)).toThrow(RangeError)
    expect(() => new StateHasher().writeUint8(-1)).toThrow(RangeError)
    expect(() => new StateHasher().writeUint8(1.5)).toThrow(RangeError)
    expect(() => new StateHasher().writeUint32(2 ** 32)).toThrow(RangeError)
    expect(() => new StateHasher().writeUint32(-1)).toThrow(RangeError)
    expect(() => new StateHasher().writeUint32(2 ** 32 - 1)).not.toThrow()
  })

  it('writes integers big-endian', () => {
    const viaUint32 = new StateHasher().writeUint32(0x01020304).digest()
    const viaBytes = new StateHasher()
      .writeUint8(1)
      .writeUint8(2)
      .writeUint8(3)
      .writeUint8(4)
      .digest()
    expect(viaUint32).toBe(viaBytes)
  })

  it('writes strings as a length prefix plus UTF-8 bytes', () => {
    const viaString = new StateHasher().writeString('héllo').digest()
    const bytes = utf8Encode('héllo')
    const manual = new StateHasher().writeUint32(bytes.length)
    for (const byte of bytes) manual.writeUint8(byte)
    expect(viaString).toBe(manual.digest())
  })

  it('digest does not consume the hasher', () => {
    const hasher = new StateHasher().writeUint32(1)
    const first = hasher.digest()
    expect(hasher.digest()).toBe(first)
    hasher.writeUint32(2)
    expect(hasher.digest()).toBe(new StateHasher().writeUint32(1).writeUint32(2).digest())
    expect(hasher.digest()).not.toBe(first)
  })

  it('is order sensitive and produces 32 lowercase hex digits', () => {
    const ab = new StateHasher().writeUint8(1).writeUint8(2).digest()
    const ba = new StateHasher().writeUint8(2).writeUint8(1).digest()
    expect(ab).not.toBe(ba)
    expect(ab).toMatch(/^[0-9a-f]{32}$/)
  })

  it('exposes the schema version written into the header', () => {
    expect(HASH_SCHEMA_VERSION).toBe(1)
  })

  it('writes booleans as one byte', () => {
    expect(new StateHasher().writeBoolean(true).digest()).toBe(
      new StateHasher().writeUint8(1).digest()
    )
    expect(new StateHasher().writeBoolean(false).digest()).toBe(
      new StateHasher().writeUint8(0).digest()
    )
  })
})

describe('utf8Encode', () => {
  it('encodes 1-, 2-, 3- and 4-byte sequences', () => {
    expect(Array.from(utf8Encode('A'))).toEqual([0x41])
    expect(Array.from(utf8Encode('é'))).toEqual([0xc3, 0xa9])
    expect(Array.from(utf8Encode('€'))).toEqual([0xe2, 0x82, 0xac])
    expect(Array.from(utf8Encode('\u{1F600}'))).toEqual([0xf0, 0x9f, 0x98, 0x80])
    expect(Array.from(utf8Encode(''))).toEqual([])
  })

  it('replaces lone surrogates with U+FFFD', () => {
    expect(Array.from(utf8Encode('\ud800'))).toEqual([0xef, 0xbf, 0xbd])
    expect(Array.from(utf8Encode('\udc00x'))).toEqual([0xef, 0xbf, 0xbd, 0x78])
  })
})

describe('SimulationClock', () => {
  it('starts at tick 0 and advances exactly one tick per step', () => {
    const clock = new SimulationClock(0.1)
    expect(clock.state()).toEqual({ tick: 0, time: 0, deltaTime: 0.1 })
    clock.advance()
    clock.advance()
    expect(clock.tick).toBe(2)
  })

  it('computes time by multiplication, so it never drifts', () => {
    const clock = new SimulationClock(0.1)
    for (let i = 0; i < 100_000; i++) clock.advance()
    expect(clock.time).toBe(100_000 * 0.1)
    // Accumulating 0.1 a hundred thousand times would not give the same number.
    let accumulated = 0
    for (let i = 0; i < 100_000; i++) accumulated += 0.1
    expect(accumulated).not.toBe(clock.time)
  })

  it('time depends only on the tick', () => {
    const a = new SimulationClock(0.25)
    const b = new SimulationClock(0.25)
    for (let i = 0; i < 40; i++) a.advance()
    b.restore(40)
    expect(b.time).toBe(a.time)
  })

  it('rejects invalid time steps', () => {
    for (const bad of [0, -1, Number.NaN, Infinity]) {
      expect(() => new SimulationClock(bad)).toThrow(RangeError)
    }
  })

  it('validates restored ticks', () => {
    const clock = new SimulationClock(1)
    for (const bad of [-1, 1.5, Number.NaN, 2 ** 53]) {
      expect(() => clock.restore(bad)).toThrow(RangeError)
    }
    clock.restore(12)
    expect(clock.tick).toBe(12)
  })

  it('refuses to overflow the tick counter', () => {
    const clock = new SimulationClock(1)
    clock.restore(Number.MAX_SAFE_INTEGER)
    expect(() => clock.advance()).toThrow(RangeError)
  })
})
