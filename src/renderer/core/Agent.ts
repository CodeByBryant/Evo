/**
 * @author By Bryant Ejorh - CodeByBryant
 *
 * License: MIT License 2024
 *
 * @fileoverview Enhanced agent implementation with improved neural network integration,
 * food detection, and optimized rendering.
 */

import { NeuralNetwork, Sensor } from './NeuralNetwork'
import AgentConfigData from './utilities/AgentConfig.json'
import type { GeneticTraits } from '../types/simulation'
import type { SpeciesManager } from './SpeciesManager'

type Vertex = { x: number; y: number }

class Agent {
  public static speciesManager: SpeciesManager | null = null
  public static maxAge: number = 5000
  
  public position: { x: number; y: number; rotation: number }
  public width: number
  public height: number
  public polygon: Vertex[]
  public NeuralNetwork: NeuralNetwork
  public Sensor: Sensor
  public fitness: number
  public energy: number
  public age: number
  public generation: number
  public species: string
  public id: string
  public parentIds: string[]
  public foodEaten: number
  public distanceTraveled: number
  public lastPosition: { x: number; y: number }
  public geneticTraits: GeneticTraits
  public currentSpeed: number
  public memoryState: number[]
  public clusterId: number
  public positionHistory: { x: number; y: number }[]
  public static maxTrailLength: number = 30
  public static trailsEnabled: boolean = true

  constructor(
    x: number = 0, 
    y: number = 0, 
    _width: number = 10, 
    _height: number = 10, 
    parentTraits?: GeneticTraits, 
    mateTraits?: GeneticTraits,
    speciesId?: string,
    speciesBaselineTraits?: GeneticTraits,
    clusterId: number = 0
  ) {
    this.position = { x: x, y: y, rotation: Math.random() * Math.PI * 2 }
    this.species = speciesId || this.generateSpeciesId()
    this.geneticTraits = parentTraits 
      ? this.inheritTraits(parentTraits, mateTraits) 
      : (speciesBaselineTraits || this.generateDefaultTraits())
    
    this.width = this.geneticTraits.size
    this.height = this.geneticTraits.size
    this.polygon = this.getgeometry()
    this.fitness = 100
    const configData: any = AgentConfigData
    const energyCap = (configData.ReproductionSettings?.EnergyMaxCap) || 100
    this.energy = Math.min(energyCap, this.geneticTraits.maxEnergyCapacity)
    this.age = 0
    this.generation = 0
    this.id = this.generateId()
    this.parentIds = []
    this.foodEaten = 0
    this.distanceTraveled = 0
    this.lastPosition = { x, y }
    this.currentSpeed = 0
    this.memoryState = new Array(Math.round(this.geneticTraits.memoryNeurons)).fill(0)
    this.clusterId = clusterId
    this.positionHistory = []

    const nnConfig = configData.NeuralNetwork || { HiddenLayers: [20, 16, 12], ActivationFunction: 'tanh', InitializationMethod: 'he', MutationStrategy: 'gaussian' }
    
    const maxRayCount = 12
    const colorVisionInputs = this.geneticTraits.colorVision ? maxRayCount * 2 : 0
    const memoryInputs = Math.round(this.geneticTraits.memoryNeurons)
    const inputSize = maxRayCount * 2 + 3 + colorVisionInputs + memoryInputs
    const layerSizes = [inputSize, ...nnConfig.HiddenLayers, 6]

    this.NeuralNetwork = new NeuralNetwork(layerSizes, {
      ActivationFunction: nnConfig.ActivationFunction as any,
      InitializationMethod: nnConfig.InitializationMethod as any,
      MutationStrategy: nnConfig.MutationStrategy as any
    })

    this.Sensor = new Sensor(this, {
      RayCount: Math.round(this.geneticTraits.sensorRayCount),
      RayLength: this.geneticTraits.sensorRayLength,
      DetectFood: true,
      DetectAgents: true
    })
  }

  public rebuildNeuralArchitecture(): void {
    const configData: any = AgentConfigData
    const nnConfig = configData.NeuralNetwork || { HiddenLayers: [20, 16, 12], ActivationFunction: 'tanh', InitializationMethod: 'he', MutationStrategy: 'gaussian' }
    
    const maxRayCount = 12
    const colorVisionInputs = this.geneticTraits.colorVision ? maxRayCount * 2 : 0
    const memoryInputs = Math.round(this.geneticTraits.memoryNeurons)
    const inputSize = maxRayCount * 2 + 3 + colorVisionInputs + memoryInputs
    const layerSizes = [inputSize, ...nnConfig.HiddenLayers, 6]

    this.NeuralNetwork = new NeuralNetwork(layerSizes, {
      ActivationFunction: nnConfig.ActivationFunction as any,
      InitializationMethod: nnConfig.InitializationMethod as any,
      MutationStrategy: nnConfig.MutationStrategy as any
    })

    this.Sensor = new Sensor(this, {
      RayCount: Math.round(this.geneticTraits.sensorRayCount),
      RayLength: this.geneticTraits.sensorRayLength,
      DetectFood: true,
      DetectAgents: true
    })
    
    this.memoryState = new Array(Math.round(this.geneticTraits.memoryNeurons)).fill(0)
    this.width = this.geneticTraits.size
    this.height = this.geneticTraits.size
    this.polygon = this.getgeometry()
  }

  private generateDefaultTraits(): GeneticTraits {
    const config: any = (AgentConfigData as any).GeneticTraits
    const speciesHash = parseInt(this.species.substring(0, 8), 36)
    const defaultHue = config.hue.default === -1 ? (speciesHash % 360) : config.hue.default
    return {
      size: config.size.default,
      movementSpeed: config.movementSpeed.default,
      acceleration: config.acceleration.default,
      turnRate: config.turnRate.default,
      drag: config.drag.default,
      sensorRayCount: config.sensorRayCount.default,
      sensorRayLength: config.sensorRayLength.default,
      sensorPrecision: config.sensorPrecision.default,
      fieldOfView: config.fieldOfView.default,
      colorVision: Math.random() < config.colorVision.probability,
      energyEfficiency: config.energyEfficiency.default,
      digestionRate: config.digestionRate.default,
      maxEnergyCapacity: config.maxEnergyCapacity.default,
      mutationRate: config.mutationRate.default,
      reproductionThreshold: config.reproductionThreshold.default,
      offspringCount: config.offspringCount.default,
      learningRate: config.learningRate.default,
      memoryNeurons: config.memoryNeurons.default,
      aggression: config.aggression.default,
      hue: defaultHue
    }
  }

  private inheritTraits(parentTraits: GeneticTraits, mateTraits?: GeneticTraits): GeneticTraits {
    const config: any = (AgentConfigData as any).GeneticTraits
    
    const blend = (parent1Val: number, parent2Val: number): number => {
      return parent1Val * 0.5 + parent2Val * 0.5
    }

    const blendHue = (hue1: number, hue2: number): number => {
      const diff = hue2 - hue1
      const shortestPath = ((diff + 540) % 360) - 180
      let blended = hue1 + shortestPath * 0.5
      if (blended < 0) blended += 360
      if (blended >= 360) blended -= 360
      return blended
    }

    const baseTraits = mateTraits ? {
      size: blend(parentTraits.size, mateTraits.size),
      movementSpeed: blend(parentTraits.movementSpeed, mateTraits.movementSpeed),
      acceleration: blend(parentTraits.acceleration, mateTraits.acceleration),
      turnRate: blend(parentTraits.turnRate, mateTraits.turnRate),
      drag: blend(parentTraits.drag, mateTraits.drag),
      sensorRayCount: blend(parentTraits.sensorRayCount, mateTraits.sensorRayCount),
      sensorRayLength: blend(parentTraits.sensorRayLength, mateTraits.sensorRayLength),
      sensorPrecision: blend(parentTraits.sensorPrecision, mateTraits.sensorPrecision),
      fieldOfView: blend(parentTraits.fieldOfView, mateTraits.fieldOfView),
      colorVision: Math.random() < 0.5 ? parentTraits.colorVision : mateTraits.colorVision,
      energyEfficiency: blend(parentTraits.energyEfficiency, mateTraits.energyEfficiency),
      digestionRate: blend(parentTraits.digestionRate, mateTraits.digestionRate),
      maxEnergyCapacity: blend(parentTraits.maxEnergyCapacity, mateTraits.maxEnergyCapacity),
      mutationRate: blend(parentTraits.mutationRate, mateTraits.mutationRate),
      reproductionThreshold: blend(parentTraits.reproductionThreshold, mateTraits.reproductionThreshold),
      offspringCount: blend(parentTraits.offspringCount, mateTraits.offspringCount),
      learningRate: blend(parentTraits.learningRate, mateTraits.learningRate),
      memoryNeurons: blend(parentTraits.memoryNeurons, mateTraits.memoryNeurons),
      aggression: blend(parentTraits.aggression, mateTraits.aggression),
      hue: blendHue(parentTraits.hue, mateTraits.hue)
    } : { ...parentTraits }

    const result: GeneticTraits = {
      size: baseTraits.size,
      movementSpeed: baseTraits.movementSpeed,
      acceleration: baseTraits.acceleration,
      turnRate: baseTraits.turnRate,
      drag: baseTraits.drag,
      sensorRayCount: Math.round(baseTraits.sensorRayCount),
      sensorRayLength: baseTraits.sensorRayLength,
      sensorPrecision: baseTraits.sensorPrecision,
      fieldOfView: baseTraits.fieldOfView,
      colorVision: baseTraits.colorVision,
      energyEfficiency: baseTraits.energyEfficiency,
      digestionRate: baseTraits.digestionRate,
      maxEnergyCapacity: baseTraits.maxEnergyCapacity,
      mutationRate: baseTraits.mutationRate,
      reproductionThreshold: baseTraits.reproductionThreshold,
      offspringCount: Math.round(baseTraits.offspringCount),
      learningRate: baseTraits.learningRate,
      memoryNeurons: Math.round(baseTraits.memoryNeurons),
      aggression: baseTraits.aggression,
      hue: baseTraits.hue
    }

    const numericTraitKeys: (keyof GeneticTraits)[] = [
      'size', 'movementSpeed', 'acceleration', 'turnRate', 'drag',
      'sensorRayCount', 'sensorRayLength', 'sensorPrecision', 'fieldOfView',
      'energyEfficiency', 'digestionRate', 'maxEnergyCapacity', 'mutationRate',
      'reproductionThreshold', 'offspringCount', 'learningRate', 'memoryNeurons', 'aggression', 'hue'
    ]

    const mutateGene = (traitKey: keyof GeneticTraits): void => {
      if (traitKey === 'colorVision') {
        result.colorVision = Math.random() < config.colorVision.probability
        return
      }
      
      const range = config[traitKey]
      if (!range || range.min === undefined || range.max === undefined) return
      
      const currentValue = result[traitKey] as number
      const mutation = (Math.random() - 0.5) * (range.max - range.min) * 0.2
      let newValue: number
      
      if (traitKey === 'hue') {
        newValue = (currentValue + mutation + 360) % 360
      } else {
        newValue = Math.max(range.min, Math.min(range.max, currentValue + mutation))
      }
      
      if (traitKey === 'sensorRayCount' || traitKey === 'offspringCount' || traitKey === 'memoryNeurons') {
        newValue = Math.round(newValue)
      }
      
      (result as any)[traitKey] = newValue
    }

    const allTraitKeys: (keyof GeneticTraits)[] = [...numericTraitKeys, 'colorVision']
    
    let mutationChance = 1.0
    while (Math.random() < mutationChance) {
      const randomIndex = Math.floor(Math.random() * allTraitKeys.length)
      const selectedTrait = allTraitKeys[randomIndex]
      mutateGene(selectedTrait)
      mutationChance *= 0.5
    }

    return result
  }

  public getgeometry(): Vertex[] {
    const vertices: Vertex[] = []
    const rad = Math.hypot(this.width, this.height) / 2
    const alpha = Math.atan2(this.width, this.height)

    vertices.push({
      x: this.position.x - Math.sin(this.position.rotation - alpha) * rad,
      y: this.position.y - Math.cos(this.position.rotation - alpha) * rad
    })
    vertices.push({
      x: this.position.x - Math.sin(this.position.rotation + alpha) * rad,
      y: this.position.y - Math.cos(this.position.rotation + alpha) * rad
    })
    vertices.push({
      x: this.position.x - Math.sin(Math.PI + this.position.rotation - alpha) * rad,
      y: this.position.y - Math.cos(Math.PI + this.position.rotation - alpha) * rad
    })
    vertices.push({
      x: this.position.x - Math.sin(Math.PI + this.position.rotation + alpha) * rad,
      y: this.position.y - Math.cos(Math.PI + this.position.rotation + alpha) * rad
    })

    return vertices
  }

  public move(dx: number, dy: number, canvasWidth?: number, canvasHeight?: number): void {
    // Track distance traveled for fitness
    const distance = Math.sqrt(dx * dx + dy * dy)
    this.distanceTraveled += distance
    
    // Record position for trail (only if moving significantly)
    if (Agent.trailsEnabled && distance > 0.5) {
      this.positionHistory.push({ x: this.position.x, y: this.position.y })
      if (this.positionHistory.length > Agent.maxTrailLength) {
        this.positionHistory.shift()
      }
    }
    
    this.position.x += dx
    this.position.y += dy
    
    if (canvasWidth && canvasHeight) {
      if (this.position.x < 0) this.position.x = canvasWidth
      if (this.position.x > canvasWidth) this.position.x = 0
      if (this.position.y < 0) this.position.y = canvasHeight
      if (this.position.y > canvasHeight) this.position.y = 0
    }
    
    this.polygon = this.getgeometry()
    this.lastPosition = { x: this.position.x, y: this.position.y }
  }

  public rotate(dr: number): void {
    this.position.rotation = (this.position.rotation + dr + 2 * Math.PI) % (2 * Math.PI)
    this.polygon = this.getgeometry()
  }

  public update(agents: Agent[], food: Food[], canvasWidth?: number, canvasHeight?: number): void {
    this.polygon = this.getgeometry()
    this.Sensor.update(agents, food)

    const maxRayCount = 12
    const actualRayCount = this.Sensor.rayCount
    
    const aggressionWeight = this.geneticTraits.aggression
    const foodWeight = 2.0 - aggressionWeight
    
    const agentOffsets = this.Sensor.agentOutput.map((e) => (e == null ? 0 : (1 - e.offset) * aggressionWeight))
    const foodOffsets = this.Sensor.foodOutput.map((e) => (e == null ? 0 : (1 - e.offset) * foodWeight))
    
    const paddedAgentOffsets = [...agentOffsets, ...Array(maxRayCount - actualRayCount).fill(0)]
    const paddedFoodOffsets = [...foodOffsets, ...Array(maxRayCount - actualRayCount).fill(0)]
    
    let inputs = [this.position.x / 1000, this.position.y / 1000, this.position.rotation / (Math.PI * 2)]
      .concat(paddedAgentOffsets)
      .concat(paddedFoodOffsets)
    
    if (this.geneticTraits.colorVision) {
      const agentColorFlags = this.Sensor.agentOutput.map((e) => e == null ? 0 : 1)
      const foodColorFlags = this.Sensor.foodOutput.map((e) => e == null ? 0 : 0.5)
      const paddedAgentColors = [...agentColorFlags, ...Array(maxRayCount - actualRayCount).fill(0)]
      const paddedFoodColors = [...foodColorFlags, ...Array(maxRayCount - actualRayCount).fill(0)]
      inputs = inputs.concat(paddedAgentColors).concat(paddedFoodColors)
    }
    
    inputs = inputs.concat(this.memoryState)

    const output = this.NeuralNetwork.feedForward(inputs)
    
    if (this.memoryState.length > 0) {
      const memoryDecay = 0.9
      for (let i = 0; i < this.memoryState.length; i++) {
        this.memoryState[i] = output[i % output.length] * memoryDecay + this.memoryState[i] * (1 - memoryDecay)
      }
    }

    const FORWARD = output[0]
    const BACKWARD = output[1]
    const STRAFE_LEFT = output[2]
    const STRAFE_RIGHT = output[3]
    const CLOCKWISE_ROTATION = output[4]
    const CCW_ROTATION = output[5]

    const targetSpeed = this.geneticTraits.movementSpeed
    const acceleration = this.geneticTraits.acceleration
    const drag = this.geneticTraits.drag
    
    this.currentSpeed = this.currentSpeed * drag + (targetSpeed - this.currentSpeed) * acceleration * 0.1
    
    const forwardMovement = (FORWARD - BACKWARD) * this.currentSpeed
    const strafeMovement = (STRAFE_LEFT - STRAFE_RIGHT) * this.currentSpeed
    
    const sin = Math.sin(this.position.rotation)
    const cos = Math.cos(this.position.rotation)
    
    const rotatedDx = forwardMovement * sin + strafeMovement * cos
    const rotatedDy = forwardMovement * cos - strafeMovement * sin

    this.move(rotatedDx, rotatedDy, canvasWidth, canvasHeight)

    if (AgentConfigData.EnableRotation) {
      this.rotate((CLOCKWISE_ROTATION - CCW_ROTATION) * this.geneticTraits.turnRate)
    }

    // Age is incremented by EvolutionManager, not here
    this.energy -= this.calculateEnergyCost()
    
    this.updateFitness()
  }

  private calculateEnergyCost(): number {
    const baseRate = 0.01 / this.geneticTraits.energyEfficiency
    
    const sizeCost = Math.pow(this.geneticTraits.size / 40, 2)
    
    const movementIntensity = Math.abs(this.currentSpeed) / this.geneticTraits.movementSpeed
    const movementCost = movementIntensity * this.geneticTraits.acceleration
    
    const sensorCost = (this.geneticTraits.sensorRayCount / 7) * (this.geneticTraits.sensorRayLength / 180) * (this.geneticTraits.fieldOfView / 180)
    
    const colorVisionCost = this.geneticTraits.colorVision ? 0.3 : 0
    
    return baseRate * (1 + sizeCost + movementCost + sensorCost + colorVisionCost)
  }

  public eatFood(foodSize?: number): void {
    const configData: any = AgentConfigData
    const energyCap = (configData.ReproductionSettings?.EnergyMaxCap) || 100
    
    const baseEnergyGain = foodSize ? (foodSize / 6) * 20 : 20
    const energyGain = baseEnergyGain * this.geneticTraits.digestionRate
    this.energy = Math.min(energyCap, this.energy + energyGain)
    this.foodEaten++
  }

  private updateFitness(): void {
    let fitnessLoss = 0
    
    const maxEnergy = this.geneticTraits.maxEnergyCapacity
    const energyPercentage = (this.energy / maxEnergy) * 100
    
    const energyLoss = 100 - energyPercentage
    fitnessLoss += energyLoss * 0.4
    
    if (this.foodEaten === 0) {
      fitnessLoss += Math.min(this.age * 0.04, 20)
    }
    
    if (this.age > 50) {
      const efficiency = this.foodEaten / (this.age / 100)
      if (efficiency < 5) {
        fitnessLoss += (5 - efficiency) * 3
      }
    }
    
    const expectedDistance = this.age * 0.5
    if (this.distanceTraveled < expectedDistance) {
      fitnessLoss += Math.min((expectedDistance - this.distanceTraveled) * 0.01, 10)
    }
    
    if (this.energy <= 0) {
      fitnessLoss += 15
    }
    
    let bonuses = 0
    
    bonuses += Math.min(this.foodEaten * 2, 20)
    
    if (this.foodEaten > 0) {
      bonuses += Math.min(this.age * 0.02, 10)
    }
    
    const energyThreshold = maxEnergy * 0.7
    if (this.energy > energyThreshold) {
      bonuses += ((this.energy - energyThreshold) / maxEnergy) * 100 * 0.33
    }
    
    this.fitness = Math.max(0, Math.min(100, 100 - fitnessLoss + bonuses))
  }

  public getLifeStage(): string {
    const configData: any = AgentConfigData
    const lifeConfig = configData.LifeStageSettings
    
    if (!lifeConfig) {
      return 'adult'
    }
    
    const ageProgress = this.age / Agent.maxAge
    const segments = lifeConfig.LifeProgressSegments
    
    if (ageProgress <= segments.Embryo.end) return 'embryo'
    if (ageProgress <= segments.Child.end) return 'child'
    if (ageProgress <= segments.Adolescent.end) return 'adolescent'
    if (ageProgress <= segments.Adult.end) return 'adult'
    return 'old'
  }

  public canReproduce(): boolean {
    const configData: any = AgentConfigData
    const lifeConfig = configData.LifeStageSettings
    const reproConfig = configData.ReproductionSettings
    
    if (!lifeConfig) {
      const adultAge = Agent.maxAge / 2
      return this.age >= adultAge && this.energy >= this.geneticTraits.reproductionThreshold
    }
    
    const ageProgress = this.age / Agent.maxAge
    const reproductionCutoff = lifeConfig.ReproductionCutoffPct || 0.90
    const minReproAge = lifeConfig.LifeProgressSegments.Adult.start
    
    const globalMinEnergy = reproConfig?.EnergyMinToReproduce || 40
    const effectiveThreshold = Math.max(globalMinEnergy, this.geneticTraits.reproductionThreshold)
    const hasEnoughEnergy = this.energy >= effectiveThreshold
    const isInReproductiveAge = ageProgress >= minReproAge && ageProgress < reproductionCutoff
    
    return isInReproductiveAge && hasEnoughEnergy
  }

  public getMaturityProgress(): number {
    const configData: any = AgentConfigData
    const lifeConfig = configData.LifeStageSettings
    
    if (!lifeConfig) {
      const adultAge = Agent.maxAge / 2
      return Math.min(1, this.age / adultAge)
    }
    
    const maturityAge = lifeConfig.MaturityYears || 40
    const ageInYears = (this.age / Agent.maxAge) * 100
    return Math.min(1, ageInYears / maturityAge)
  }

  public getAgeScale(): number {
    const maturity = this.getMaturityProgress()
    const minScale = 0.3
    const maxScale = 1.0
    return minScale + (maxScale - minScale) * maturity
  }

  public checkFoodCollision(food: Food[]): Food | null {
    const scale = this.getAgeScale()
    for (const f of food) {
      const dx = this.position.x - f.position.x
      const dy = this.position.y - f.position.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance < (this.width / 2) * scale + f.radius) {
        return f
      }
    }
    return null
  }

  public renderTrail(context: CanvasRenderingContext2D, isSelected: boolean = false): void {
    if (!Agent.trailsEnabled || this.positionHistory.length < 2) return
    
    const agentHue = this.geneticTraits.hue
    const trailColor = isSelected ? 'rgba(255, 255, 0,' : `hsla(${agentHue}, 70%, 50%,`
    
    context.save()
    context.lineCap = 'round'
    context.lineJoin = 'round'
    
    for (let i = 1; i < this.positionHistory.length; i++) {
      const alpha = (i / this.positionHistory.length) * 0.6
      const lineWidth = (i / this.positionHistory.length) * 2 + 0.5
      
      context.beginPath()
      context.strokeStyle = `${trailColor}${alpha})`
      context.lineWidth = lineWidth
      context.moveTo(this.positionHistory[i - 1].x, this.positionHistory[i - 1].y)
      context.lineTo(this.positionHistory[i].x, this.positionHistory[i].y)
      context.stroke()
    }
    
    // Connect last history point to current position
    if (this.positionHistory.length > 0) {
      const lastPoint = this.positionHistory[this.positionHistory.length - 1]
      context.beginPath()
      context.strokeStyle = `${trailColor}0.7)`
      context.lineWidth = 2.5
      context.moveTo(lastPoint.x, lastPoint.y)
      context.lineTo(this.position.x, this.position.y)
      context.stroke()
    }
    
    context.restore()
  }

  private getSpeciesVisualTraits(): { 
    hue: number; 
    saturation: number; 
    lightness: number;
    patternType: number;
    eyeStyle: number;
    bodyShape: number;
  } {
    const speciesHash = parseInt(this.species.substring(0, 8), 36) || 0
    const safeHash = Number.isFinite(speciesHash) ? Math.abs(speciesHash) : 0
    const hue = Number.isFinite(this.geneticTraits.hue) ? Math.floor(this.geneticTraits.hue) % 360 : (safeHash % 360)
    return {
      hue,
      saturation: 50 + (safeHash % 30),
      lightness: 40 + ((safeHash >> 4) % 20),
      patternType: safeHash % 4,
      eyeStyle: (safeHash >> 8) % 3,
      bodyShape: (safeHash >> 12) % 3
    }
  }

  private renderSpeciesPattern(context: CanvasRenderingContext2D, traits: ReturnType<typeof this.getSpeciesVisualTraits>): void {
    const cx = this.position.x
    const cy = this.position.y
    const size = this.width * 0.3
    
    context.save()
    context.translate(cx, cy)
    context.rotate(this.position.rotation)
    context.translate(-cx, -cy)
    
    const patternColor = `hsla(${(traits.hue + 180) % 360}, ${traits.saturation}%, ${traits.lightness + 20}%, 0.6)`
    context.fillStyle = patternColor
    context.strokeStyle = patternColor
    
    switch (traits.patternType) {
      case 0:
        context.beginPath()
        context.arc(cx, cy - size * 0.3, size * 0.25, 0, Math.PI * 2)
        context.fill()
        break
      case 1:
        context.lineWidth = 1.5
        context.beginPath()
        context.moveTo(cx - size * 0.4, cy)
        context.lineTo(cx + size * 0.4, cy)
        context.stroke()
        context.beginPath()
        context.moveTo(cx, cy - size * 0.4)
        context.lineTo(cx, cy + size * 0.2)
        context.stroke()
        break
      case 2:
        for (let i = 0; i < 3; i++) {
          context.beginPath()
          context.arc(cx, cy - size * 0.3 + i * size * 0.25, size * 0.12, 0, Math.PI * 2)
          context.fill()
        }
        break
      case 3:
        context.beginPath()
        context.moveTo(cx, cy - size * 0.5)
        context.lineTo(cx - size * 0.3, cy + size * 0.1)
        context.lineTo(cx + size * 0.3, cy + size * 0.1)
        context.closePath()
        context.fill()
        break
    }
    
    context.restore()
  }

  private renderEyes(context: CanvasRenderingContext2D, traits: ReturnType<typeof this.getSpeciesVisualTraits>, isSelected: boolean): void {
    const cx = this.position.x
    const cy = this.position.y
    const eyeSize = this.width * 0.15
    const eyeOffset = this.width * 0.25
    
    context.save()
    context.translate(cx, cy)
    context.rotate(this.position.rotation)
    context.translate(-cx, -cy)
    
    const eyeY = cy - this.height * 0.2
    
    switch (traits.eyeStyle) {
      case 0:
        context.fillStyle = isSelected ? '#fff' : '#1a1a2e'
        context.beginPath()
        context.arc(cx - eyeOffset, eyeY, eyeSize, 0, Math.PI * 2)
        context.arc(cx + eyeOffset, eyeY, eyeSize, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = isSelected ? '#ff0' : '#4ade80'
        context.beginPath()
        context.arc(cx - eyeOffset, eyeY, eyeSize * 0.5, 0, Math.PI * 2)
        context.arc(cx + eyeOffset, eyeY, eyeSize * 0.5, 0, Math.PI * 2)
        context.fill()
        break;
      case 1:
        context.fillStyle = isSelected ? '#fff' : '#1a1a2e'
        context.beginPath()
        context.arc(cx, eyeY, eyeSize * 1.3, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = isSelected ? '#ff0' : '#f87171'
        context.beginPath()
        context.arc(cx, eyeY, eyeSize * 0.6, 0, Math.PI * 2)
        context.fill()
        break;
      case 2:
        context.fillStyle = isSelected ? '#fff' : '#1a1a2e'
        context.beginPath()
        context.ellipse(cx - eyeOffset, eyeY, eyeSize * 0.8, eyeSize * 1.2, 0, 0, Math.PI * 2)
        context.ellipse(cx + eyeOffset, eyeY, eyeSize * 0.8, eyeSize * 1.2, 0, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = isSelected ? '#ff0' : '#60a5fa'
        context.beginPath()
        context.arc(cx - eyeOffset, eyeY + eyeSize * 0.2, eyeSize * 0.4, 0, Math.PI * 2)
        context.arc(cx + eyeOffset, eyeY + eyeSize * 0.2, eyeSize * 0.4, 0, Math.PI * 2)
        context.fill()
        break;
    }
    
    context.restore()
  }

  public render(context: CanvasRenderingContext2D, isSelected: boolean = false): void {
    const ageScale = this.getAgeScale()
    
    // Render trail first (behind the agent)
    this.renderTrail(context, isSelected)
    
    context.save()
    context.translate(this.position.x, this.position.y)
    context.scale(ageScale, ageScale)
    context.translate(-this.position.x, -this.position.y)
    
    if (AgentConfigData.RenderSensor) {
      this.Sensor.render(context, isSelected)
    }

    const traits = this.getSpeciesVisualTraits()
    const renderConfig: any = AgentConfigData.Rendering

    // Draw body based on species shape
    context.beginPath()
    
    switch (traits.bodyShape) {
      case 0:
        context.moveTo(this.polygon[0].x, this.polygon[0].y)
        for (let i = 1; i < this.polygon.length; i++) {
          context.lineTo(this.polygon[i].x, this.polygon[i].y)
        }
        break;
      case 1:
        const cx = this.position.x
        const cy = this.position.y
        context.save()
        context.translate(cx, cy)
        context.rotate(this.position.rotation)
        context.translate(-cx, -cy)
        context.ellipse(cx, cy, this.width * 0.5, this.height * 0.6, 0, 0, Math.PI * 2)
        context.restore()
        break;
      case 2:
        const centerX = this.position.x
        const centerY = this.position.y
        const radius = this.width * 0.5
        context.save()
        context.translate(centerX, centerY)
        context.rotate(this.position.rotation)
        context.translate(-centerX, -centerY)
        context.moveTo(centerX, centerY - radius * 1.2)
        context.lineTo(centerX + radius * 0.8, centerY + radius * 0.6)
        context.lineTo(centerX - radius * 0.8, centerY + radius * 0.6)
        context.closePath()
        context.restore()
        break;
      default:
        context.moveTo(this.polygon[0].x, this.polygon[0].y)
        for (let i = 1; i < this.polygon.length; i++) {
          context.lineTo(this.polygon[i].x, this.polygon[i].y)
        }
    }
    context.closePath()

    // Color based on species with enhanced visual traits
    context.fillStyle = isSelected ? '#ffff00' : `hsl(${traits.hue}, ${traits.saturation}%, ${traits.lightness}%)`
    context.fill()
    context.strokeStyle = isSelected ? '#ffaa00' : (renderConfig.StrokeColor || `hsl(${traits.hue}, ${traits.saturation}%, ${traits.lightness - 15}%)`)
    context.lineWidth = isSelected ? 3 : renderConfig.StrokeWidth
    context.stroke()

    if (renderConfig.ActiveGlow || isSelected) {
      context.shadowBlur = isSelected ? 15 : 8
      context.shadowColor = isSelected ? '#ffff00' : context.fillStyle as string
      context.stroke()
      context.shadowBlur = 0
    }

    // Render species-specific pattern and eyes
    this.renderSpeciesPattern(context, traits)
    this.renderEyes(context, traits, isSelected)
    
    context.restore()
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }

  private generateSpeciesId(): string {
    return Math.random().toString(36).substring(2, 12)
  }
}

class Food {
  public position: { x: number; y: number }
  public radius: number
  public clusterId: number
  public spawnPoint: { x: number; y: number }
  public driftVelocity: { x: number; y: number }

  constructor(x: number = 0, y: number = 0, size?: number, clusterId: number = 0) {
    this.spawnPoint = { x, y }
    
    const foodSettings: any = AgentConfigData.FoodSettings
    
    if (size !== undefined) {
      this.radius = size
    } else if (foodSettings.VariableSizes) {
      const minSize = foodSettings.MinSize || 4
      const maxSize = foodSettings.MaxSize || 10
      this.radius = minSize + Math.random() * (maxSize - minSize)
    } else {
      this.radius = foodSettings.FoodRadius || 6
    }
    
    const driftMin = foodSettings.DriftMinDistance || 2.0
    const driftMax = foodSettings.DriftMaxDistance || 3.0
    const driftDistance = driftMin + Math.random() * (driftMax - driftMin)
    const driftAngle = Math.random() * Math.PI * 2
    
    const targetX = x + Math.cos(driftAngle) * driftDistance
    const targetY = y + Math.sin(driftAngle) * driftDistance
    
    this.position = { x: targetX, y: targetY }
    
    const driftSpeed = foodSettings.DriftSpeed || 0.01
    const velocityMagnitude = driftSpeed * (0.5 + Math.random() * 0.5)
    const velocityAngle = Math.random() * Math.PI * 2
    
    this.driftVelocity = {
      x: Math.cos(velocityAngle) * velocityMagnitude,
      y: Math.sin(velocityAngle) * velocityMagnitude
    }
    
    this.clusterId = clusterId
  }

  public update(): void {
    const foodSettings: any = AgentConfigData.FoodSettings
    const driftMin = foodSettings.DriftMinDistance || 2.0
    const driftMax = foodSettings.DriftMaxDistance || 3.0
    
    this.position.x += this.driftVelocity.x
    this.position.y += this.driftVelocity.y
    
    const dx = this.position.x - this.spawnPoint.x
    const dy = this.position.y - this.spawnPoint.y
    const distanceFromSpawn = Math.sqrt(dx * dx + dy * dy)
    
    if (distanceFromSpawn < driftMin || distanceFromSpawn > driftMax) {
      const driftAngle = Math.atan2(dy, dx)
      const targetDistance = (driftMin + driftMax) / 2
      
      const pullStrength = 0.02
      const targetX = this.spawnPoint.x + Math.cos(driftAngle) * targetDistance
      const targetY = this.spawnPoint.y + Math.sin(driftAngle) * targetDistance
      
      this.driftVelocity.x += (targetX - this.position.x) * pullStrength
      this.driftVelocity.y += (targetY - this.position.y) * pullStrength
      
      const speed = Math.sqrt(this.driftVelocity.x ** 2 + this.driftVelocity.y ** 2)
      const maxSpeed = foodSettings.DriftSpeed || 0.01
      if (speed > maxSpeed) {
        this.driftVelocity.x = (this.driftVelocity.x / speed) * maxSpeed
        this.driftVelocity.y = (this.driftVelocity.y / speed) * maxSpeed
      }
    }
  }

  public render(context: CanvasRenderingContext2D): void {
    context.beginPath()
    context.arc(this.position.x, this.position.y, this.radius, 0, 2 * Math.PI)
    
    const sizeRatio = this.radius / 6
    let fillColor = '#22c55e'
    
    if (sizeRatio < 0.8) {
      fillColor = '#84cc16'
    } else if (sizeRatio > 1.3) {
      fillColor = '#10b981'
    }
    
    context.fillStyle = fillColor
    context.fill()
    
    context.shadowBlur = 6
    context.shadowColor = fillColor
    context.strokeStyle = '#059669'
    context.lineWidth = 1.5
    context.stroke()
    context.shadowBlur = 0
  }
}

export { Agent, Food }
