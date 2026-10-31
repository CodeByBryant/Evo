import { defineConfig } from 'vitest/config'

// The long-run determinism suite (100k-tick runs, golden hashes) is deliberately excluded from
// the default `pnpm test`: it's slow by design and belongs to the separate, non-required
// Determinism CI job (see vitest.determinism.config.ts and .github/workflows/quality.yml).
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/determinism/**'],
    // Several tests run thousands of ticks of the brain controller, which is about three times
    // as costly per tick as the reflex controller; the 5s default flakes under load.
    testTimeout: 60_000
  }
})
