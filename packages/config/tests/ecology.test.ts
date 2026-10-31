import { describe, expect, it } from 'vitest'
import type { WorldConfig } from '@evo/contracts'
import { DEFAULT_WORLD_CONFIG, resolveWorldConfig, validateWorldConfig } from '../src/index'

type Loose = Record<string, Record<string, unknown>>
type Kind = Record<string, unknown> & { regions?: unknown }

function errorsFor(mutate: (ecology: Loose) => void): string[] {
  const config = JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG)) as WorldConfig
  mutate((config as unknown as Loose)['ecology'] as unknown as Loose)
  return [...validateWorldConfig(config).errors]
}

describe('ecology config', () => {
  it('has valid defaults', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
  })

  it('is required and rejects unknown keys', () => {
    const config = JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG)) as Record<string, unknown>
    delete config['ecology']
    expect(validateWorldConfig(config).errors).toContain('ecology is required')
    expect(errorsFor((e) => (e['bogus'] = {}))).toContain('unknown property "ecology.bogus"')
  })

  describe('merging', () => {
    it('merges each feature field by field', () => {
      const config = resolveWorldConfig({
        ecology: { health: { enabled: true }, hazards: { areaCount: 9 } }
      })
      expect(config.ecology.health.enabled).toBe(true)
      expect(config.ecology.health.maxHealth).toBe(DEFAULT_WORLD_CONFIG.ecology.health.maxHealth)
      expect(config.ecology.hazards.areaCount).toBe(9)
      expect(config.ecology.hazards.areaDamage).toBe(
        DEFAULT_WORLD_CONFIG.ecology.hazards.areaDamage
      )
    })

    it('merges region types and seasons by name', () => {
      const config = resolveWorldConfig({
        ecology: {
          regions: { types: { desert: { temperature: 0.5 } } },
          seasons: { seasons: { winter: { regeneration: 0 } } }
        }
      })
      expect(config.ecology.regions.types.desert).toEqual({
        ...DEFAULT_WORLD_CONFIG.ecology.regions.types.desert,
        temperature: 0.5
      })
      expect(config.ecology.regions.types.cave).toEqual(
        DEFAULT_WORLD_CONFIG.ecology.regions.types.cave
      )
      expect(config.ecology.seasons.seasons.winter.regeneration).toBe(0)
      expect(config.ecology.seasons.seasons.winter.visibility).toBe(
        DEFAULT_WORLD_CONFIG.ecology.seasons.seasons.winter.visibility
      )
    })

    it('replaces the kinds list whole', () => {
      const kind = {
        name: 'moss',
        energyScale: 1,
        radiusScale: 1,
        spawnWeight: 1,
        detectability: 1,
        toxicity: 0,
        regions: []
      }
      const config = resolveWorldConfig({ ecology: { resourceKinds: { kinds: [kind] } } })
      expect(config.ecology.resourceKinds.kinds).toEqual([kind])
    })

    it('does not mutate the shared frozen defaults', () => {
      const config = resolveWorldConfig({
        ecology: { regions: { types: { cave: { visibility: 0.1 } } } }
      })
      config.ecology.regions.types.cave.visibility = 0.9
      expect(DEFAULT_WORLD_CONFIG.ecology.regions.types.cave.visibility).toBe(0.5)
    })
  })

  describe('health', () => {
    it('validates', () => {
      expect(errorsFor((e) => (e['health']!['enabled'] = 1))).toContain(
        'ecology.health.enabled must be a boolean'
      )
      expect(errorsFor((e) => (e['health']!['maxHealth'] = 0))).toContain(
        'ecology.health.maxHealth must be greater than zero'
      )
      expect(errorsFor((e) => (e['health']!['regenRate'] = -1))).toContain(
        'ecology.health.regenRate must be nonnegative'
      )
      expect(errorsFor((e) => (e['health']!['regenMinEnergyFraction'] = 1.5))).toContain(
        'ecology.health.regenMinEnergyFraction must be between 0 and 1'
      )
      expect(errorsFor((e) => delete e['health']!['regenEnergyCost'])).toContain(
        'ecology.health.regenEnergyCost is required'
      )
    })
  })

  describe('regions', () => {
    it('validates counts and the tolerance', () => {
      expect(errorsFor((e) => (e['regions']!['seedCount'] = 0))).toContain(
        'ecology.regions.seedCount must be an integer greater than zero'
      )
      expect(errorsFor((e) => (e['regions']!['gridSize'] = 2.5))).toContain(
        'ecology.regions.gridSize must be an integer'
      )
      expect(errorsFor((e) => (e['regions']!['temperatureTolerance'] = -0.1))).toContain(
        'ecology.regions.temperatureTolerance must be between 0 and 1'
      )
    })

    it('validates each type', () => {
      const types = (e: Loose): Loose => e['regions']!['types'] as Loose
      expect(errorsFor((e) => (types(e)['cave']!['visibility'] = 0))).toContain(
        'ecology.regions.types.cave.visibility must be greater than zero and at most one'
      )
      expect(errorsFor((e) => (types(e)['cave']!['movementScale'] = 1.2))).toContain(
        'ecology.regions.types.cave.movementScale must be greater than zero and at most one'
      )
      expect(errorsFor((e) => (types(e)['desert']!['temperature'] = 2))).toContain(
        'ecology.regions.types.desert.temperature must be between -1 and 1'
      )
      expect(errorsFor((e) => (types(e)['desert']!['hazardExposure'] = -1))).toContain(
        'ecology.regions.types.desert.hazardExposure must be nonnegative'
      )
      expect(errorsFor((e) => (types(e)['forest']!['reproductionScale'] = 0))).toContain(
        'ecology.regions.types.forest.reproductionScale must be greater than zero'
      )
      expect(errorsFor((e) => delete types(e)['forest'])).toContain(
        'ecology.regions.types.forest is required'
      )
      expect(errorsFor((e) => (types(e)['swamp'] = {}))).toContain(
        'unknown property "ecology.regions.types.swamp"'
      )
    })
  })

  describe('seasons', () => {
    it('validates length and each season', () => {
      const table = (e: Loose): Loose => e['seasons']!['seasons'] as Loose
      expect(errorsFor((e) => (e['seasons']!['seasonLength'] = 0))).toContain(
        'ecology.seasons.seasonLength must be greater than zero'
      )
      expect(errorsFor((e) => (table(e)['winter']!['regeneration'] = -1))).toContain(
        'ecology.seasons.seasons.winter.regeneration must be nonnegative'
      )
      expect(errorsFor((e) => (table(e)['winter']!['visibility'] = 2))).toContain(
        'ecology.seasons.seasons.winter.visibility must be greater than zero and at most one'
      )
      expect(errorsFor((e) => delete table(e)['autumn'])).toContain(
        'ecology.seasons.seasons.autumn is required'
      )
    })
  })

  describe('hazards', () => {
    it('validates', () => {
      expect(errorsFor((e) => (e['hazards']!['areaCount'] = -1))).toContain(
        'ecology.hazards.areaCount must be nonnegative'
      )
      expect(errorsFor((e) => (e['hazards']!['areaRadius'] = 0))).toContain(
        'ecology.hazards.areaRadius must be greater than zero'
      )
      expect(errorsFor((e) => (e['hazards']!['stormDuration'] = 0))).toContain(
        'ecology.hazards.stormDuration must be greater than zero'
      )
      expect(errorsFor((e) => (e['hazards']!['stormRate'] = -1))).toContain(
        'ecology.hazards.stormRate must be nonnegative'
      )
    })
  })

  describe('resource kinds', () => {
    const kinds = (e: Loose): Kind[] => e['resourceKinds']!['kinds'] as Kind[]

    it('rejects an empty or non-array list', () => {
      expect(errorsFor((e) => (e['resourceKinds']!['kinds'] = []))).toContain(
        'ecology.resourceKinds.kinds must not be empty'
      )
      expect(errorsFor((e) => (e['resourceKinds']!['kinds'] = 'grass'))).toContain(
        'ecology.resourceKinds.kinds must be an array'
      )
    })

    it('validates each kind', () => {
      expect(errorsFor((e) => (kinds(e)[0]!['energyScale'] = 0))).toContain(
        'ecology.resourceKinds.kinds[0].energyScale must be greater than zero'
      )
      expect(errorsFor((e) => (kinds(e)[1]!['detectability'] = 0))).toContain(
        'ecology.resourceKinds.kinds[1].detectability must be greater than zero and at most one'
      )
      expect(errorsFor((e) => (kinds(e)[1]!['toxicity'] = -1))).toContain(
        'ecology.resourceKinds.kinds[1].toxicity must be nonnegative'
      )
      expect(errorsFor((e) => (kinds(e)[2]!['name'] = ''))).toContain(
        'ecology.resourceKinds.kinds[2].name must be a non-empty string'
      )
      expect(errorsFor((e) => (kinds(e)[2]!['regions'] = ['moon']))).toContain(
        'ecology.resourceKinds.kinds[2].regions must only contain: meadow, forest, wetland, desert, cave, volcanic'
      )
      expect(errorsFor((e) => delete kinds(e)[3]!['regions'])).toContain(
        'ecology.resourceKinds.kinds[3].regions is required'
      )
      expect(errorsFor((e) => (kinds(e)[0]!['bogus'] = 1))).toContain(
        'unknown property "ecology.resourceKinds.kinds[0].bogus"'
      )
      expect(errorsFor((e) => (kinds(e)[0] = 5 as unknown as Kind))).toContain(
        'ecology.resourceKinds.kinds[0] must be an object'
      )
    })

    it('rejects all-zero spawn weights', () => {
      expect(errorsFor((e) => kinds(e).forEach((k) => (k['spawnWeight'] = 0)))).toContain(
        'ecology.resourceKinds.kinds spawnWeight must not all be zero'
      )
    })
  })

  describe('migration', () => {
    it('validates', () => {
      expect(errorsFor((e) => (e['migration']!['dwellTime'] = 0))).toContain(
        'ecology.migration.dwellTime must be greater than zero'
      )
      expect(errorsFor((e) => (e['migration']!['enabled'] = 'yes'))).toContain(
        'ecology.migration.enabled must be a boolean'
      )
    })
  })
})
