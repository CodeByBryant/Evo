import React, { useEffect, useRef, useCallback } from 'react'
import { Agent, Food } from '../core/Agent'
import type { SimulationConfig, SimulationStats } from '../types/simulation'

interface SimulationCanvasProps {
  config: SimulationConfig
  onStatsUpdate?: (stats: SimulationStats) => void
  isRunning: boolean
  speed: number
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
  config,
  onStatsUpdate,
  isRunning,
  speed
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const agentsRef = useRef<Agent[]>([])
  const foodRef = useRef<Food[]>([])
  const animationFrameRef = useRef<number | undefined>(undefined)
  const lastFrameTimeRef = useRef<number>(0)
  const fpsRef = useRef<number>(60)

  const drawIsometricGrid = useCallback(
    (context: CanvasRenderingContext2D, width: number, height: number) => {
      const gridSize = 50
      const lineColor = '#111111'

      context.strokeStyle = lineColor
      context.lineWidth = 0.3
      context.globalAlpha = 0.3

      for (let x = 0; x < width; x += gridSize) {
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, height)
        context.stroke()
      }

      for (let y = 0; y < height; y += gridSize) {
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(width, y)
        context.stroke()
      }

      context.globalAlpha = 1.0
    },
    []
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    context.imageSmoothingEnabled = true

    return () => {
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [])

  const initializeSimulation = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    agentsRef.current = []
    foodRef.current = []

    const { AgentCount, DefaultAgentSize, FoodSettings } = config

    for (let i = 0; i < AgentCount; i++) {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      const agent = new Agent(x, y, DefaultAgentSize.width, DefaultAgentSize.height)
      agentsRef.current.push(agent)
    }

    for (let i = 0; i < FoodSettings.SpawnCount; i++) {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      foodRef.current.push(new Food(x, y))
    }
  }, [config])

  useEffect(() => {
    initializeSimulation()
  }, [initializeSimulation])

  const handleFoodCollisions = useCallback(
    (canvas: HTMLCanvasElement) => {
      for (const agent of agentsRef.current) {
        const eatenFood = agent.checkFoodCollision(foodRef.current)
        if (eatenFood && config.FoodSettings.RespawnOnEat) {
          const index = foodRef.current.indexOf(eatenFood)
          if (index !== -1) {
            foodRef.current[index] = new Food(
              Math.random() * canvas.width,
              Math.random() * canvas.height
            )
          }
          agent.energy = Math.min(100, agent.energy + 20)
          agent.fitness += 1
        }
      }
    },
    [config.FoodSettings.RespawnOnEat]
  )

  const startAnimation = useCallback(() => {
    if (onStatsUpdate) {
      onStatsUpdate({
        agentCount: agentsRef.current.length,
        foodCount: foodRef.current.length,
        fps: fpsRef.current,
        running: true
      })
    }

    const animate = (currentTime: number) => {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return

      const deltaTime = currentTime - lastFrameTimeRef.current
      if (deltaTime < 1000 / (60 * speed)) {
        animationFrameRef.current = requestAnimationFrame(animate)
        return
      }

      lastFrameTimeRef.current = currentTime

      if (deltaTime > 0) {
        fpsRef.current = Math.round(1000 / deltaTime)
      }

      context.fillStyle = '#0a0a0a'
      context.fillRect(0, 0, canvas.width, canvas.height)

      drawIsometricGrid(context, canvas.width, canvas.height)

      agentsRef.current.forEach((agent) => {
        agent.update(agentsRef.current, foodRef.current, canvas.width, canvas.height)
      })

      handleFoodCollisions(canvas)

      foodRef.current.forEach((food) => {
        food.render(context)
      })

      agentsRef.current.forEach((agent) => {
        agent.render(context)
      })

      if (onStatsUpdate) {
        onStatsUpdate({
          agentCount: agentsRef.current.length,
          foodCount: foodRef.current.length,
          fps: fpsRef.current,
          running: true
        })
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [speed, onStatsUpdate, drawIsometricGrid, handleFoodCollisions])

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    if (onStatsUpdate) {
      onStatsUpdate({
        agentCount: agentsRef.current.length,
        foodCount: foodRef.current.length,
        fps: fpsRef.current,
        running: false
      })
    }
  }, [onStatsUpdate])

  useEffect(() => {
    if (isRunning) {
      startAnimation()
    } else {
      stopAnimation()
    }

    return () => stopAnimation()
  }, [isRunning, startAnimation, stopAnimation])

  return <canvas ref={canvasRef} />
}
