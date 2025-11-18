/**
 * @author By Bryant Ejorh - CodeByBryant
 *
 * MIT License 2024
 *
 * @fileoverview EvoSquares renderer entry point - initializes and runs the simulation
 */

import { Agent, Food } from './simulation/Agent'
import AgentConfigData from './simulation/utilities/AgentConfig.json'
import './assets/main.css'

let canvas: HTMLCanvasElement
let context: CanvasRenderingContext2D

/**
 * Initialize the canvas and context
 */
function initCanvas(): void {
  canvas = document.createElement('canvas')
  const app = document.getElementById('app')
  if (app) {
    app.appendChild(canvas)
  } else {
    document.body.appendChild(canvas)
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not get 2D context from canvas')
  }
  context = ctx

  // Set initial canvas size
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  // Handle window resize
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  })

  // Enable image smoothing for smoother lines
  context.imageSmoothingEnabled = true
}

/**
 * Main simulation entry point
 */
function startSimulation(): void {
  const agents: Agent[] = []
  const food: Food[] = []

  // Generate agents based on AgentConfigData
  const {
    AgentCount,
    DefaultAgentSize: { width, height },
    EnableRotation
  } = AgentConfigData

  for (let i = 0; i < AgentCount; i++) {
    const x = Math.random() * window.innerWidth
    const y = Math.random() * window.innerHeight

    const agent = new Agent(x, y, width, height)

    if (EnableRotation) {
      agent.rotate(Math.random() * 2 * Math.PI)
    }

    agents.push(agent)
  }

  // Generate food based on AgentConfigData
  for (let i = 0; i < AgentConfigData.FoodSettings.SpawnCount; i++) {
    const x = Math.random() * window.innerWidth
    const y = Math.random() * window.innerHeight

    food.push(new Food(x, y, Math.random() * 10 + 1))
  }

  // Animation loop
  function update(): void {
    // Clear the canvas
    context.fillStyle = 'black'
    context.fillRect(0, 0, canvas.width, canvas.height)

    agents.forEach((agent) => {
      agent.update(agents)
      agent.render(context)
    })

    food.forEach((foodItem) => {
      foodItem.render(context)
    })

    requestAnimationFrame(update)
  }

  // Start the animation loop
  update()
}

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  initCanvas()
  startSimulation()
})
