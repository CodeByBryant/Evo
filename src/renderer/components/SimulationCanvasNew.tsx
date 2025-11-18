import React, { useEffect, useRef, useCallback, useState } from 'react'
import { Agent, Food } from '../core/Agent'
import { Camera } from '../core/Camera'
import { EvolutionManager } from '../core/EvolutionManager'
import type { SimulationConfig, SimulationStats } from '../types/simulation'

interface SimulationCanvasProps {
  config: SimulationConfig
  onStatsUpdate?: (stats: SimulationStats) => void
  isRunning: boolean
  speed: number
  onAgentSelect?: (agent: Agent | null) => void
  onAgentsChange?: (agents: Agent[]) => void
  evolutionConfig?: import('../core/EvolutionManager').EvolutionConfig
  loadedAgents?: Agent[] | null
}

export const SimulationCanvasNew: React.FC<SimulationCanvasProps> = ({
  config,
  onStatsUpdate,
  isRunning,
  speed,
  onAgentSelect,
  onAgentsChange,
  evolutionConfig,
  loadedAgents
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const agentsRef = useRef<Agent[]>([])
  const foodRef = useRef<Food[]>([])
  const cameraRef = useRef<Camera>(new Camera())
  const evolutionRef = useRef<EvolutionManager>(new EvolutionManager(evolutionConfig))
  const animationFrameRef = useRef<number | undefined>(undefined)
  const lastFrameTimeRef = useRef<number>(0)
  const fpsRef = useRef<number>(60)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  // Update evolution config when it changes
  useEffect(() => {
    if (evolutionConfig) {
      evolutionRef.current.setConfig(evolutionConfig)
    }
  }, [evolutionConfig])

  // Handle loaded agents
  useEffect(() => {
    if (loadedAgents && loadedAgents.length > 0) {
      // Replace agents
      agentsRef.current = loadedAgents
      
      // Reinitialize evolution manager
      evolutionRef.current.reset()
      
      // Regenerate food
      foodRef.current = []
      for (let i = 0; i < config.FoodSettings.SpawnCount; i++) {
        const x = (Math.random() - 0.5) * 1500
        const y = (Math.random() - 0.5) * 1500
        foodRef.current.push(new Food(x, y))
      }
      
      // Clone array to ensure React detects state change
      onAgentsChange?.([...loadedAgents])
    }
  }, [loadedAgents, onAgentsChange, config.FoodSettings.SpawnCount])

  const drawInfiniteGrid = useCallback((
    context: CanvasRenderingContext2D,
    camera: Camera,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    const gridSize = 100
    const lineColor = '#111111'

    context.strokeStyle = lineColor
    context.lineWidth = 1
    context.globalAlpha = 0.2

    // Calculate visible grid range in world coordinates
    const startWorld = camera.screenToWorld(0, 0, canvasWidth, canvasHeight)
    const endWorld = camera.screenToWorld(canvasWidth, canvasHeight, canvasWidth, canvasHeight)

    const startX = Math.floor(startWorld.x / gridSize) * gridSize
    const endX = Math.ceil(endWorld.x / gridSize) * gridSize
    const startY = Math.floor(startWorld.y / gridSize) * gridSize
    const endY = Math.ceil(endWorld.y / gridSize) * gridSize

    // Draw vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
      context.beginPath()
      context.moveTo(x, startY - gridSize)
      context.lineTo(x, endY + gridSize)
      context.stroke()
    }

    // Draw horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
      context.beginPath()
      context.moveTo(startX - gridSize, y)
      context.lineTo(endX + gridSize, y)
      context.stroke()
    }

    context.globalAlpha = 1.0
  }, [])

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

    // Mouse event handlers for camera control
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.ctrlKey)) {
        e.preventDefault()
        cameraRef.current.startDrag(e.clientX, e.clientY)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      cameraRef.current.drag(e.clientX, e.clientY)
    }

    const handleMouseUp = () => {
      cameraRef.current.stopDrag()
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      cameraRef.current.zoomAt(mouseX, mouseY, -e.deltaY, canvas.width, canvas.height)
    }

    const handleClick = (e: MouseEvent) => {
      if (e.ctrlKey) return // Skip if panning
      
      const rect = canvas.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      const worldPos = cameraRef.current.screenToWorld(mouseX, mouseY, canvas.width, canvas.height)

      // Find closest agent to click
      let closestAgent: Agent | null = null
      let closestDist = Infinity

      for (const agent of agentsRef.current) {
        const dx = agent.position.x - worldPos.x
        const dy = agent.position.y - worldPos.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < 30 && dist < closestDist) {
          closestAgent = agent
          closestDist = dist
        }
      }

      setSelectedAgent(closestAgent)
      onAgentSelect?.(closestAgent)
    }

    // Touch event handlers for mobile camera control
    let touchStartDistance = 0
    let lastTouchX = 0
    let lastTouchY = 0
    let isPanning = false

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Pinch to zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        touchStartDistance = Math.sqrt(dx * dx + dy * dy)
        isPanning = false
      } else if (e.touches.length === 1) {
        // Single touch for panning
        lastTouchX = e.touches[0].clientX
        lastTouchY = e.touches[0].clientY
        cameraRef.current.startDrag(lastTouchX, lastTouchY)
        isPanning = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()

      if (e.touches.length === 2) {
        // Pinch to zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (touchStartDistance > 0) {
          const delta = distance - touchStartDistance
          const rect = canvas.getBoundingClientRect()
          const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
          const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
          cameraRef.current.zoomAt(centerX, centerY, -delta * 3, canvas.width, canvas.height)
          touchStartDistance = distance
        }
        isPanning = false
      } else if (e.touches.length === 1 && isPanning) {
        // Single touch panning
        const touchX = e.touches[0].clientX
        const touchY = e.touches[0].clientY
        cameraRef.current.drag(touchX, touchY)
        lastTouchX = touchX
        lastTouchY = touchY
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        cameraRef.current.stopDrag()
        isPanning = false
        touchStartDistance = 0

        // If it was a quick tap, select agent
        if (e.changedTouches.length === 1) {
          const rect = canvas.getBoundingClientRect()
          const touchX = e.changedTouches[0].clientX - rect.left
          const touchY = e.changedTouches[0].clientY - rect.top
          const worldPos = cameraRef.current.screenToWorld(touchX, touchY, canvas.width, canvas.height)

          let closestAgent: Agent | null = null
          let closestDist = Infinity

          for (const agent of agentsRef.current) {
            const dx = agent.position.x - worldPos.x
            const dy = agent.position.y - worldPos.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (dist < 50 && dist < closestDist) {
              closestAgent = agent
              closestDist = dist
            }
          }

          if (closestAgent) {
            setSelectedAgent(closestAgent)
            onAgentSelect?.(closestAgent)
          }
        }
      }
    }

    // Mouse events
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    // Touch events for mobile
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false })

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onAgentSelect])

  const initializeSimulation = useCallback(() => {
    agentsRef.current = []
    foodRef.current = []

    const { AgentCount, DefaultAgentSize, FoodSettings } = config

    // Spawn in a larger area for infinite world
    for (let i = 0; i < AgentCount; i++) {
      const x = (Math.random() - 0.5) * 1000
      const y = (Math.random() - 0.5) * 1000
      const agent = new Agent(x, y)
      agentsRef.current.push(agent)
    }

    for (let i = 0; i < FoodSettings.SpawnCount; i++) {
      const x = (Math.random() - 0.5) * 1500
      const y = (Math.random() - 0.5) * 1500
      foodRef.current.push(new Food(x, y))
    }

    // Notify parent of initial agents with cloned array
    onAgentsChange?.([...agentsRef.current])
  }, [config, onAgentsChange])

  useEffect(() => {
    initializeSimulation()
  }, [initializeSimulation])

  const handleFoodCollisions = useCallback(() => {
    for (const agent of agentsRef.current) {
      const eatenFood = agent.checkFoodCollision(foodRef.current)
      if (eatenFood && config.FoodSettings.RespawnOnEat) {
        const index = foodRef.current.indexOf(eatenFood)
        if (index !== -1) {
          // Respawn food in infinite world near existing food clusters
          const x = (Math.random() - 0.5) * 2000
          const y = (Math.random() - 0.5) * 2000
          foodRef.current[index] = new Food(x, y)
        }
        agent.eatFood()
      }
    }
  }, [config.FoodSettings.RespawnOnEat])

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

      // Clear and set up camera transform
      context.save()
      context.fillStyle = '#0a0a0a'
      context.fillRect(0, 0, canvas.width, canvas.height)

      cameraRef.current.applyTransform(context, canvas.width, canvas.height)

      // Draw infinite grid
      drawInfiniteGrid(context, cameraRef.current, canvas.width, canvas.height)

      // Update agents (no canvas boundaries for infinite world)
      agentsRef.current.forEach((agent) => {
        agent.update(agentsRef.current, foodRef.current)
      })

      // Evolution system
      const evolutionResult = evolutionRef.current.update(agentsRef.current)
      agentsRef.current = evolutionResult.agents

      // If population died out, reinitialize
      if (agentsRef.current.length === 0) {
        initializeSimulation()
      }

      // Handle food collisions (updates fitness/energy)
      handleFoodCollisions()

      // Notify parent of agent changes with cloned array so React detects updates
      onAgentsChange?.([...agentsRef.current])

      // Render food
      foodRef.current.forEach((food) => {
        food.render(context)
      })

      // Render agents
      agentsRef.current.forEach((agent) => {
        const isSelected = selectedAgent ? agent.id === selectedAgent.id : false
        agent.render(context, isSelected)
      })

      context.restore()

      // Draw UI overlay (camera info)
      context.fillStyle = '#00ff88'
      context.font = '12px monospace'
      context.fillText(`Zoom: ${cameraRef.current.zoom.toFixed(2)}x`, 10, canvas.height - 60)
      context.fillText(`Camera: (${cameraRef.current.x.toFixed(0)}, ${cameraRef.current.y.toFixed(0)})`, 10, canvas.height - 40)
      context.fillText(`Generation: ${evolutionRef.current.generation}`, 10, canvas.height - 20)

      if (onStatsUpdate) {
        const latestStats = evolutionRef.current.getLatestStats()
        onStatsUpdate({
          agentCount: agentsRef.current.length,
          foodCount: foodRef.current.length,
          fps: fpsRef.current,
          running: true,
          generation: evolutionRef.current.generation,
          avgFitness: latestStats?.avgFitness || 0,
          maxFitness: latestStats?.maxFitness || 0,
          speciesCount: latestStats?.speciesCount || 0
        })
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
  }, [speed, onStatsUpdate, onAgentsChange, drawInfiniteGrid, handleFoodCollisions, initializeSimulation, selectedAgent])

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    if (onStatsUpdate) {
      onStatsUpdate({
        agentCount: agentsRef.current.length,
        foodCount: foodRef.current.length,
        fps: fpsRef.current,
        running: false,
        generation: evolutionRef.current.generation
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

  return (
    <canvas 
      ref={canvasRef} 
      style={{ cursor: 'grab', width: '100%', height: '100%' }}
    />
  )
}
