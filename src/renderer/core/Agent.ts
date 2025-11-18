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
    this.fitness = 100
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
    const layerSizes = [inputSize, ...nnConfig.HiddenLayers, 6]

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
    const STRAFE_LEFT = output[2]
    const STRAFE_RIGHT = output[3]
    const CLOCKWISE_ROTATION = output[4]
    const CCW_ROTATION = output[5]

    const movementSpeed = AgentConfigData.MovementSpeed
    const rotationSpeed = AgentConfigData.RotationSpeed

    // Forward/backward movement
    const forwardMovement = (FORWARD - BACKWARD) * movementSpeed
    // Strafe left/right movement (perpendicular to forward)
    const strafeMovement = (STRAFE_LEFT - STRAFE_RIGHT) * movementSpeed
    
    const sin = Math.sin(this.position.rotation)
    const cos = Math.cos(this.position.rotation)
    
    // Combine forward and strafe movements
    const rotatedDx = forwardMovement * sin + strafeMovement * cos
    const rotatedDy = forwardMovement * cos - strafeMovement * sin

    this.move(rotatedDx, rotatedDy, canvasWidth, canvasHeight)

    if (AgentConfigData.EnableRotation) {
      this.rotate((CLOCKWISE_ROTATION - CCW_ROTATION) * rotationSpeed)
    }

    this.energy -= 0.01
    
    // Calculate comprehensive fitness
    this.updateFitness()
  }

  private updateFitness(): void {
    // Fitness starts at 100 and decreases based on inefficiency
    // The goal is to stay as close to 100 as possible
    let fitnessLoss = 0
    
    // 1. Starvation Penalty (up to -40) - Losing energy is bad
    const energyLoss = 100 - this.energy
    fitnessLoss += energyLoss * 0.4
    
    // 2. Aging Penalty (up to -20) - Time without food is costly
    if (this.foodEaten === 0) {
      fitnessLoss += Math.min(this.age * 0.04, 20)
    }
    
    // 3. Inefficiency Penalty (up to -15) - Poor food-to-age ratio
    if (this.age > 50) {
      const efficiency = this.foodEaten / (this.age / 100)
      if (efficiency < 5) {
        fitnessLoss += (5 - efficiency) * 3
      }
    }
    
    // 4. Inactivity Penalty (up to -10) - Not exploring enough
    const expectedDistance = this.age * 0.5
    if (this.distanceTraveled < expectedDistance) {
      fitnessLoss += Math.min((expectedDistance - this.distanceTraveled) * 0.01, 10)
    }
    
    // 5. Death Penalty (-15) - Being dead is very bad
    if (this.energy <= 0) {
      fitnessLoss += 15
    }
    
    // Bonuses for good performance (can offset penalties)
    let bonuses = 0
    
    // Food consumption bonus (up to +20)
    bonuses += Math.min(this.foodEaten * 2, 20)
    
    // Longevity bonus (up to +10) - surviving while eating
    if (this.foodEaten > 0) {
      bonuses += Math.min(this.age * 0.02, 10)
    }
    
    // Energy efficiency bonus (up to +10) - maintaining high energy
    if (this.energy > 70) {
      bonuses += (this.energy - 70) * 0.33
    }
    
    // Calculate final fitness: start at 100, subtract losses, add bonuses
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
