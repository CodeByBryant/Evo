import { describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Genome, SpeciesDistanceWeights, WorldConfigOverrides } from '@evo/contracts'
import { World, buildBodySpecs, buildGeneSpecs, genomeDistance } from '../../src/index'

/**
 * What makes a species (docs/species): how many species a world ends with under a set of distance
 * weights and a threshold, how often a birth founds one, and how far apart living creatures are in
 * each part of the genome. A measurement, not a test; the report goes to
 * `<tmpdir>/evo-probe/species.txt`. Species do not feed back into the default world (reproductive
 * isolation is off), so every variant of a seed is the same world counted differently.
 *
 * Environment: `SPECIES_SEEDS` (default `1,2,3`), `SPECIES_TICKS` (default 30000),
 * `SPECIES_THRESHOLDS` (comma-separated), `SPECIES_WEIGHTS` (JSON), `SPECIES_OLD=0` to skip the
 * old-weights row, `SPECIES_OUT` (the report's file name).
 */
const SEEDS = (process.env.SPECIES_SEEDS ?? '1,2,3').split(',').map(Number)
const TICKS = Number(process.env.SPECIES_TICKS ?? 30_000)

const OLD: SpeciesDistanceWeights = {
  physical: 0.2,
  metabolic: 0.2,
  behavioral: 0.1,
  reproduction: 0.05,
  learning: 0.05,
  brain: 0.3,
  body: 0
}
/** The candidate: the body plan leads, the brain counts for less (any two brains differ by about 0.2). */
const CANDIDATE: SpeciesDistanceWeights = {
  physical: 0.1,
  metabolic: 0.05,
  behavioral: 0.05,
  reproduction: 0.1,
  learning: 0.05,
  brain: 0.15,
  body: 0.5
}
const WEIGHTS: SpeciesDistanceWeights =
  process.env.SPECIES_WEIGHTS === undefined
    ? CANDIDATE
    : (JSON.parse(process.env.SPECIES_WEIGHTS) as SpeciesDistanceWeights)
const THRESHOLDS = (process.env.SPECIES_THRESHOLDS ?? '0.08,0.1,0.12').split(',').map(Number)
const VARIANTS: Array<{ name: string; weights: SpeciesDistanceWeights; threshold: number }> = [
  ...(process.env.SPECIES_OLD === '0'
    ? []
    : [{ name: 'old weights 0.06', weights: OLD, threshold: 0.06 }]),
  ...THRESHOLDS.map((threshold) => ({
    name: `candidate ${threshold}`,
    weights: WEIGHTS,
    threshold
  }))
]

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const p90 = (xs: number[]): number =>
  xs.length ? ([...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] as number) : 0

describe('species probe', () => {
  it('counts species under each variant and measures the distances between the living', () => {
    const lines: string[] = []
    for (const seed of SEEDS) {
      let components = ''
      for (const variant of VARIANTS) {
        const config: WorldConfigOverrides = {
          species: { threshold: variant.threshold, distanceWeights: variant.weights }
        }
        const world = World.create({ seed, config })
        world.run(TICKS)
        const snapshot = world.snapshot()
        const born = snapshot.metrics.organismsBorn
        const living = world.species.active()
        const sizes = living.map((s) => s.memberCount).sort((a, b) => b - a)
        lines.push(
          `seed ${seed} ${variant.name.padEnd(18)} pop ${String(snapshot.organisms.length).padStart(3)} ` +
            `living species ${String(living.length).padStart(3)} founded ${String(world.species.size).padStart(4)} ` +
            `of ${born} births (${((world.species.size / Math.max(1, born)) * 100).toFixed(1)}%) ` +
            `largest ${sizes.slice(0, 4).join('/')}`
        )
        if (components === '') {
          const specs = buildGeneSpecs(world.config)
          const bodySpecs = buildBodySpecs(world.config.anatomy)
          const std = world.config.genetics.brain.initialWeightStd
          const genomes = snapshot.organisms.map((o) => world.genomeOf(o.id) as Genome)
          const keys = [
            'physical',
            'metabolic',
            'behavioral',
            'reproduction',
            'learning',
            'brain',
            'body',
            'appearance'
          ] as const
          const samples: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, []]))
          for (let i = 0; i < genomes.length; i++) {
            for (let j = i + 1; j < genomes.length; j += 3) {
              const d = genomeDistance(
                genomes[i] as Genome,
                genomes[j] as Genome,
                specs,
                std,
                bodySpecs
              )
              for (const k of keys) (samples[k] as number[]).push(d[k])
            }
          }
          const plans = new Set(
            snapshot.organisms.map((o) =>
              (world.anatomyOf(o.id)?.anatomy.parts ?? []).map((p) => p.type).join(',')
            )
          )
          components =
            `seed ${seed} pairwise among the living (mean / p90): ` +
            keys
              .map(
                (k) =>
                  `${k} ${mean(samples[k] as number[]).toFixed(3)}/${p90(samples[k] as number[]).toFixed(3)}`
              )
              .join('  ') +
            `  distinct part lists ${plans.size}`
        }
      }
      lines.push(components, '')
    }
    const dir = join(tmpdir(), 'evo-probe')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, process.env.SPECIES_OUT ?? 'species.txt'), lines.join('\n'))
  })
})
