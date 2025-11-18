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

type Vertex = { x: number; y: number }

class Agent {
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

  constructor(x: number = 0, y: number = 0, _width: number = 10, _height: number = 10, parentTraits?: GeneticTraits, mateTraits?: GeneticTraits) {
    this.position = { x: x, y: y, rotation: Math.random() * Math.PI * 2 }
    this.geneticTraits = parentTraits ? this.inheritTraits(parentTraits, mateTraits) : this.generateDefaultTraits()
    
    this.width = this.geneticTraits.size
    this.height = this.geneticTraits.size
    this.polygon = this.getgeometry()
    this.fitness = 100
    this.energy = this.geneticTraits.maxEnergyCapacity
    this.age = 0
    this.generation = 0
    this.species = this.generateSpeciesId()
    this.id = this.generateId()
    this.parentIds = []
    this.foodEaten = 0
    this.distanceTraveled = 0
    this.lastPosition = { x, y }
    this.currentSpeed = 0
    this.memoryState = new Array(Math.round(this.geneticTraits.memoryNeurons)).fill(0)

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
      aggression: config.aggression.default
    }
  }

  private inheritTraits(parentTraits: GeneticTraits, mateTraits?: GeneticTraits): GeneticTraits {
    const config: any = (AgentConfigData as any).GeneticTraits
    const mutationRate = parentTraits.mutationRate
    
    const blend = (parent1Val: number, parent2Val: number): number => {
      return parent1Val * 0.5 + parent2Val * 0.5
    }
    
    const mutate = (value: number, range: any): number => {
      if (Math.random() < mutationRate) {
        const mutation = (Math.random() - 0.5) * (range.max - range.min) * 0.2
        return Math.max(range.min, Math.min(range.max, value + mutation))
      }
      return value
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
      aggression: blend(parentTraits.aggression, mateTraits.aggression)
    } : parentTraits

    return {
      size: mutate(baseTraits.size, config.size),
      movementSpeed: mutate(baseTraits.movementSpeed, config.movementSpeed),
      acceleration: mutate(baseTraits.acceleration, config.acceleration),
      turnRate: mutate(baseTraits.turnRate, config.turnRate),
      drag: mutate(baseTraits.drag, config.drag),
      sensorRayCount: Math.round(mutate(baseTraits.sensorRayCount, config.sensorRayCount)),
      sensorRayLength: mutate(baseTraits.sensorRayLength, config.sensorRayLength),
      sensorPrecision: mutate(baseTraits.sensorPrecision, config.sensorPrecision),
      fieldOfView: mutate(baseTraits.fieldOfView, config.fieldOfView),
      colorVision: Math.random() < mutationRate ? Math.random() < config.colorVision.probability : baseTraits.colorVision,
      energyEfficiency: mutate(baseTraits.energyEfficiency, config.energyEfficiency),
      digestionRate: mutate(baseTraits.digestionRate, config.digestionRate),
      maxEnergyCapacity: mutate(baseTraits.maxEnergyCapacity, config.maxEnergyCapacity),
      mutationRate: mutate(baseTraits.mutationRate, config.mutationRate),
      reproductionThreshold: mutate(baseTraits.reproductionThreshold, config.reproductionThreshold),
      offspringCount: Math.round(mutate(baseTraits.offspringCount, config.offspringCount)),
      learningRate: mutate(baseTraits.learningRate, config.learningRate),
      memoryNeurons: Math.round(mutate(baseTraits.memoryNeurons, config.memoryNeurons)),
      aggression: mutate(baseTraits.aggression, config.aggression)
    }
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

    this.age++
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

  public eatFood(): void {
    const baseEnergyGain = 20
    const energyGain = baseEnergyGain * this.geneticTraits.digestionRate
    this.energy = Math.min(this.geneticTraits.maxEnergyCapacity, this.energy + energyGain)
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

  public checkFoodCollision(food: Food[]): Food | null {
    for (const f of food) {
      const dx = this.position.x - f.position.x
      const dy = this.position.y - f.position.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      if (distance < this.width / 2 + f.radius) {
        return f
      }
    }
    return null
  }

  public render(context: CanvasRenderingContext2D, isSelected: boolean = false): void {
    if (AgentConfigData.RenderSensor) {
      this.Sensor.render(context)
    }

    context.beginPath()
    context.moveTo(this.polygon[0].x, this.polygon[0].y)
    for (let i = 1; i < this.polygon.length; i++) {
      context.lineTo(this.polygon[i].x, this.polygon[i].y)
    }
    context.closePath()

    const renderConfig: any = AgentConfigData.Rendering
    
    // Color based on species
    const speciesHue = parseInt(this.species.substring(0, 6), 36) % 360
    context.fillStyle = isSelected ? '#ffff00' : `hsl(${speciesHue}, 70%, 50%)`
    context.fill()
    context.strokeStyle = isSelected ? '#ffaa00' : (renderConfig.StrokeColor || `hsl(${speciesHue}, 70%, 40%)`)
    context.lineWidth = isSelected ? 3 : renderConfig.StrokeWidth
    context.stroke()

    if (renderConfig.ActiveGlow || isSelected) {
      context.shadowBlur = isSelected ? 15 : 8
      context.shadowColor = isSelected ? '#ffff00' : context.fillStyle as string
      context.stroke()
      context.shadowBlur = 0
    }
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

  constructor(x: number = 0, y: number = 0, size?: number) {
    this.position = { x: x, y: y }
    const foodSettings: any = AgentConfigData.FoodSettings
    this.radius = size || foodSettings.FoodRadius || 6
  }

  public render(context: CanvasRenderingContext2D): void {
    context.beginPath()
    context.arc(this.position.x, this.position.y, this.radius, 0, 2 * Math.PI)
    context.fillStyle = AgentConfigData.FoodSettings.FoodColor
    context.fill()
    
    context.shadowBlur = 6
    context.shadowColor = AgentConfigData.FoodSettings.FoodColor
    context.strokeStyle = '#f59e0b'
    context.lineWidth = 1.5
    context.stroke()
    context.shadowBlur = 0
  }
}

export { Agent, Food }
