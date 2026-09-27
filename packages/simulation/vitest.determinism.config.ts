import { defineConfig } from 'vitest/config'

// The long-run determinism suite: 100k-tick runs and golden state hashes. Run explicitly via
// `pnpm test:determinism`, not part of the default `pnpm test` (see vitest.config.ts).
export default defineConfig({
  test: {
    include: ['tests/determinism/**/*.test.ts'],
    // Several tests run more than one 100k-tick simulation; the default 5s budget is too tight.
    testTimeout: 60_000
  }
})
