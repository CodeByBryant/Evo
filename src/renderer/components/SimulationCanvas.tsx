import React, { useEffect, useRef, useState } from 'react'
import { Agent, Food } from '../core/Agent'
import AgentConfigData from '../core/utilities/AgentConfig.json'
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

  useEffect(() => {
    initializeSimulation()
  }, [config])

  const initializeSimulation = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    agentsRef.current = []
    foodRef.current = []

    const { AgentCount, DefaultAgentSize, EnableRotation, FoodSettings } = config

    for (let i = 0; i < AgentCount; i++) {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      const agent = new Agent(x, y, DefaultAgentSize.width, DefaultAgentSize.height)

      if (EnableRotation) {
        agent.rotate(Math.random() * 2 * Math.PI)
      }

      agentsRef.current.push(agent)
    }

    for (let i = 0; i < FoodSettings.SpawnCount; i++) {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      foodRef.current.push(new Food(x, y, Math.random() * 10 + 1))
    }
  }

  useEffect(() => {
    if (isRunning) {
      startAnimation()
    } else {
      stopAnimation()
    }

    return () => stopAnimation()
  }, [isRunning, speed])

  const startAnimation = () => {
    // Update stats to reflect running state immediately
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

      context.fillStyle = 'black'
      context.fillRect(0, 0, canvas.width, canvas.height)

      agentsRef.current.forEach((agent) => {
        agent.update(agentsRef.current)
        agent.render(context)
      })

      foodRef.current.forEach((food) => {
        food.render(context)
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
  }

  const stopAnimation = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    
    // Update stats to reflect paused state
    if (onStatsUpdate) {
      onStatsUpdate({
        agentCount: agentsRef.current.length,
        foodCount: foodRef.current.length,
        fps: fpsRef.current,
        running: false
      })
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-100 h-100"
      style={{
        border: '2px solid #333',
        borderRadius: '8px',
        backgroundColor: '#000'
      }}
    />
  )
}
