import { defineConfig } from 'vitest/config'

// The long-run determinism suite (100k-tick runs, golden hashes) is deliberately excluded from
// the default `pnpm test`: it's slow by design and belongs to the separate, non-required
// Determinism CI job (see vitest.determinism.config.ts and .github/workflows/quality.yml).
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/determinism/**']
  }
})
