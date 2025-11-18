/**
 * @author By Bryant Ejorh - CodeByBryant
 *
 * License: MIT License 2024
 *
 * @fileoverview Enhanced neural network implementation with configurable architecture,
 * multiple activation functions, modern weight initialization, and improved mutation strategies.
 */

import type { Agent, Food } from './Agent'
import type { Point } from './utilities/utilities'

export type ActivationFunction = 'leakyReLU' | 'swish' | 'elu' | 'tanh'
export type InitializationMethod = 'random' | 'xavier' | 'he'
export type MutationStrategy = 'uniform' | 'gaussian'

interface NeuralNetworkConfig {
  HiddenLayers: number[]
  ActivationFunction: ActivationFunction
  InitializationMethod: InitializationMethod
  MutationStrategy: MutationStrategy
}

class NeuralNetwork {
  levels: Level[]
  activationFunction: ActivationFunction
  mutationStrategy: MutationStrategy

  constructor(layerSizes: number[], config?: Partial<NeuralNetworkConfig>) {
    this.levels = []
    this.activationFunction = config?.ActivationFunction || 'swish'
    this.mutationStrategy = config?.MutationStrategy || 'gaussian'

    const initMethod = config?.InitializationMethod || 'he'

    for (let i = 0; i < layerSizes.length - 1; i++) {
      this.levels.push(new Level(layerSizes[i], layerSizes[i + 1], initMethod))
    }
  }

  public feedForward(inputs: number[]): number[] {
    let outputs = Level.feedForward(inputs, this.levels[0], this.activationFunction)

    for (let i = 1; i < this.levels.length; i++) {
      outputs = Level.feedForward(outputs, this.levels[i], this.activationFunction)
    }
    return outputs
  }

  public mutate(mutationRate = 0.1): void {
    this.levels.forEach((level) => {
      for (let i = 0; i < level.biases.length; i++) {
        if (this.mutationStrategy === 'gaussian') {
          level.biases[i] += this.gaussianRandom() * mutationRate
          level.biases[i] = Math.max(-2, Math.min(2, level.biases[i]))
        } else {
          level.biases[i] = lerp(level.biases[i], Math.random() * 2 - 1, mutationRate)
        }
      }
      
      for (let i = 0; i < level.weights.length; i++) {
        for (let j = 0; j < level.weights[i].length; j++) {
          if (this.mutationStrategy === 'gaussian') {
            level.weights[i][j] += this.gaussianRandom() * mutationRate
            level.weights[i][j] = Math.max(-2, Math.min(2, level.weights[i][j]))
          } else {
            level.weights[i][j] = lerp(level.weights[i][j], Math.random() * 2 - 1, mutationRate)
          }
        }
      }
    })
  }

  private gaussianRandom(): number {
    const u1 = Math.random()
    const u2 = Math.random()
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }

  public clone(): NeuralNetwork {
    const cloned = new NeuralNetwork(
      [this.levels[0].inputs.length, ...this.levels.map(l => l.outputs.length)],
      {
        ActivationFunction: this.activationFunction,
        MutationStrategy: this.mutationStrategy
      }
    )
    
    for (let i = 0; i < this.levels.length; i++) {
      cloned.levels[i].biases = [...this.levels[i].biases]
      cloned.levels[i].weights = this.levels[i].weights.map(w => [...w])
    }
    
    return cloned
  }

  public crossover(other: NeuralNetwork): NeuralNetwork {
    const child = this.clone()
    
    // Crossover: randomly take genes from each parent
    for (let i = 0; i < this.levels.length && i < other.levels.length; i++) {
      for (let j = 0; j < child.levels[i].biases.length; j++) {
        if (Math.random() < 0.5) {
          child.levels[i].biases[j] = other.levels[i].biases[j]
        }
      }
      
      for (let j = 0; j < child.levels[i].weights.length; j++) {
        for (let k = 0; k < child.levels[i].weights[j].length; k++) {
          if (Math.random() < 0.5) {
            child.levels[i].weights[j][k] = other.levels[i].weights[j][k]
          }
        }
      }
    }
    
    return child
  }

  public getGenomeData(): number[] {
    const genome: number[] = []
    
    for (const level of this.levels) {
      genome.push(...level.biases)
      for (const weights of level.weights) {
        genome.push(...weights)
      }
    }
    
    return genome
  }
}

class Sensor {
  public agent: Agent
  public rayCount: number
  public rayLength: number
  public raySpread: number
  public detectFood: boolean
  public detectAgents: boolean

  public rays: Point[][]
  public agentOutput: ({ x: number; y: number; offset: number } | null)[]
  public foodOutput: ({ x: number; y: number; offset: number } | null)[]

  constructor(
    agent: Agent,
    config: {
      RayCount: number
      RayLength: number
      DetectFood?: boolean
      DetectAgents?: boolean
    }
  ) {
    this.agent = agent
    this.rayCount = config.RayCount
    this.rayLength = config.RayLength
    this.raySpread = Math.PI * 0.75
    this.detectFood = config.DetectFood !== false
    this.detectAgents = config.DetectAgents !== false
    this.rays = []
    this.agentOutput = []
    this.foodOutput = []
  }

  public update(agents: Agent[], food: Food[]): void {
    this.castRays()
    this.agentOutput = []
    this.foodOutput = []

    for (let i = 0; i < this.rays.length; i++) {
      if (this.detectAgents) {
        this.agentOutput.push(this.getAgentIntersection(this.rays[i], agents))
      } else {
        this.agentOutput.push(null)
      }

      if (this.detectFood) {
        this.foodOutput.push(this.getFoodIntersection(this.rays[i], food))
      } else {
        this.foodOutput.push(null)
      }
    }
  }

  private getAgentIntersection(
    ray: Point[],
    agents: Agent[]
  ): { x: number; y: number; offset: number } | null {
    const intersections: { x: number; y: number; offset: number }[] = []

    for (const agent of agents) {
      if (agent === this.agent) continue

      const polygon = agent.polygon
      for (let i = 0; i < polygon.length; i++) {
        const intersection = getIntersection(
          ray[0],
          ray[1],
          polygon[i],
          polygon[(i + 1) % polygon.length]
        )
        if (intersection) {
          intersections.push(intersection)
        }
      }
    }

    if (intersections.length === 0) return null
    
    const offsets = intersections.map((e) => e.offset)
    const minOffset = Math.min(...offsets)
    return intersections.find((e) => e.offset === minOffset) || null
  }

  private getFoodIntersection(
    ray: Point[],
    food: Food[]
  ): { x: number; y: number; offset: number } | null {
    let closestIntersection: { x: number; y: number; offset: number } | null = null
    let minOffset = Infinity

    for (const f of food) {
      const intersection = this.rayCircleIntersection(ray, f.position, f.radius)
      if (intersection && intersection.offset < minOffset) {
        closestIntersection = intersection
        minOffset = intersection.offset
      }
    }

    return closestIntersection
  }

  private rayCircleIntersection(
    ray: Point[],
    center: { x: number; y: number },
    radius: number
  ): { x: number; y: number; offset: number } | null {
    const dx = ray[1].x - ray[0].x
    const dy = ray[1].y - ray[0].y
    const fx = ray[0].x - center.x
    const fy = ray[0].y - center.y

    const a = dx * dx + dy * dy
    const b = 2 * (fx * dx + fy * dy)
    const c = fx * fx + fy * fy - radius * radius

    const discriminant = b * b - 4 * a * c

    if (discriminant < 0) return null

    const t1 = (-b - Math.sqrt(discriminant)) / (2 * a)
    const t2 = (-b + Math.sqrt(discriminant)) / (2 * a)

    let t = -1
    if (t1 >= 0 && t1 <= 1) t = t1
    else if (t2 >= 0 && t2 <= 1) t = t2

    if (t === -1) return null

    return {
      x: ray[0].x + t * dx,
      y: ray[0].y + t * dy,
      offset: t
    }
  }

  private castRays(): void {
    this.rays = []

    for (let i = 0; i < this.rayCount; i++) {
      const angle =
        lerp(
          this.raySpread / 2,
          -this.raySpread / 2,
          this.rayCount === 1 ? 0.5 : i / (this.rayCount - 1)
        ) + this.agent.position.rotation

      const start = { x: this.agent.position.x, y: this.agent.position.y }
      const end = {
        x: this.agent.position.x - Math.sin(angle) * this.rayLength,
        y: this.agent.position.y - Math.cos(angle) * this.rayLength
      }
      this.rays.push([start, end])
    }
  }

  public render(context: CanvasRenderingContext2D): void {
    // Don't render if rays haven't been initialized yet
    if (!this.rays || this.rays.length === 0 || !this.rays[0]) {
      return
    }

    for (let i = 0; i < this.rayCount; i++) {
      const agentEnd = this.agentOutput[i]
      const foodEnd = this.foodOutput[i]
      
      let end = this.rays[i][1]
      let hitColor = '#94a3b8'
      
      if (agentEnd && foodEnd) {
        end = agentEnd.offset < foodEnd.offset ? agentEnd : foodEnd
        hitColor = agentEnd.offset < foodEnd.offset ? '#60a5fa' : '#fbbf24'
      } else if (agentEnd) {
        end = agentEnd
        hitColor = '#60a5fa'
      } else if (foodEnd) {
        end = foodEnd
        hitColor = '#fbbf24'
      }

      context.beginPath()
      context.lineWidth = 1.5
      context.strokeStyle = hitColor
      context.globalAlpha = 0.6
      context.moveTo(this.rays[i][0].x, this.rays[i][0].y)
      context.lineTo(end.x, end.y)
      context.stroke()

      if (end !== this.rays[i][1]) {
        context.beginPath()
        context.lineWidth = 1
        context.strokeStyle = '#4a5568'
        context.globalAlpha = 0.3
        context.moveTo(end.x, end.y)
        context.lineTo(this.rays[i][1].x, this.rays[i][1].y)
        context.stroke()
      }
    }
    context.globalAlpha = 1.0
  }
}

class Level {
  inputs: number[]
  outputs: number[]
  biases: number[]
  weights: number[][]

  constructor(inputCount: number, outputCount: number, initMethod: InitializationMethod = 'he') {
    this.inputs = new Array(inputCount)
    this.outputs = new Array(outputCount)
    this.biases = new Array(outputCount)
    this.weights = []
    
    for (let i = 0; i < inputCount; i++) {
      this.weights[i] = new Array(outputCount)
    }
    
    Level.initialize(this, inputCount, outputCount, initMethod)
  }

  private static initialize(
    level: Level,
    inputCount: number,
    outputCount: number,
    method: InitializationMethod
  ): void {
    let scale = 1

    switch (method) {
      case 'xavier':
        scale = Math.sqrt(2.0 / (inputCount + outputCount))
        break
      case 'he':
        scale = Math.sqrt(2.0 / inputCount)
        break
      case 'random':
      default:
        scale = 1
        break
    }

    for (let i = 0; i < level.weights.length; i++) {
      for (let j = 0; j < level.weights[i].length; j++) {
        level.weights[i][j] = (Math.random() * 2 - 1) * scale
      }
    }
    
    for (let i = 0; i < level.biases.length; i++) {
      level.biases[i] = (Math.random() * 2 - 1) * scale * 0.5
    }
  }

  public static feedForward(
    inputs: number[],
    level: Level,
    activationFn: ActivationFunction
  ): number[] {
    for (let i = 0; i < level.inputs.length; i++) {
      level.inputs[i] = inputs[i]
    }

    for (let i = 0; i < level.outputs.length; i++) {
      let sum = 0
      for (let j = 0; j < level.inputs.length; j++) {
        sum += level.inputs[j] * level.weights[j][i]
      }
      sum += level.biases[i]
      level.outputs[i] = Level.activate(sum, activationFn)
    }

    return level.outputs
  }

  private static activate(x: number, fn: ActivationFunction): number {
    switch (fn) {
      case 'swish':
        return x / (1 + Math.exp(-x))
      case 'elu':
        return x >= 0 ? x : 0.01 * (Math.exp(x) - 1)
      case 'tanh':
        return Math.tanh(x)
      case 'leakyReLU':
      default:
        return x >= 0 ? x : 0.01 * x
    }
  }
}

function getIntersection(
  A: Point,
  B: Point,
  C: Point,
  D: Point
): { x: number; y: number; offset: number } | false {
  const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x)
  const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y)
  const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y)

  if (bottom !== 0) {
    const t = tTop / bottom
    const u = uTop / bottom
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: lerp(A.x, B.x, t),
        y: lerp(A.y, B.y, t),
        offset: t
      }
    }
  }
  return false
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a)
}

export { NeuralNetwork, Sensor }
