import { defineConfig } from 'vitest/config'

// Measurement probes (tests/probe/*.probe.ts) are not tests: they run many worlds for many ticks
// and write a report. Run them explicitly with `pnpm --filter @evo/simulation probe`; they are
// never part of `pnpm test` or the determinism suite.
export default defineConfig({
  test: {
    include: ['tests/probe/**/*.probe.ts'],
    testTimeout: 6 * 60 * 60 * 1000
  }
})
