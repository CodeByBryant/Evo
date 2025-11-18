/**
 * @author By Bryant Ejorh - CodeByBryant
 *
 * License: MIT License 2024
 *
 * @fileoverview This script defines the Agent, Food classes, and handles the agent's neural network, sensors, movement, and rendering.
 */

import { NeuralNetwork, Sensor } from './NeuralNetwork'
import AgentConfigData from './utilities/AgentConfig.json'
import { Utilities } from './utilities/utilities'

type Vertex = { x: number; y: number }

/**
 * Agent class represents an entity that moves, senses, and consumes food in the simulation.
 * It has a neural network that controls its behavior based on sensory inputs.
 */
class Agent {
  public position: { x: number; y: number; rotation: number }
  public width: number
  public height: number

  public polygon: Vertex[]

  public NeuralNetwork: NeuralNetwork
  public Sensor: Sensor

  /**
   * Creates a new Agent instance with the specified position and size.
   * Initializes the neural network, sensor, and fitness attributes.
   *
   * @param x The x-coordinate of the agent's position (default 0).
   * @param y The y-coordinate of the agent's position (default 0).
   * @param width The width of the agent (default 10).
   * @param height The height of the agent (default 10).
   */
  constructor(x: number = 0, y: number = 0, width: number = 10, height: number = 10) {
    this.position = { x: x, y: y, rotation: 0 }
    this.width = width
    this.height = height
    this.polygon = this.getgeometry()

    // Initialize the neural network with a predefined configuration from AgentConfigData
    this.NeuralNetwork = new NeuralNetwork([
      AgentConfigData.Sensor.RayCount + 3,
      20,
      20,
      20,
      4
    ])

    // Initialize the agent's sensor
    this.Sensor = new Sensor(this, AgentConfigData.Sensor)
  }

  /**
   * Returns the geometry (polygon) of the agent as an array of vertices.
   * This function calculates the agent's corners based on its position and rotation.
   *
   * @returns An array of vertices representing the agent's shape.
   */
  public getgeometry(): Vertex[] {
    const verticies: Vertex[] = []

    // Calculate half the diagonal length of the rectangle
    const rad = Math.hypot(this.width, this.height) / 2
    const alpha = Math.atan2(this.width, this.height)

    // Calculate the four corners of the agent based on its rotation
    verticies.push({
      x: this.position.x - Math.sin(this.position.rotation - alpha) * rad,
      y: this.position.y - Math.cos(this.position.rotation - alpha) * rad
    })
    verticies.push({
      x: this.position.x - Math.sin(this.position.rotation + alpha) * rad,
      y: this.position.y - Math.cos(this.position.rotation + alpha) * rad
    })
    verticies.push({
      x: this.position.x - Math.sin(Math.PI + this.position.rotation - alpha) * rad,
      y: this.position.y - Math.cos(Math.PI + this.position.rotation - alpha) * rad
    })
    verticies.push({
      x: this.position.x - Math.sin(Math.PI + this.position.rotation + alpha) * rad,
      y: this.position.y - Math.cos(Math.PI + this.position.rotation + alpha) * rad
    })

    return verticies
  }

  /**
   * Moves the agent by the specified distances along the x and y axes.
   * Also updates the agent's geometry after movement.
   *
   * @param dx The distance to move the agent along the x-axis.
   * @param dy The distance to move the agent along the y-axis.
   */
  public move(dx: number, dy: number): void {
    this.position.x += dx
    this.position.y += dy
    this.polygon = this.getgeometry()
  }

  /**
   * Rotates the agent by the specified amount in radians.
   * Also updates the agent's geometry after rotation.
   *
   * @param dr The rotation amount in radians.
   */
  public rotate(dr: number): void {
    this.position.rotation = (this.position.rotation + dr + 2 * Math.PI) % (2 * Math.PI)
    this.polygon = this.getgeometry()
  }

  /**
   * Updates the agent's state, including movement, fitness, and sensor readings.
   *
   * @param entities The list of entities (agents and food) in the simulation.
   */
  public update(entities: Agent[]): void {
    this.polygon = this.getgeometry()
    this.Sensor.update(entities)

    // Get raycast results and process them as inputs to the neural network
    const offsets = this.Sensor.output.map((e) => (e == null ? 0 : 1 - e.offset))

    // Feed the current state and sensor outputs to the neural network
    const output = this.NeuralNetwork.feedForward(
      [this.position.x, this.position.y, this.position.rotation].concat(offsets)
    )

    // Get outputs for movement and rotation
    const FORWARD = this.Round(output[0])
    const BACKWARD = this.Round(output[1])
    const CLOCKWISE_ROTATION = this.Round(output[2])
    const CCW_ROTATION = this.Round(output[3])

    // Movement and rotation constants
    const movementSpeed = AgentConfigData.MovementSpeed
    const rotationSpeed = AgentConfigData.RotationSpeed

    // Calculate forward and backward movement
    const dy = (FORWARD - BACKWARD) * movementSpeed
    const sin = Math.sin(this.position.rotation)
    const cos = Math.cos(this.position.rotation)
    const rotatedDx = dy * sin
    const rotatedDy = dy * cos

    this.move(rotatedDx, rotatedDy)

    // Apply rotation if enabled
    if (AgentConfigData.EnableRotation)
      this.rotate((CLOCKWISE_ROTATION - CCW_ROTATION) * rotationSpeed)
  }

  /**
   * Destroys the agent by removing it from the agent list.
   *
   * @param agentList The list of agents from which this agent should be removed.
   */
  public destroy(agentList: Agent[]): void {
    const index = agentList.indexOf(this)
    if (index !== -1) {
      agentList.splice(index, 1)
    }
  }

  public render(context: CanvasRenderingContext2D): void {
    if (AgentConfigData.RenderSensor) {
      this.Sensor.render(context)
    }

    // Render the agent
    context.beginPath()

    // Move to the first vertex
    context.moveTo(this.polygon[0].x, this.polygon[0].y)

    // Draw lines to subsequent vertices
    for (let i = 1; i < this.polygon.length; i++) {
      context.lineTo(this.polygon[i].x, this.polygon[i].y)
    }

    // Close the polygon
    context.closePath()

    // Fill and stroke the polygon
    context.fillStyle = AgentConfigData.Rendering.FillColor
    context.fill()
    context.strokeStyle = Utilities.lightenHexColor(AgentConfigData.Rendering.FillColor, 1)
    context.lineWidth = AgentConfigData.Rendering.StrokeWidth
    context.stroke()
  }

  /**
   * Rounds a number based on its proximity to 0 or 1.
   * If the number is exactly 0.5, it rounds up to 1.
   * Otherwise, if the number is closer to 0, it rounds to 0, and if it's closer to 1, it rounds to 1.
   *
   * @param x The number to be rounded.
   * @returns The rounded number, either 0 or 1.
   */
  private Round(x: number): number {
    if (x === 0.5) {
      return 1
    }
    return x < 0.5 ? 0 : 1
  }
}

/**
 * The Food class represents food items in the simulation that agents can consume.
 * Each food item has a position and a radius.
 */
class Food {
  public position: { x: number; y: number }
  public radius: number

  /**
   * Creates a new Food instance at the specified position with a given size.
   *
   * @param x The x-coordinate of the food's position (default 0).
   * @param y The y-coordinate of the food's position (default 0).
   * @param size The size of the food item (default 10).
   */
  constructor(x: number = 0, y: number = 0, size: number = 10) {
    this.position = { x: x, y: y }
    this.radius = size
  }

  /**
   * Renders the food item on the canvas.
   * Draws a circle at the food's position with the specified radius and color.
   */
  public render(context: CanvasRenderingContext2D): void {
    // Render the food
    context.beginPath()
    context.arc(this.position.x, this.position.y, this.radius, 0, 2 * Math.PI)
    context.fillStyle = AgentConfigData.FoodSettings.FoodColor
    context.fill()
    context.strokeStyle = Utilities.lightenHexColor(AgentConfigData.FoodSettings.FoodColor, 1)
    context.lineWidth = AgentConfigData.Rendering.StrokeWidth
    context.stroke()
  }
}

export { Agent, Food }
