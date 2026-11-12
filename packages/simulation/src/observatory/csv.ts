import { BRAIN_INPUT_GROUPS } from '@evo/contracts'
import type { EvolutionSample, EvolutionSeries } from '@evo/contracts'

/** The columns of the observatory CSV, in order, each with how to read it from a sample. */
const COLUMNS: readonly { readonly name: string; readonly read: (s: EvolutionSample) => number }[] =
  [
    { name: 'tick', read: (s) => s.tick },
    { name: 'time', read: (s) => s.time },
    { name: 'population', read: (s) => s.population },
    { name: 'newPlans', read: (s) => s.newPlans },
    { name: 'plansEver', read: (s) => s.plansEver },
    { name: 'plansAlive', read: (s) => s.plansAlive },
    { name: 'persistentPlans', read: (s) => s.persistentPlans },
    { name: 'effectivePlans', read: (s) => s.effectivePlans },
    { name: 'bodySpread', read: (s) => s.bodySpread },
    { name: 'partsMean', read: (s) => s.partsMean },
    { name: 'partsMax', read: (s) => s.partsMax },
    { name: 'partTypes', read: (s) => s.partTypes },
    { name: 'priorDrift', read: (s) => s.priorDrift },
    { name: 'brainSpread', read: (s) => s.brainSpread },
    { name: 'learnedGap', read: (s) => s.learnedGap },
    ...BRAIN_INPUT_GROUPS.map((group) => ({
      name: `use_${group}`,
      read: (s: EvolutionSample) => s.inputUsage[group]
    })),
    { name: 'responseTypes', read: (s) => s.responseTypes },
    { name: 'responseSpread', read: (s) => s.responseSpread },
    { name: 'behaviourTypes', read: (s) => s.behaviourTypes },
    { name: 'behaviourSpread', read: (s) => s.behaviourSpread },
    { name: 'intakePlant', read: (s) => s.intakePlant },
    { name: 'intakeFlesh', read: (s) => s.intakeFlesh },
    { name: 'intakeCarrion', read: (s) => s.intakeCarrion },
    { name: 'rate', read: (s) => s.rate },
    { name: 'speciesAlive', read: (s) => s.speciesAlive },
    { name: 'speciesEver', read: (s) => s.speciesEver },
    { name: 'youngSpeciesShare', read: (s) => s.youngSpeciesShare },
    { name: 'foundersAlive', read: (s) => s.foundersAlive },
    { name: 'meanGeneration', read: (s) => s.meanGeneration },
    { name: 'maxGeneration', read: (s) => s.maxGeneration },
    { name: 'stasis', read: (s) => (s.stasis ? 1 : 0) }
  ]

/** The observatory's series as CSV: a header row and one row a sample, numbers to six places. */
export function observatoryCsv(series: EvolutionSeries): string {
  const header = COLUMNS.map((c) => c.name).join(',')
  const rows = series.samples.map((s) =>
    COLUMNS.map((c) => {
      const v = c.read(s)
      return Number.isInteger(v) ? String(v) : v.toFixed(6)
    }).join(',')
  )
  return [header, ...rows].join('\n') + '\n'
}
