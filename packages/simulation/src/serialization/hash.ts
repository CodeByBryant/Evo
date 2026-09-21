import { utf8Encode } from './utf8'

/**
 * Version of the canonical state-hash layout (determinism.md, section 7.3). Any change to the
 * field list, order, or encoding requires bumping this and regenerating the golden hashes.
 */
export const HASH_SCHEMA_VERSION = 1

const HEADER_MAGIC = 'EVOH'

const scratch = new DataView(new ArrayBuffer(8))

function hex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0')
}

/**
 * Streaming 128-bit hasher (cyrb128-style, four 32-bit lanes) with explicit, engine-independent
 * byte encodings. Floats are written as exact big-endian IEEE-754 bits; never as text.
 */
export class StateHasher {
  private h1 = 1779033703
  private h2 = 3144134277
  private h3 = 1013904242
  private h4 = 2773480762

  /** A hasher that already contains the versioned header (`"EVOH"` then the schema version). */
  static withHeader(): StateHasher {
    const hasher = new StateHasher()
    for (const byte of utf8Encode(HEADER_MAGIC)) hasher.writeUint8(byte)
    hasher.writeUint32(HASH_SCHEMA_VERSION)
    return hasher
  }

  writeUint8(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new RangeError('writeUint8 requires an integer in [0, 255]')
    }
    this.absorb(value)
    return this
  }

  writeBoolean(value: boolean): this {
    return this.writeUint8(value ? 1 : 0)
  }

  /** Four bytes, big-endian. */
  writeUint32(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError('writeUint32 requires an integer in [0, 2^32 - 1]')
    }
    this.absorb((value >>> 24) & 0xff)
    this.absorb((value >>> 16) & 0xff)
    this.absorb((value >>> 8) & 0xff)
    this.absorb(value & 0xff)
    return this
  }

  /**
   * Eight bytes: the exact IEEE-754 bits, big-endian. `-0` is canonicalized to `+0`.
   * Throws on NaN and infinities: hashing invalid state would only hide the bug.
   */
  writeFloat64(value: number): this {
    if (!Number.isFinite(value)) {
      throw new RangeError('writeFloat64 requires a finite number')
    }
    scratch.setFloat64(0, value === 0 ? 0 : value, false)
    for (let i = 0; i < 8; i++) this.absorb(scratch.getUint8(i))
    return this
  }

  /** The UTF-8 byte length as a uint32, then the bytes. */
  writeString(value: string): this {
    const bytes = utf8Encode(value)
    this.writeUint32(bytes.length)
    for (const byte of bytes) this.absorb(byte)
    return this
  }

  /** 32 lowercase hex digits. Does not consume the hasher; more data may be written afterwards. */
  digest(): string {
    let { h1, h2, h3, h4 } = this
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
    h1 ^= h2 ^ h3 ^ h4
    h2 ^= h1
    h3 ^= h1
    h4 ^= h1
    return hex32(h1) + hex32(h2) + hex32(h3) + hex32(h4)
  }

  private absorb(byte: number): void {
    this.h1 = this.h2 ^ Math.imul(this.h1 ^ byte, 597399067)
    this.h2 = this.h3 ^ Math.imul(this.h2 ^ byte, 2869860233)
    this.h3 = this.h4 ^ Math.imul(this.h3 ^ byte, 951274213)
    this.h4 = this.h1 ^ Math.imul(this.h4 ^ byte, 2716044179)
  }
}
