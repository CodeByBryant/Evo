/**
 * Species Manager - Manages unique genetic traits for each species
 */

import AgentConfigData from './utilities/AgentConfig.json'
import type { GeneticTraits } from '../types/simulation'

export interface SpeciesInfo {
  id: string
  baselineTraits: GeneticTraits
  createdAt: number
  population: number
}

export class SpeciesManager {
  private speciesMap: Map<string, SpeciesInfo> = new Map()

  constructor() {
    this.speciesMap = new Map()
  }

  public createNewSpecies(parentSpeciesId?: string): SpeciesInfo {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = (AgentConfigData as any).GeneticTraits
    const speciesId = this.generateSpeciesId()

    let baselineTraits: GeneticTraits

    if (parentSpeciesId && this.speciesMap.has(parentSpeciesId)) {
      // Inherit from parent species with significant variation (speciation event)
      const parentSpecies = this.speciesMap.get(parentSpeciesId)!
      baselineTraits = this.mutateSpeciesTraits(parentSpecies.baselineTraits, config, 0.5)
    } else {
      // Create entirely new species with unique traits
      baselineTraits = this.generateUniqueSpeciesTraits(config)
    }

    const speciesInfo: SpeciesInfo = {
      id: speciesId,
      baselineTraits,
      createdAt: Date.now(),
      population: 0
    }

    this.speciesMap.set(speciesId, speciesInfo)
    console.log(
      `[SpeciesManager] Created new species: ${speciesId.substring(0, 8)}${parentSpeciesId ? ` (derived from ${parentSpeciesId.substring(0, 8)})` : ''}`
    )
    return speciesInfo
  }

  public getSpecies(speciesId: string): SpeciesInfo | undefined {
    return this.speciesMap.get(speciesId)
  }

  public updatePopulation(speciesId: string, population: number): void {
    const species = this.speciesMap.get(speciesId)
    if (species) {
      species.population = population
    }
  }

  public getAllSpecies(): SpeciesInfo[] {
    return Array.from(this.speciesMap.values())
  }

  public removeExtinctSpecies(): void {
    const extinctSpecies: string[] = []
    for (const [id, species] of this.speciesMap.entries()) {
      if (species.population === 0) {
        extinctSpecies.push(id.substring(0, 8))
        this.speciesMap.delete(id)
      }
    }
    if (extinctSpecies.length > 0) {
      console.log(
        `[SpeciesManager] Removed ${extinctSpecies.length} extinct species: ${extinctSpecies.join(', ')}`
      )
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private generateUniqueSpeciesTraits(config: any): GeneticTraits {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const randomInRange = (rangeConfig: any): number => {
      const min = rangeConfig.min as number
      const max = rangeConfig.max as number
      const range = max - min
      const center = (min + max) / 2

      // Use a normal distribution around center with some variance
      const variance = 0.4 // 40% variance from center
      const offset = (Math.random() - 0.5) * 2 * range * variance
      return Math.max(min, Math.min(max, center + offset))
    }

    return {
      size: randomInRange(config.size),
      movementSpeed: randomInRange(config.movementSpeed),
      acceleration: randomInRange(config.acceleration),
      turnRate: randomInRange(config.turnRate),
      drag: randomInRange(config.drag),
      sensorRayCount: Math.round(randomInRange(config.sensorRayCount)),
      sensorRayLength: randomInRange(config.sensorRayLength),
      sensorPrecision: randomInRange(config.sensorPrecision),
      fieldOfView: randomInRange(config.fieldOfView),
      colorVision: Math.random() < config.colorVision.probability,
      energyEfficiency: randomInRange(config.energyEfficiency),
      digestionRate: randomInRange(config.digestionRate),
      maxEnergyCapacity: randomInRange(config.maxEnergyCapacity),
      mutationRate: randomInRange(config.mutationRate),
      reproductionThreshold: randomInRange(config.reproductionThreshold),
      offspringCount: Math.round(randomInRange(config.offspringCount)),
      learningRate: randomInRange(config.learningRate),
      memoryNeurons: Math.round(randomInRange(config.memoryNeurons)),
      aggression: randomInRange(config.aggression),
      hue: Math.floor(Math.random() * 360),
      bodyShape: config.bodyShape ? Math.round(randomInRange(config.bodyShape)) : 3
    }
  }

  private mutateSpeciesTraits(
    parentTraits: GeneticTraits,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any,
    intensity: number
  ): GeneticTraits {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutate = (value: number, range: any): number => {
      const mutation =
        (Math.random() - 0.5) * ((range.max as number) - (range.min as number)) * intensity
      return Math.max(range.min as number, Math.min(range.max as number, value + mutation))
    }

    const parentHue = Number.isFinite(parentTraits.hue)
      ? parentTraits.hue
      : Math.floor(Math.random() * 360)
    const hueMutation = (Math.random() - 0.5) * 60 * intensity
    const newHue = (parentHue + hueMutation + 360) % 360

    return {
      size: mutate(parentTraits.size, config.size),
      movementSpeed: mutate(parentTraits.movementSpeed, config.movementSpeed),
      acceleration: mutate(parentTraits.acceleration, config.acceleration),
      turnRate: mutate(parentTraits.turnRate, config.turnRate),
      drag: mutate(parentTraits.drag, config.drag),
      sensorRayCount: Math.round(mutate(parentTraits.sensorRayCount, config.sensorRayCount)),
      sensorRayLength: mutate(parentTraits.sensorRayLength, config.sensorRayLength),
      sensorPrecision: mutate(parentTraits.sensorPrecision, config.sensorPrecision),
      fieldOfView: mutate(parentTraits.fieldOfView, config.fieldOfView),
      colorVision:
        Math.random() < 0.5
          ? parentTraits.colorVision
          : Math.random() < config.colorVision.probability,
      energyEfficiency: mutate(parentTraits.energyEfficiency, config.energyEfficiency),
      digestionRate: mutate(parentTraits.digestionRate, config.digestionRate),
      maxEnergyCapacity: mutate(parentTraits.maxEnergyCapacity, config.maxEnergyCapacity),
      mutationRate: mutate(parentTraits.mutationRate, config.mutationRate),
      reproductionThreshold: mutate(
        parentTraits.reproductionThreshold,
        config.reproductionThreshold
      ),
      offspringCount: Math.round(mutate(parentTraits.offspringCount, config.offspringCount)),
      learningRate: mutate(parentTraits.learningRate, config.learningRate),
      memoryNeurons: Math.round(mutate(parentTraits.memoryNeurons, config.memoryNeurons)),
      aggression: mutate(parentTraits.aggression, config.aggression),
      hue: newHue,
      bodyShape: config.bodyShape
        ? Math.round(mutate(parentTraits.bodyShape ?? 3, config.bodyShape))
        : (parentTraits.bodyShape ?? 3)
    }
  }

  private generateSpeciesId(): string {
    return Math.random().toString(36).substring(2, 12)
  }

  public clear(): void {
    const count = this.speciesMap.size
    this.speciesMap.clear()
    if (count > 0) {
      console.log(`[SpeciesManager] Cleared ${count} species`)
    }
  }

  public registerSpecies(speciesInfo: SpeciesInfo): void {
    this.speciesMap.set(speciesInfo.id, speciesInfo)
  }

  public createSpeciesWithTraits(
    sourceTraits: GeneticTraits,
    mutateTraits: boolean = true
  ): SpeciesInfo {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = (AgentConfigData as any).GeneticTraits
    const speciesId = this.generateSpeciesId()

    let baselineTraits: GeneticTraits
    if (mutateTraits) {
      baselineTraits = this.mutateSpeciesTraits(sourceTraits, config, 0.3)
    } else {
      baselineTraits = { ...sourceTraits }
    }

    const speciesInfo: SpeciesInfo = {
      id: speciesId,
      baselineTraits,
      createdAt: Date.now(),
      population: 0
    }

    this.speciesMap.set(speciesId, speciesInfo)
    console.log(`[SpeciesManager] Created new species from traits: ${speciesId.substring(0, 8)}`)
    return speciesInfo
  }
}
