/**
 * Evolution Manager - Handles genetic algorithm, reproduction, and selection
 */

import { Agent } from './Agent'
import { SpeciesManager } from './SpeciesManager'
import type { GeneticTraits } from '../types/simulation'

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

  constructor(config: Partial<EvolutionConfig> = {}) {
    this.config = {
      generationTime: 3000,
      selectionRate: 0.3,
      mutationRate: 0.05,
      populationSize: 30,
      reproductionThreshold: 80,
      maxAge: 1500,
      ...config
    }
    this.speciesManager = new SpeciesManager()
    Agent.speciesManager = this.speciesManager
  }

  public setConfig(config: EvolutionConfig): void {
    this.config = { ...config }
    // Config changes take effect immediately
  }

  public reset(): void {
    this.generation = 0
    this.stepCount = 0
    this.stats = []
    this.totalBirths = 0
    this.totalDeaths = 0
    this.speciesManager.clear()
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

    // Handle reproduction for high-energy agents
    const reproductionCandidates = agents.filter(a => a.energy >= a.geneticTraits.reproductionThreshold)
    for (const agent of reproductionCandidates) {
      if (agents.length < this.config.populationSize * 1.5) {
        const targetOffspringCount = Math.round(agent.geneticTraits.offspringCount)
        const reproductionPlans: Array<{mate: Agent | null, childTraits: GeneticTraits, childEnergy: number}> = []
        
        for (let i = 0; i < targetOffspringCount; i++) {
          const potentialMates = agents.filter(a => 
            a !== agent && 
            a.species === agent.species && 
            a.energy >= agent.geneticTraits.reproductionThreshold
          )
          
          const mate = (potentialMates.length > 0 && Math.random() > 0.3) 
            ? potentialMates[Math.floor(Math.random() * potentialMates.length)]
            : null
          
          const tempChild = new Agent(0, 0, 0, 0, agent.geneticTraits, mate?.geneticTraits, agent.species)
          const childEnergy = tempChild.geneticTraits.maxEnergyCapacity * 0.5
          
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
          const mate = agents.find(a => a.id === mateId)
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
              agent.species
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
            
            const mutationIntensity = child.geneticTraits.mutationRate * child.geneticTraits.learningRate
            if (Math.random() < child.geneticTraits.mutationRate) {
              child.NeuralNetwork.mutate(mutationIntensity)
            }
            child.generation = this.generation
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

    // Check if generation should end
    if (this.stepCount >= this.config.generationTime || agents.length === 0) {
      const result = this.endGeneration(agents)
      return { agents: result, newBirths, newDeaths }
    }

    return { agents, newBirths, newDeaths }
  }


  private endGeneration(agents: Agent[]): Agent[] {
    // Calculate stats for this generation
    const stats: GenerationStats = {
      generation: this.generation,
      population: agents.length,
      avgFitness: agents.reduce((sum, a) => sum + a.fitness, 0) / (agents.length || 1),
      maxFitness: Math.max(...agents.map(a => a.fitness), 0),
      avgEnergy: agents.reduce((sum, a) => sum + a.energy, 0) / (agents.length || 1),
      speciesCount: new Set(agents.map(a => a.species)).size,
      births: this.totalBirths,
      deaths: this.totalDeaths
    }
    this.stats.push(stats)

    let elites: Agent[] = []
    
    if (agents.length === 0) {
      // Population died out - resurrect from last generation's gene pool
      if (this.lastGenerationElites.length > 0) {
        console.log('Population extinct! Resurrecting from gene pool...')
        elites = this.lastGenerationElites
      } else {
        // Very first generation failure - should not happen normally
        console.warn('No gene pool available - cannot continue evolution')
        this.generation++
        this.stepCount = 0
        return []
      }
    } else {
      // Select top performers for breeding (no culling - all agents stay alive)
      const sortedAgents = [...agents].sort((a, b) => b.fitness - a.fitness)
      const eliteCount = Math.max(2, Math.floor(agents.length * this.config.selectionRate))
      elites = sortedAgents.slice(0, eliteCount)
      
      // Save elite gene pool for potential resurrection
      this.lastGenerationElites = elites.map(elite => {
        const clone = new Agent(
          elite.position.x,
          elite.position.y,
          0, 0,
          elite.geneticTraits,
          undefined,
          elite.species
        )
        clone.NeuralNetwork.transferWeightsFrom(elite.NeuralNetwork)
        return clone
      })
    }

    // Spawn offspring based on whether population is extinct or not
    const targetPopulation = agents.length === 0 ? this.config.populationSize : this.config.populationSize
    const populationHeadroom = Math.max(0, targetPopulation - agents.length)
    
    if (populationHeadroom > 0) {
      const offspringToSpawn = agents.length === 0 
        ? this.config.populationSize  // Full resurrection
        : Math.min(populationHeadroom, Math.floor(elites.length * 0.5))  // Normal breeding

      for (let i = 0; i < offspringToSpawn; i++) {
        const parent1 = elites[Math.floor(Math.random() * elites.length)]
        const parent2 = elites[Math.floor(Math.random() * elites.length)]

        // Spawn offspring near parent (or at random location if resurrecting)
        const spawnRadius = agents.length === 0 ? 1000 : 100
        const angle = Math.random() * Math.PI * 2
        const distance = Math.random() * spawnRadius
        const childX = parent1.position.x + Math.cos(angle) * distance
        const childY = parent1.position.y + Math.sin(angle) * distance

        const child = new Agent(
          childX,
          childY,
          0,
          0,
          parent1.geneticTraits,
          parent1 !== parent2 ? parent2.geneticTraits : undefined,
          parent1.species
        )

        if (parent1 !== parent2) {
          child.parentIds = [parent1.id, parent2.id]
          child.NeuralNetwork.transferWeightsFrom(parent1.NeuralNetwork, parent2.NeuralNetwork)
        } else {
          child.parentIds = [parent1.id]
          child.NeuralNetwork.transferWeightsFrom(parent1.NeuralNetwork)
        }

        const mutationIntensity = child.geneticTraits.mutationRate * child.geneticTraits.learningRate
        if (Math.random() < child.geneticTraits.mutationRate * 2) {
          child.NeuralNetwork.mutate(mutationIntensity * 0.75)
        }

        child.generation = this.generation + 1
        child.energy = child.geneticTraits.maxEnergyCapacity
        child.age = 0
        agents.push(child)
      }
    }

    // Reset fitness for all agents AFTER offspring are added so everyone starts fresh
    for (const agent of agents) {
      agent.fitness = 0
    }

    this.generation++
    this.stepCount = 0
    this.totalBirths = 0
    this.totalDeaths = 0

    // Update species populations
    this.updateSpeciesPopulations(agents)

    return agents
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
    const sum: any = {}
    
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
    
    const avgTraits: any = {}
    for (const key in sum) {
      if (key === 'colorVision') {
        avgTraits[key] = agents.filter(a => a.geneticTraits.colorVision).length > count / 2
      } else {
        avgTraits[key] = sum[key] / count
      }
    }
    
    return avgTraits as GeneticTraits
  }
}
