/**
 * Evolution Manager - Handles genetic algorithm, reproduction, and selection
 */

import { Agent } from './Agent'
import { SpeciesManager } from './SpeciesManager'
import { ClusterManager } from './ClusterManager'
import type { GeneticTraits } from '../types/simulation'
import AgentConfigData from './utilities/AgentConfig.json'

export interface EvolutionConfig {
  generationTime: number // Time per generation in steps
  selectionRate: number // Top % to survive
  mutationRate: number // Probability of mutation
  populationSize: number // Target population size
  reproductionThreshold: number // Energy needed to reproduce
  maxAge: number // Maximum age before death
}

export interface GenerationStats {
  generation: number
  population: number
  avgFitness: number
  maxFitness: number
  avgEnergy: number
  speciesCount: number
  births: number
  deaths: number
}

export class EvolutionManager {
  public generation: number = 0
  public stepCount: number = 0
  public config: EvolutionConfig
  public stats: GenerationStats[] = []
  public totalBirths: number = 0
  public totalDeaths: number = 0
  public speciesManager: SpeciesManager
  private lastGenerationElites: Agent[] = []
  private stepsWithZeroPopulation: number = 0
  private clusterManager: ClusterManager | null = null

  constructor(config: Partial<EvolutionConfig> = {}) {
    this.config = {
      generationTime: 3000,
      selectionRate: 0.3,
      mutationRate: 0.05,
      populationSize: 30,
      reproductionThreshold: 80,
      maxAge: 5000,
      ...config
    }
    this.speciesManager = new SpeciesManager()
    Agent.speciesManager = this.speciesManager
    Agent.maxAge = this.config.maxAge
  }

  public initializeGenePool(agents: Agent[]): void {
    if (agents.length > 0) {
      const sortedAgents = [...agents].sort((a, b) => b.fitness - a.fitness)
      const eliteCount = Math.max(2, Math.floor(agents.length * this.config.selectionRate))
      const elites = sortedAgents.slice(0, eliteCount)

      this.lastGenerationElites = elites.map((elite) => {
        const clone = new Agent(
          elite.position.x,
          elite.position.y,
          0,
          0,
          elite.geneticTraits,
          undefined,
          elite.species,
          undefined,
          elite.clusterId
        )
        clone.NeuralNetwork.transferWeightsFrom(elite.NeuralNetwork)
        return clone
      })
      console.log(
        `[EvolutionManager] Gene pool initialized with ${this.lastGenerationElites.length} elite templates`
      )
    }
  }

  public setConfig(config: EvolutionConfig): void {
    this.config = { ...config }
    Agent.maxAge = this.config.maxAge
    // Config changes take effect immediately
  }

  public reset(): void {
    console.log('[EvolutionManager] Resetting evolution manager')
    this.generation = 0
    this.stepCount = 0
    this.stats = []
    this.totalBirths = 0
    this.totalDeaths = 0
    this.stepsWithZeroPopulation = 0
    this.lastGenerationElites = []
    this.speciesManager.clear()
  }

  public setClusterManager(clusterManager: ClusterManager): void {
    this.clusterManager = clusterManager
  }

  public update(agents: Agent[]): { agents: Agent[]; newBirths: number; newDeaths: number } {
    this.stepCount++
    let newBirths = 0
    let newDeaths = 0

    // Update species populations
    this.updateSpeciesPopulations(agents)

    // Age all agents and handle death
    for (let i = agents.length - 1; i >= 0; i--) {
      const agent = agents[i]
      agent.age++

      // Death by starvation or old age
      if (agent.energy <= 0 || agent.age >= this.config.maxAge) {
        agents.splice(i, 1)
        newDeaths++
        this.totalDeaths++
      }
    }

    // Only track zero population when actively running (not paused)
    if (agents.length === 0) {
      this.stepsWithZeroPopulation++
    } else {
      this.stepsWithZeroPopulation = 0
    }

    // Handle reproduction for agents in reproductive age range
    const reproductionCandidates = agents.filter((a) => a.canReproduce())
    for (const agent of reproductionCandidates) {
      if (agents.length < this.config.populationSize * 1.5) {
        const targetOffspringCount = Math.round(agent.geneticTraits.offspringCount)
        const reproductionPlans: Array<{
          mate: Agent | null
          childTraits: GeneticTraits
          childEnergy: number
        }> = []

        for (let i = 0; i < targetOffspringCount; i++) {
          const potentialMates = agents.filter(
            (a) => a !== agent && a.species === agent.species && a.canReproduce()
          )

          const mate =
            potentialMates.length > 0 && Math.random() > 0.3
              ? potentialMates[Math.floor(Math.random() * potentialMates.length)]
              : null

          const tempChild = new Agent(
            0,
            0,
            0,
            0,
            agent.geneticTraits,
            mate?.geneticTraits,
            agent.species
          )
          const childEnergy = tempChild.geneticTraits.maxEnergyCapacity * 0.2

          reproductionPlans.push({ mate, childTraits: tempChild.geneticTraits, childEnergy })
        }

        const mateEnergyMap = new Map<string, number>()
        for (const plan of reproductionPlans) {
          if (plan.mate) {
            const currentCost = mateEnergyMap.get(plan.mate.id) || 0
            mateEnergyMap.set(plan.mate.id, currentCost + plan.childEnergy * 0.3)
          }
        }

        let canAfford = true
        for (const [mateId, totalCost] of mateEnergyMap.entries()) {
          const mate = agents.find((a) => a.id === mateId)
          if (mate && mate.energy < totalCost) {
            canAfford = false
            break
          }
        }

        const totalChildEnergy = reproductionPlans.reduce((sum, plan) => sum + plan.childEnergy, 0)
        const overhead = agent.geneticTraits.maxEnergyCapacity * 0.1
        const totalReproductionCost = totalChildEnergy + overhead

        if (agent.energy >= totalReproductionCost && canAfford) {
          agent.energy -= totalReproductionCost

          for (const plan of reproductionPlans) {
            const child = new Agent(
              agent.position.x + (Math.random() - 0.5) * 50,
              agent.position.y + (Math.random() - 0.5) * 50,
              0,
              0,
              undefined,
              undefined,
              agent.species,
              undefined,
              agent.clusterId
            )

            child.geneticTraits = plan.childTraits

            if (plan.mate) {
              const mateCost = plan.childEnergy * 0.3
              plan.mate.energy -= mateCost
              child.parentIds = [agent.id, plan.mate.id]
            } else {
              child.parentIds = [agent.id]
            }

            child.rebuildNeuralArchitecture()

            // Cascading neural network mutation - guaranteed first, then 50%, 25%, etc.
            const baseMutationIntensity =
              child.geneticTraits.mutationRate * child.geneticTraits.learningRate
            let nnMutationChance = 1.0
            while (Math.random() < nnMutationChance) {
              child.NeuralNetwork.mutate(baseMutationIntensity)
              nnMutationChance *= 0.5
            }

            // Generation is based on parent depth, not time
            const parentGeneration = agent.generation || 0
            child.generation = parentGeneration + 1
            child.fitness = 0
            child.energy = plan.childEnergy
            child.age = 0

            agents.push(child)
            newBirths++
            this.totalBirths++
          }
        }
      }
    }

    // Extinction mitigation: emergency spawning for low population
    const extinctionConfig = (AgentConfigData as Record<string, unknown>).ExtinctionMitigation as
      | Record<string, unknown>
      | undefined
    if (extinctionConfig && agents.length < (extinctionConfig.MinPopulationForBoost as number)) {
      const emergencySpawnChance = extinctionConfig.EmergencySpawnRate || 0.01

      // If completely extinct, spawn multiple agents from elite templates or create new ones
      if (agents.length === 0) {
        // Guard: Don't spawn with random positions if ClusterManager isn't set yet
        if (!this.clusterManager) {
          console.warn(
            '[EvolutionManager] Population extinct but ClusterManager not set - deferring repopulation'
          )
          return { agents, newBirths, newDeaths }
        }

        console.warn('[EvolutionManager] Population extinct! Triggering emergency repopulation...')
        const spawnCount = Math.min(this.config.populationSize, 10)

        // Get clusters from ClusterManager
        const clusters = this.clusterManager.getClusters()
        const numClusters = clusters.length || 1

        // Build species map for each cluster - either from elites or create new species
        const clusterSpecies: Map<
          number,
          {
            id: string
            traits: GeneticTraits
            template: Agent | null
            useTemplateNetwork: boolean
          }
        > = new Map()

        for (const cluster of clusters) {
          // Check if we have elites from this cluster
          const clusterElites = this.lastGenerationElites.filter((e) => e.clusterId === cluster.id)

          if (clusterElites.length > 0) {
            // Use elite from this cluster - species and traits stay aligned
            const elite = clusterElites[Math.floor(Math.random() * clusterElites.length)]
            clusterSpecies.set(cluster.id, {
              id: elite.species,
              traits: elite.geneticTraits,
              template: elite,
              useTemplateNetwork: true
            })
          } else if (this.lastGenerationElites.length > 0) {
            // Create new species for this cluster - clone elite traits WITHOUT mutation
            // to ensure neural network architecture matches exactly
            // Diversity is added via network weight mutation after transfer
            const randomElite =
              this.lastGenerationElites[
                Math.floor(Math.random() * this.lastGenerationElites.length)
              ]
            const newSpecies = this.speciesManager.createSpeciesWithTraits(
              randomElite.geneticTraits,
              false
            )
            clusterSpecies.set(cluster.id, {
              id: newSpecies.id,
              traits: newSpecies.baselineTraits,
              template: randomElite,
              useTemplateNetwork: true
            })
          } else {
            // No elites at all - create completely new species
            const newSpecies = this.speciesManager.createNewSpecies()
            clusterSpecies.set(cluster.id, {
              id: newSpecies.id,
              traits: newSpecies.baselineTraits,
              template: null,
              useTemplateNetwork: false
            })
          }
        }

        console.log(
          `[EvolutionManager] Prepared ${clusterSpecies.size} species for emergency repopulation across ${numClusters} clusters`
        )

        // Distribute agents across clusters
        const agentsPerCluster = Math.floor(spawnCount / numClusters)
        const remainder = spawnCount % numClusters
        let agentsSpawned = 0

        for (
          let clusterIdx = 0;
          clusterIdx < numClusters && agentsSpawned < spawnCount;
          clusterIdx++
        ) {
          const cluster = clusters[clusterIdx]
          const agentsForThisCluster = agentsPerCluster + (clusterIdx < remainder ? 1 : 0)
          const speciesData = clusterSpecies.get(cluster.id)!

          for (let i = 0; i < agentsForThisCluster && agentsSpawned < spawnCount; i++) {
            // Get position within cluster
            const pos = this.clusterManager.getRandomPositionInCluster(cluster.id)
            const spawnX = pos ? pos.x : cluster.position.x + (Math.random() - 0.5) * 200
            const spawnY = pos ? pos.y : cluster.position.y + (Math.random() - 0.5) * 200

            // Always use species baseline traits for consistency
            // Agent traits should match the species they belong to
            const emergencyAgent = new Agent(
              spawnX,
              spawnY,
              0,
              0,
              undefined,
              undefined,
              speciesData.id,
              speciesData.traits,
              cluster.id
            )

            emergencyAgent.rebuildNeuralArchitecture()

            // Transfer neural network from template if available (for learned behaviors)
            if (speciesData.useTemplateNetwork && speciesData.template) {
              emergencyAgent.NeuralNetwork.transferWeightsFrom(speciesData.template.NeuralNetwork)
              if (extinctionConfig.DiversityBoostOnReseed) {
                emergencyAgent.NeuralNetwork.mutate(speciesData.traits.mutationRate * 1.5)
              }
            }

            emergencyAgent.generation = 0
            emergencyAgent.energy = emergencyAgent.geneticTraits.maxEnergyCapacity * 0.9

            // Start agents at reproductive age so they can breed immediately
            const lifeConfig = (AgentConfigData as Record<string, unknown>).LifeStageSettings as
              | Record<string, unknown>
              | undefined
            const minReproAge =
              (
                (lifeConfig?.LifeProgressSegments as Record<string, unknown>)?.Adult as Record<
                  string,
                  unknown
                >
              )?.start || 0.15
            emergencyAgent.age = Math.floor(this.config.maxAge * ((minReproAge as number) + 0.05))

            agents.push(emergencyAgent)
            newBirths++
            this.totalBirths++
            agentsSpawned++
          }
        }

        console.log(
          `[EvolutionManager] Emergency repopulated ${agentsSpawned} agents across ${numClusters} clusters`
        )
      }
      // If low population, spawn occasionally
      else if (Math.random() < emergencySpawnChance) {
        const template = agents[Math.floor(Math.random() * agents.length)]
        const diversity = extinctionConfig.DiversityBoostOnReseed ? 1.5 : 1.0

        // Get position within template's cluster
        let spawnX = template.position.x + (Math.random() - 0.5) * 200
        let spawnY = template.position.y + (Math.random() - 0.5) * 200

        if (this.clusterManager) {
          const pos = this.clusterManager.getRandomPositionInCluster(template.clusterId)
          if (pos) {
            spawnX = pos.x
            spawnY = pos.y
          }
        }

        const emergencyAgent = new Agent(
          spawnX,
          spawnY,
          0,
          0,
          template.geneticTraits,
          undefined,
          template.species,
          undefined,
          template.clusterId
        )

        emergencyAgent.rebuildNeuralArchitecture()
        if (diversity > 1.0) {
          emergencyAgent.NeuralNetwork.mutate(template.geneticTraits.mutationRate * diversity)
        }
        emergencyAgent.generation = (template.generation || 0) + 1
        emergencyAgent.energy = emergencyAgent.geneticTraits.maxEnergyCapacity * 0.9

        // Start at reproductive age
        const lifeConfig = (AgentConfigData as Record<string, unknown>).LifeStageSettings as
          | Record<string, unknown>
          | undefined
        const minReproAge =
          (
            (lifeConfig?.LifeProgressSegments as Record<string, unknown>)?.Adult as Record<
              string,
              unknown
            >
          )?.start || 0.15
        emergencyAgent.age = Math.floor(this.config.maxAge * (minReproAge + 0.05))

        agents.push(emergencyAgent)
        newBirths++
        this.totalBirths++
      }
    }

    // Compute and store stats periodically (every 60 steps to avoid overhead)
    if (this.stepCount % 60 === 0 && agents.length > 0) {
      const totalFitness = agents.reduce((sum, a) => sum + a.fitness, 0)
      const totalEnergy = agents.reduce((sum, a) => sum + a.energy, 0)
      const speciesCount = this.speciesManager.getAllSpecies().length
      const maxGeneration =
        agents.length > 0 ? Math.max(...agents.map((a) => a.generation || 0)) : 0

      const stats: GenerationStats = {
        generation: maxGeneration,
        population: agents.length,
        avgFitness: totalFitness / agents.length,
        maxFitness: Math.max(...agents.map((a) => a.fitness)),
        avgEnergy: totalEnergy / agents.length,
        speciesCount: speciesCount,
        births: newBirths,
        deaths: newDeaths
      }

      this.stats.push(stats)
      // Keep only last 100 stat entries to prevent memory bloat
      if (this.stats.length > 100) {
        this.stats.shift()
      }
    }

    // No generation transitions - continuous evolution
    return { agents, newBirths, newDeaths }
  }

  public getLatestStats(): GenerationStats | null {
    return this.stats[this.stats.length - 1] || null
  }

  private updateSpeciesPopulations(agents: Agent[]): void {
    const populationMap = new Map<string, number>()

    for (const agent of agents) {
      populationMap.set(agent.species, (populationMap.get(agent.species) || 0) + 1)

      if (!this.speciesManager.getSpecies(agent.species)) {
        const avgTraits = agent.geneticTraits
        const speciesInfo = {
          id: agent.species,
          baselineTraits: avgTraits,
          createdAt: Date.now(),
          population: 0
        }
        this.speciesManager.registerSpecies(speciesInfo)
      }
    }

    const allSpecies = this.speciesManager.getAllSpecies()
    for (const species of allSpecies) {
      const population = populationMap.get(species.id) || 0
      this.speciesManager.updatePopulation(species.id, population)
    }

    this.speciesManager.removeExtinctSpecies()
  }

  public repopulateSpeciesFromAgents(agents: Agent[]): void {
    this.speciesManager.clear()

    const speciesMap = new Map<string, Agent[]>()
    for (const agent of agents) {
      if (!speciesMap.has(agent.species)) {
        speciesMap.set(agent.species, [])
      }
      speciesMap.get(agent.species)!.push(agent)
    }

    for (const [speciesId, speciesAgents] of speciesMap.entries()) {
      const avgTraits = this.calculateAverageTraits(speciesAgents)
      const speciesInfo = {
        id: speciesId,
        baselineTraits: avgTraits,
        createdAt: Date.now(),
        population: speciesAgents.length
      }
      this.speciesManager.registerSpecies(speciesInfo)
    }
  }

  private calculateAverageTraits(agents: Agent[]): GeneticTraits {
    const count = agents.length
    const sum: Record<string, number> = {}

    const firstAgent = agents[0]
    for (const key in firstAgent.geneticTraits) {
      sum[key] = 0
    }

    for (const agent of agents) {
      for (const key in agent.geneticTraits) {
        if (typeof agent.geneticTraits[key as keyof GeneticTraits] === 'number') {
          sum[key] += agent.geneticTraits[key as keyof GeneticTraits] as number
        }
      }
    }

    const avgTraits: Record<string, number | boolean> = {}
    for (const key in sum) {
      if (key === 'colorVision') {
        avgTraits[key] = agents.filter((a) => a.geneticTraits.colorVision).length > count / 2
      } else {
        avgTraits[key] = sum[key] / count
      }
    }

    return avgTraits as GeneticTraits
  }
}
