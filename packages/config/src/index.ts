export { DEFAULT_GENE_RANGES, DEFAULT_WORLD_CONFIG } from './defaults'
export { geneBaselines, resolveGeneRanges } from './genetics'
export {
  ConfigValidationError,
  resolveWorldConfig,
  validateSeed,
  validateWorldConfig
} from './validation'
export { DEFAULT_PRESET, PRESETS, presetByName } from './presets'
export type { WorldPreset } from './presets'
export { DEFAULT_ANATOMY } from './anatomy'
export {
  SETTINGS,
  SETTING_GROUPS,
  applyDotted,
  changesToOverrides,
  diffAgainst,
  mergeOverrides,
  formatSettingValue,
  parseSettingValue,
  settingByPath,
  valueAt
} from './settings'
export type { SettingDescriptor, SettingGroup, SettingValue } from './settings'
