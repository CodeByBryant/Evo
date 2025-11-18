/**
 * Evolution Manager - Handles genetic algorithm, reproduction, and selection
 */

import { Agent } from './Agent'

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
  }

  public update(agents: Agent[]): { agents: Agent[]; newBirths: number; newDeaths: number } {
    this.stepCount++
    let newBirths = 0
    let newDeaths = 0

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
    const reproductionCandidates = agents.filter(a => a.energy >= this.config.reproductionThreshold)
    for (const agent of reproductionCandidates) {
      if (agents.length < this.config.populationSize * 1.5) {
        const child = this.reproduce(agent, agents)
        if (child) {
          agents.push(child)
          agent.energy -= 30 // Cost of reproduction
          newBirths++
          this.totalBirths++
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

  private reproduce(parent: Agent, allAgents: Agent[]): Agent | null {
    // Find a mate from the same species or create asexual offspring
    const potentialMates = allAgents.filter(a => 
      a !== parent && 
      a.species === parent.species && 
      a.energy >= this.config.reproductionThreshold
    )

    const child = new Agent(
      parent.position.x + (Math.random() - 0.5) * 50,
      parent.position.y + (Math.random() - 0.5) * 50,
      parent.width,
      parent.height
    )

    if (potentialMates.length > 0 && Math.random() > 0.3) {
      // Sexual reproduction (crossover)
      const mate = potentialMates[Math.floor(Math.random() * potentialMates.length)]
      child.NeuralNetwork = parent.NeuralNetwork.crossover(mate.NeuralNetwork)
      child.parentIds = [parent.id, mate.id]
      mate.energy -= 15 // Cost for mate
    } else {
      // Asexual reproduction
      child.NeuralNetwork = parent.NeuralNetwork.clone()
      child.parentIds = [parent.id]
    }

    // Mutation
    if (Math.random() < this.config.mutationRate) {
      child.NeuralNetwork.mutate(0.2)
    }

    child.species = parent.species
    child.generation = this.generation
    child.fitness = 0
    child.energy = 50
    child.age = 0

    return child
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

    if (agents.length === 0) {
      // Reset with new random population
      this.generation++
      this.stepCount = 0
      return []
    }

    // Selection: keep top performers
    agents.sort((a, b) => b.fitness - a.fitness)
    const survivorCount = Math.max(2, Math.floor(agents.length * this.config.selectionRate))
    const survivors = agents.slice(0, survivorCount)

    // Create next generation
    const nextGen: Agent[] = []
    while (nextGen.length < this.config.populationSize) {
      const parent1 = survivors[Math.floor(Math.random() * survivors.length)]
      const parent2 = survivors[Math.floor(Math.random() * survivors.length)]

      const child = new Agent(
        Math.random() * 2000 - 1000,
        Math.random() * 2000 - 1000,
        parent1.width,
        parent1.height
      )

      if (parent1 !== parent2) {
        child.NeuralNetwork = parent1.NeuralNetwork.crossover(parent2.NeuralNetwork)
        child.parentIds = [parent1.id, parent2.id]
      } else {
        child.NeuralNetwork = parent1.NeuralNetwork.clone()
        child.parentIds = [parent1.id]
      }

      if (Math.random() < this.config.mutationRate * 2) {
        child.NeuralNetwork.mutate(0.15)
      }

      child.species = parent1.species
      child.generation = this.generation + 1
      child.energy = 100
      child.age = 0
      nextGen.push(child)
    }

    this.generation++
    this.stepCount = 0
    this.totalBirths = 0
    this.totalDeaths = 0

    return nextGen
  }

  public getLatestStats(): GenerationStats | null {
    return this.stats[this.stats.length - 1] || null
  }
}
