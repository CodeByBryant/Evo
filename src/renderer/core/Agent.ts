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

  constructor(x: number = 0, y: number = 0, width: number = 10, height: number = 10) {
    this.position = { x: x, y: y, rotation: Math.random() * Math.PI * 2 }
    this.width = width
    this.height = height
    this.polygon = this.getgeometry()
    this.fitness = 0
    this.energy = 100
    this.age = 0
    this.generation = 0
    this.species = this.generateSpeciesId()
    this.id = this.generateId()
    this.parentIds = []
    this.foodEaten = 0
    this.distanceTraveled = 0
    this.lastPosition = { x, y }

    const configData: any = AgentConfigData
    const nnConfig = configData.NeuralNetwork || { HiddenLayers: [16, 16, 12], ActivationFunction: 'swish', InitializationMethod: 'he', MutationStrategy: 'gaussian' }
    const inputSize = AgentConfigData.Sensor.RayCount * 2 + 3
    const layerSizes = [inputSize, ...nnConfig.HiddenLayers, 4]

    this.NeuralNetwork = new NeuralNetwork(layerSizes, {
      ActivationFunction: nnConfig.ActivationFunction as any,
      InitializationMethod: nnConfig.InitializationMethod as any,
      MutationStrategy: nnConfig.MutationStrategy as any
    })

    this.Sensor = new Sensor(this, AgentConfigData.Sensor)
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

    const agentOffsets = this.Sensor.agentOutput.map((e) => (e == null ? 0 : 1 - e.offset))
    const foodOffsets = this.Sensor.foodOutput.map((e) => (e == null ? 0 : 1 - e.offset))

    const output = this.NeuralNetwork.feedForward(
      [this.position.x / 1000, this.position.y / 1000, this.position.rotation / (Math.PI * 2)]
        .concat(agentOffsets)
        .concat(foodOffsets)
    )

    const FORWARD = output[0]
    const BACKWARD = output[1]
    const CLOCKWISE_ROTATION = output[2]
    const CCW_ROTATION = output[3]

    const movementSpeed = AgentConfigData.MovementSpeed
    const rotationSpeed = AgentConfigData.RotationSpeed

    const dy = (FORWARD - BACKWARD) * movementSpeed
    const sin = Math.sin(this.position.rotation)
    const cos = Math.cos(this.position.rotation)
    const rotatedDx = dy * sin
    const rotatedDy = dy * cos

    this.move(rotatedDx, rotatedDy, canvasWidth, canvasHeight)

    if (AgentConfigData.EnableRotation) {
      this.rotate((CLOCKWISE_ROTATION - CCW_ROTATION) * rotationSpeed)
    }

    this.energy -= 0.01
    
    // Calculate comprehensive fitness
    this.updateFitness()
  }

  private updateFitness(): void {
    // Baseline fitness floor - all agents start with minimum fitness
    let newFitness = 1.0
    
    // 1. Food Consumption (40 points max) - Primary survival metric
    const foodScore = this.foodEaten * 8
    newFitness += foodScore
    
    // 2. Survival Time (25 points max) - Reward longevity
    const survivalScore = Math.min(this.age * 0.05, 25)
    newFitness += survivalScore
    
    // 3. Energy Efficiency (20 points max) - Reward sustainable energy use
    const energyScore = (this.energy / 100) * 20
    newFitness += energyScore
    
    // 4. Exploration (10 points max) - Reward movement but cap to prevent wandering
    const explorationScore = Math.min(this.distanceTraveled * 0.002, 10)
    newFitness += explorationScore
    
    // 5. Survival Bonus (5 points) - Extra bonus for staying alive
    if (this.energy > 0) {
      newFitness += 5
    }
    
    // 6. Food Efficiency Multiplier - Bonus for eating relative to age
    if (this.age > 0 && this.foodEaten > 0) {
      const efficiency = this.foodEaten / Math.max(this.age / 100, 1)
      newFitness += Math.min(efficiency * 2, 10)
    }
    
    // 7. Energy Conservation Bonus - Reward for not wasting energy
    if (this.age > 100) {
      const energyRetention = this.energy / (this.age * 0.01)
      newFitness += Math.min(energyRetention * 0.5, 5)
    }
    
    // Ensure minimum fitness floor of 1.0 - no agent should ever have 0 fitness
    this.fitness = Math.max(1.0, newFitness)
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
