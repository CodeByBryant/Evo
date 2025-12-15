import React, { useEffect, useRef } from 'react'
import type { GenerationStats } from '../core/EvolutionManager'

interface StatsChartProps {
  stats: GenerationStats[]
  width?: number
  height?: number
}

export const StatsChart: React.FC<StatsChartProps> = ({ stats, width = 400, height = 200 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || stats.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = width
    canvas.height = height

    // Clear canvas
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, width, height)

    // Draw grid
    ctx.strokeStyle = '#222222'
    ctx.lineWidth = 1
    for (let i = 0; i <= 5; i++) {
      const y = (height / 5) * i
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    if (stats.length < 2) return

    // Calculate scales
    const maxGen = Math.max(...stats.map(s => s.generation))
    const maxPop = Math.max(...stats.map(s => s.population), 1)
    const maxFitness = Math.max(...stats.map(s => s.maxFitness), 1)

    const xScale = width / Math.max(maxGen, 1)
    const yScalePop = (height * 0.4) / maxPop
    const yScaleFitness = (height * 0.4) / maxFitness

    // Draw population line
    ctx.strokeStyle = '#00ff88'
    ctx.lineWidth = 2
    ctx.beginPath()
    stats.forEach((stat, i) => {
      const x = stat.generation * xScale
      const y = height - stat.population * yScalePop - 10
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Draw fitness line
    ctx.strokeStyle = '#ff8800'
    ctx.lineWidth = 2
    ctx.beginPath()
    stats.forEach((stat, i) => {
      const x = stat.generation * xScale
      const y = height - stat.maxFitness * yScaleFitness - 10
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Draw labels
    ctx.fillStyle = '#00ff88'
    ctx.font = '10px monospace'
    ctx.fillText('Population', 10, 15)
    
    ctx.fillStyle = '#ff8800'
    ctx.fillText('Max Fitness', 10, 30)

  }, [stats, width, height])

  return <canvas ref={canvasRef} style={{ width: '100%', height: 'auto' }} />
}
