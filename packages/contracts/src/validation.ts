/** Outcome of validating data. Validation reports problems; it never repairs them. */
export interface ValidationResult {
  readonly ok: boolean
  /** Human-readable messages naming the offending field, e.g. `resources.spawnRate must be ...`. */
  readonly errors: readonly string[]
}
