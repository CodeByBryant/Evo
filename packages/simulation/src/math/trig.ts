/**
 * Deterministic `sin`, `cos`, `atan2` and `ln`.
 *
 * These are ports of the fdlibm algorithms (Sun Microsystems, freely redistributable) built only
 * from operations that IEEE-754 defines exactly: `+ - * /`, comparisons, and bit access through a
 * `DataView`. The platform `Math.sin/cos/atan2/log` are implementation-defined in their last bits,
 * so shared seeds could otherwise diverge between JS engines (see docs/simulation/determinism.md).
 *
 * Domains (violations throw `RangeError` rather than returning garbage):
 * - `sin`, `cos`: finite `x` with `|x| <= MAX_TRIG_ARGUMENT`. The engine keeps angles wrapped, far
 *   inside this range; larger arguments would need Payne-Hanek reduction, which is not implemented.
 * - `atan2`: finite `y` and `x`.
 * - `ln`: finite `x > 0`.
 *
 * Accuracy is under about 1 ulp within the domain and is verified against the platform functions.
 */

/** Largest `|x|` accepted by `sin`/`cos`: keeps the Cody-Waite reduction exact. */
export const MAX_TRIG_ARGUMENT = 1_000_000

const scratch = new DataView(new ArrayBuffer(8))

/** High 32 bits of the binary64 representation, as a signed integer. */
function highWord(x: number): number {
  scratch.setFloat64(0, x, false)
  return scratch.getInt32(0, false)
}

/** Replaces the high 32 bits of `x`, keeping its low 32 bits. */
function withHighWord(x: number, high: number): number {
  scratch.setFloat64(0, x, false)
  scratch.setUint32(0, high >>> 0, false)
  return scratch.getFloat64(0, false)
}

/** True for negative numbers and for -0. */
function signBit(x: number): boolean {
  return x < 0 || Object.is(x, -0)
}

// ---------------------------------------------------------------------------------------------
// sin / cos
// ---------------------------------------------------------------------------------------------

const S1 = -1.66666666666666324348e-1
const S2 = 8.33333333332248946124e-3
const S3 = -1.98412698298579493134e-4
const S4 = 2.75573137070700676789e-6
const S5 = -2.50507602534068634195e-8
const S6 = 1.5896909952115501022e-10

const C1 = 4.16666666666666019037e-2
const C2 = -1.38888888888741095749e-3
const C3 = 2.48015872894767294178e-5
const C4 = -2.75573143513906633035e-7
const C5 = 2.0875723212981748279e-9
const C6 = -1.13596475577881948265e-11

const INV_PIO2 = 6.36619772367581382433e-1
const PIO2_1 = 1.57079632673412561417
const PIO2_1T = 6.0771005065061922493e-11
const QUARTER_PI = 7.853981633974483e-1

function kernelSin(x: number, y: number, hasTail: boolean): number {
  if (Math.abs(x) < 7.450580596923828e-9) return x // |x| < 2^-27: sin(x) == x
  const z = x * x
  const v = z * x
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))
  if (!hasTail) return x + v * (S1 + z * r)
  return x - (z * (0.5 * y - v * r) - y - v * S1)
}

function kernelCos(x: number, y: number): number {
  const ix = highWord(Math.abs(x))
  const z = x * x
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))))
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y)) // |x| < 0.3
  const qx = ix > 0x3fe90000 ? 0.28125 : withHighWord(0, ix - 0x00200000)
  const hz = 0.5 * z - qx
  const a = 1 - qx
  return a - (hz - (z * r - x * y))
}

interface Reduced {
  /** Quadrant count (may be negative); only `n & 3` matters. */
  n: number
  /** `x - n * pi/2` as a head and a tail. */
  y0: number
  y1: number
}

/** Cody-Waite reduction to `[-pi/4, pi/4]` for `pi/4 < |x| <= MAX_TRIG_ARGUMENT`. */
function reduce(x: number): Reduced {
  const ax = Math.abs(x)
  const fn = Math.floor(ax * INV_PIO2 + 0.5)
  const r = ax - fn * PIO2_1
  const w = fn * PIO2_1T
  const y0 = r - w
  const y1 = r - y0 - w
  return x < 0 ? { n: -fn, y0: -y0, y1: -y1 } : { n: fn, y0, y1 }
}

function assertTrigArgument(x: number, name: string): void {
  if (!Number.isFinite(x) || Math.abs(x) > MAX_TRIG_ARGUMENT) {
    throw new RangeError(`${name} requires a finite argument with |x| <= ${MAX_TRIG_ARGUMENT}`)
  }
}

/** Sine of `x` radians. */
export function sin(x: number): number {
  assertTrigArgument(x, 'sin')
  if (Math.abs(x) <= QUARTER_PI) return kernelSin(x, 0, false)
  const { n, y0, y1 } = reduce(x)
  switch (n & 3) {
    case 0:
      return kernelSin(y0, y1, true)
    case 1:
      return kernelCos(y0, y1)
    case 2:
      return -kernelSin(y0, y1, true)
    default:
      return -kernelCos(y0, y1)
  }
}

/** Cosine of `x` radians. */
export function cos(x: number): number {
  assertTrigArgument(x, 'cos')
  if (Math.abs(x) <= QUARTER_PI) return kernelCos(x, 0)
  const { n, y0, y1 } = reduce(x)
  switch (n & 3) {
    case 0:
      return kernelCos(y0, y1)
    case 1:
      return -kernelSin(y0, y1, true)
    case 2:
      return -kernelCos(y0, y1)
    default:
      return kernelSin(y0, y1, true)
  }
}

// ---------------------------------------------------------------------------------------------
// atan / atan2
// ---------------------------------------------------------------------------------------------

const ATAN_HI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558
] as const
const ATAN_LO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17
] as const
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1,
  -1.1111110405462355788e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
  6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2,
  -3.6531572744216915527e-2, 1.62858201153657823623e-2
] as const

const PI_O_2 = 1.570796326794896558
const PI = 3.141592653589793
const PI_LO = 1.2246467991473532e-16
const TINY = 1e-300

/** Reads a table entry that is guaranteed to exist. */
function at<T>(table: readonly T[], index: number): T {
  return table[index] as T
}

function atan(input: number): number {
  const negative = input < 0
  let x = Math.abs(input)
  if (x >= 73786976294838206464) {
    // |x| >= 2^66: atan(x) == +-pi/2 to working precision
    const value = at(ATAN_HI, 3) + at(ATAN_LO, 3)
    return negative ? -value : value
  }
  let id: number
  if (x < 0.4375) {
    if (x < 1.862645149230957e-9) return input // |x| < 2^-29
    id = -1
  } else if (x < 1.1875) {
    if (x < 0.6875) {
      id = 0
      x = (2 * x - 1) / (2 + x)
    } else {
      id = 1
      x = (x - 1) / (x + 1)
    }
  } else if (x < 2.4375) {
    id = 2
    x = (x - 1.5) / (1 + 1.5 * x)
  } else {
    id = 3
    x = -1 / x
  }
  const z = x * x
  const w = z * z
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))))
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))))
  if (id < 0) {
    const value = x - x * (s1 + s2)
    return negative ? -value : value
  }
  const value = at(ATAN_HI, id) - (x * (s1 + s2) - at(ATAN_LO, id) - x)
  return negative ? -value : value
}

/**
 * Angle in radians in `[-pi, pi]` of the point `(x, y)`, measured counter-clockwise from +x.
 * Signed zeros follow the usual conventions (`atan2(+-0, -x)` is `+-pi`).
 */
export function atan2(y: number, x: number): number {
  if (!Number.isFinite(y) || !Number.isFinite(x)) {
    throw new RangeError('atan2 requires finite arguments')
  }
  if (x === 1) return atan(y)
  const m = (signBit(y) ? 1 : 0) | (signBit(x) ? 2 : 0) // 2 * sign(x) + sign(y)
  if (y === 0) {
    switch (m) {
      case 0:
      case 1:
        return y
      case 2:
        return PI + TINY
      default:
        return -PI - TINY
    }
  }
  if (x === 0) return y < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY

  const ix = highWord(Math.abs(x)) & 0x7fffffff
  const iy = highWord(Math.abs(y)) & 0x7fffffff
  const k = (iy - ix) >> 20
  let z: number
  let quadrant = m
  if (k > 60) {
    z = PI_O_2 + 0.5 * PI_LO
    quadrant = m & 1
  } else if (x < 0 && k < -60) {
    z = 0
  } else {
    z = atan(Math.abs(y / x))
  }
  switch (quadrant) {
    case 0:
      return z
    case 1:
      return -z
    case 2:
      return PI - (z - PI_LO)
    default:
      return z - PI_LO - PI
  }
}

// ---------------------------------------------------------------------------------------------
// ln
// ---------------------------------------------------------------------------------------------

const LN2_HI = 6.9314718036912381649e-1
const LN2_LO = 1.9082149292705877e-10
const TWO54 = 1.8014398509481984e16
const LG1 = 6.66666666666673513e-1
const LG2 = 3.999999999940941908e-1
const LG3 = 2.857142874366239149e-1
const LG4 = 2.222219843214978396e-1
const LG5 = 1.818357216161805012e-1
const LG6 = 1.531383769920937332e-1
const LG7 = 1.479819860511658591e-1

/** Natural logarithm of `x`, for finite `x > 0`. */
export function ln(input: number): number {
  if (!Number.isFinite(input) || input <= 0) {
    throw new RangeError('ln requires a finite argument greater than zero')
  }
  let x = input
  let k = 0
  let hx = highWord(x)
  if (hx < 0x00100000) {
    // subnormal: scale up by 2^54
    k -= 54
    x *= TWO54
    hx = highWord(x)
  }
  k += (hx >> 20) - 1023
  hx &= 0x000fffff
  const i0 = (hx + 0x95f64) & 0x100000
  x = withHighWord(x, hx | (i0 ^ 0x3ff00000)) // normalize x into [sqrt(2)/2, sqrt(2)]
  k += i0 >> 20
  const f = x - 1
  const dk = k

  if ((0x000fffff & (2 + hx)) < 3) {
    // |f| < 2^-20
    if (f === 0) return k === 0 ? 0 : dk * LN2_HI + dk * LN2_LO
    const r = f * f * (0.5 - 0.3333333333333333 * f)
    return k === 0 ? f - r : dk * LN2_HI - (r - dk * LN2_LO - f)
  }

  const s = f / (2 + f)
  const z = s * s
  const w = z * z
  const t1 = w * (LG2 + w * (LG4 + w * LG6))
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)))
  const r = t2 + t1
  const i = (hx - 0x6147a) | (0x6b851 - hx)
  if (i > 0) {
    const hfsq = 0.5 * f * f
    return k === 0
      ? f - (hfsq - s * (hfsq + r))
      : dk * LN2_HI - (hfsq - (s * (hfsq + r) + dk * LN2_LO) - f)
  }
  return k === 0 ? f - s * (f - r) : dk * LN2_HI - (s * (f - r) - dk * LN2_LO - f)
}
