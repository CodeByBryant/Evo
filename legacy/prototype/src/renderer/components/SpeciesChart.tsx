import React, { useEffect, useRef } from 'react'
import { Agent } from '../core/Agent'

interface SpeciesData {
  id: string
  count: number
  avgFitness: number
  maxFitness: number
  avgEnergy: number
  avgAge: number
  color: string
}

interface SpeciesChartProps {
  agents: Agent[]
  width?: number
  height?: number
}

export const SpeciesChart: React.FC<SpeciesChartProps> = ({
  agents,
  width = 400,
  height = 250
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current || agents.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = width
    canvas.height = height

    // Group agents by species
    const speciesMap = new Map<string, Agent[]>()
    for (const agent of agents) {
      if (!speciesMap.has(agent.species)) {
        speciesMap.set(agent.species, [])
      }
      speciesMap.get(agent.species)!.push(agent)
    }

    // Calculate species data
    const speciesData: SpeciesData[] = Array.from(speciesMap.entries()).map(
      ([id, speciesAgents]) => {
        const totalFitness = speciesAgents.reduce((sum, a) => sum + a.fitness, 0)
        const totalEnergy = speciesAgents.reduce((sum, a) => sum + a.energy, 0)
        const totalAge = speciesAgents.reduce((sum, a) => sum + a.age, 0)
        const speciesHue = parseInt(id.substring(0, 6), 36) % 360

        return {
          id,
          count: speciesAgents.length,
          avgFitness: totalFitness / speciesAgents.length,
          maxFitness: Math.max(...speciesAgents.map((a) => a.fitness)),
          avgEnergy: totalEnergy / speciesAgents.length,
          avgAge: totalAge / speciesAgents.length,
          color: `hsl(${speciesHue}, 70%, 50%)`
        }
      }
    )

    // Sort by population
    speciesData.sort((a, b) => b.count - a.count)

    // Clear canvas
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, width, height)

    if (speciesData.length === 0) return

    // Draw chart
    const barHeight = 30
    const barSpacing = 10
    const maxPopulation = Math.max(...speciesData.map((s) => s.count))
    const maxFitness = Math.max(...speciesData.map((s) => s.maxFitness), 1)

    speciesData.slice(0, 5).forEach((species, i) => {
      const y = i * (barHeight + barSpacing) + 20
      const barWidthPop = (species.count / maxPopulation) * (width - 150)
      const barWidthFit = (species.avgFitness / maxFitness) * (width - 150)

      // Draw population bar
      ctx.fillStyle = species.color
      ctx.fillRect(120, y, barWidthPop, barHeight / 2 - 2)

      // Draw fitness bar
      ctx.fillStyle = `${species.color}88`
      ctx.fillRect(120, y + barHeight / 2 + 2, barWidthFit, barHeight / 2 - 2)

      // Draw species color indicator
      ctx.fillStyle = species.color
      ctx.beginPath()
      ctx.arc(15, y + barHeight / 2, 8, 0, Math.PI * 2)
      ctx.fill()

      // Draw species info
      ctx.fillStyle = '#999999'
      ctx.font = '9px monospace'
      ctx.fillText(species.id.substring(0, 6), 30, y + 10)
      ctx.fillStyle = '#00ff88'
      ctx.font = '10px monospace'
      ctx.fillText(`${species.count}`, 30, y + 24)

      // Draw values at end of bars
      ctx.fillStyle = '#999999'
      ctx.font = '9px monospace'
      ctx.fillText(`Pop: ${species.count}`, 120 + barWidthPop + 5, y + barHeight / 2 - 2)
      ctx.fillText(
        `Fit: ${species.avgFitness.toFixed(1)}`,
        120 + barWidthFit + 5,
        y + barHeight - 2
      )
    })

    // Draw legend
    ctx.fillStyle = '#999999'
    ctx.font = '10px monospace'
    ctx.fillText('Top 5 Species', 10, height - 10)
  }, [agents, width, height])

  return <canvas ref={canvasRef} style={{ width: '100%', height: 'auto' }} />
}
