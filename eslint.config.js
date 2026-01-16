import js from '@eslint/js'
import tsConfigPkg from '@electron-toolkit/eslint-config-ts'
import prettierConfig from '@electron-toolkit/eslint-config-prettier'

const { configs: tsConfigs } = tsConfigPkg

export default [
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**', 'build/**', '*.config.ts', '*.config.js']
  },
  js.configs.recommended,
  ...tsConfigs.recommended,
  prettierConfig
]
