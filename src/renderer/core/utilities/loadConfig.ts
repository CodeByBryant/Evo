import type { EvolutionConfig } from '../EvolutionManager'
import AgentConfigData from './AgentConfig.json'

export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  generationTime: 3000,
  selectionRate: 0.3,
  mutationRate: 0.05,
  populationSize: 100,
  reproductionThreshold: 80,
  maxAge: 5000
}

export function loadEvolutionConfig(): EvolutionConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configData = AgentConfigData as any

  if (configData.EvolutionSettings) {
    return {
      generationTime:
        configData.EvolutionSettings.GenerationTime ?? DEFAULT_EVOLUTION_CONFIG.generationTime,
      selectionRate:
        configData.EvolutionSettings.SelectionRate ?? DEFAULT_EVOLUTION_CONFIG.selectionRate,
      mutationRate:
        configData.EvolutionSettings.MutationRate ?? DEFAULT_EVOLUTION_CONFIG.mutationRate,
      populationSize:
        configData.EvolutionSettings.PopulationSize ?? DEFAULT_EVOLUTION_CONFIG.populationSize,
      reproductionThreshold:
        configData.EvolutionSettings.ReproductionThreshold ??
        DEFAULT_EVOLUTION_CONFIG.reproductionThreshold,
      maxAge: configData.EvolutionSettings.MaxAge ?? DEFAULT_EVOLUTION_CONFIG.maxAge
    }
  }

  return { ...DEFAULT_EVOLUTION_CONFIG }
}
