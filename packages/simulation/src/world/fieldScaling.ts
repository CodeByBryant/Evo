import type { WorldConfig } from '@evo/contracts'

/** The field size the terrain and hazard numbers in the defaults were tuned for (ADR 0021). */
export const REFERENCE_FIELD_SIZE = 500

/**
 * The configuration a field-layout world runs with when it is not 500 x 500 (ADR 0021): the things
 * that make up the *place* scale with its area, so a bigger world has more biomes and more hazards of
 * the same size and density; the things that make up the *population* do not, so a bigger world is
 * the same food and the same creatures spread thinner (the point of making it bigger). Region seed
 * count, static hazard count and the storm rate scale with the area, and the region lookup grid
 * keeps its cell size. Food supply (`spawnRate`, `maxCount`, `initialCount`), organism counts, the
 * patch size of the food pattern and everything else are untouched. At the reference size the same
 * object comes back, so a 500 x 500 world is exactly what it was.
 */
export function fieldScaling(config: WorldConfig): WorldConfig {
  const { width, height } = config.environment
  const area = (width * height) / (REFERENCE_FIELD_SIZE * REFERENCE_FIELD_SIZE)
  if (width === REFERENCE_FIELD_SIZE && height === REFERENCE_FIELD_SIZE) return config
  const side = Math.max(width, height) / REFERENCE_FIELD_SIZE
  const { regions, hazards } = config.ecology
  return {
    ...config,
    ecology: {
      ...config.ecology,
      regions: {
        ...regions,
        seedCount: Math.max(1, Math.round(regions.seedCount * area)),
        gridSize: Math.max(2, Math.round(regions.gridSize * side))
      },
      hazards: {
        ...hazards,
        areaCount: hazards.areaCount === 0 ? 0 : Math.max(1, Math.round(hazards.areaCount * area)),
        stormRate: hazards.stormRate * area
      }
    }
  }
}
