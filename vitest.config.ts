import { defineConfig } from 'vitest/config'

// Running `vitest` from the repository root runs every workspace package.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*']
  }
})
