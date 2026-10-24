export type PlainObject = Record<string, unknown>

export const isObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export interface NumberRule {
  integer?: boolean
  /** Value must be strictly greater than zero. */
  positive?: boolean
  /** Value must be zero or greater. */
  nonnegative?: boolean
}

export function checkNumber(
  section: PlainObject,
  key: string,
  path: string,
  rule: NumberRule,
  errors: string[]
): number | undefined {
  const value = section[key]
  if (value === undefined) {
    errors.push(`${path} is required`)
    return undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number`)
    return undefined
  }
  if (rule.integer && !Number.isInteger(value)) {
    errors.push(`${path} must be an integer`)
    return undefined
  }
  if (rule.positive && value <= 0) {
    errors.push(
      rule.integer
        ? `${path} must be an integer greater than zero`
        : `${path} must be greater than zero`
    )
    return undefined
  }
  if (rule.nonnegative && value < 0) {
    errors.push(`${path} must be nonnegative`)
    return undefined
  }
  return value
}

/** A multiplier in `(0, 1]` (juvenile scaling factors). */
export function checkFraction(
  section: PlainObject,
  key: string,
  path: string,
  errors: string[]
): number | undefined {
  const value = checkNumber(section, key, path, {}, errors)
  if (value === undefined) return undefined
  if (value <= 0 || value > 1) {
    errors.push(`${path} must be greater than zero and at most one`)
    return undefined
  }
  return value
}

export function checkKeys(
  section: PlainObject,
  allowed: string[],
  path: string,
  errors: string[]
): void {
  for (const key of Object.keys(section)) {
    if (!allowed.includes(key)) {
      errors.push(`unknown property "${path === '' ? key : `${path}.${key}`}"`)
    }
  }
}

export function checkSection(
  root: PlainObject,
  key: string,
  allowed: string[],
  errors: string[],
  path: string = key
): PlainObject | undefined {
  const section = root[key]
  if (section === undefined) {
    errors.push(`${path} is required`)
    return undefined
  }
  if (!isObject(section)) {
    errors.push(`${path} must be an object`)
    return undefined
  }
  checkKeys(section, allowed, path, errors)
  return section
}

export function checkChoice(
  section: PlainObject,
  key: string,
  path: string,
  choices: string[],
  errors: string[]
): string | undefined {
  const value = section[key]
  if (value === undefined) {
    errors.push(`${path} is required`)
    return undefined
  }
  if (typeof value !== 'string' || !choices.includes(value)) {
    errors.push(`${path} must be one of: ${choices.join(', ')}`)
    return undefined
  }
  return value
}
