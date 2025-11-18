import React, { useMemo } from 'react'
import { Agent } from '../core/Agent'
import { SpeciesChart } from './SpeciesChart'

interface SpeciesStatsProps {
  agents: Agent[]
}

interface SpeciesInfo {
  id: string
  count: number
  avgFitness: number
  maxFitness: number
  avgEnergy: number
  avgAge: number
  color: string
  hue: number
}

export const SpeciesStats: React.FC<SpeciesStatsProps> = ({ agents }) => {
  const speciesData = useMemo(() => {
    const speciesMap = new Map<string, Agent[]>()
    
    for (const agent of agents) {
      if (!speciesMap.has(agent.species)) {
        speciesMap.set(agent.species, [])
      }
      speciesMap.get(agent.species)!.push(agent)
    }

    const data: SpeciesInfo[] = Array.from(speciesMap.entries()).map(([id, speciesAgents]) => {
      const totalFitness = speciesAgents.reduce((sum, a) => sum + a.fitness, 0)
      const totalEnergy = speciesAgents.reduce((sum, a) => sum + a.energy, 0)
      const totalAge = speciesAgents.reduce((sum, a) => sum + a.age, 0)
      const speciesHue = parseInt(id.substring(0, 6), 36) % 360

      return {
        id,
        count: speciesAgents.length,
        avgFitness: totalFitness / speciesAgents.length,
        maxFitness: Math.max(...speciesAgents.map(a => a.fitness)),
        avgEnergy: totalEnergy / speciesAgents.length,
        avgAge: totalAge / speciesAgents.length,
        color: `hsl(${speciesHue}, 70%, 50%)`,
        hue: speciesHue
      }
    })

    return data.sort((a, b) => b.avgFitness - a.avgFitness)
  }, [agents])

  if (agents.length === 0) {
    return <div style={{ color: '#555', fontSize: '0.75rem', padding: '1rem' }}>No agents alive</div>
  }

  return (
    <div className="species-stats-panel">
      <div className="species-chart-container">
        <SpeciesChart agents={agents} />
      </div>
      
      <div className="species-leaderboard">
        <h5 style={{ color: '#999', fontSize: '0.75rem', marginBottom: '0.75rem', textTransform: 'uppercase' }}>
          🏆 Species Leaderboard
        </h5>
        <div className="species-list">
          {speciesData.map((species, index) => (
            <div key={species.id} className="species-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div className="rank-badge">{index + 1}</div>
                <div 
                  className="species-color" 
                  style={{ backgroundColor: species.color }}
                ></div>
                <div className="species-info">
                  <div className="species-name">{species.id.substring(0, 8)}</div>
                  <div className="species-count">{species.count} agents</div>
                </div>
              </div>
              <div className="species-metrics">
                <div className="metric">
                  <span className="metric-label">Fitness</span>
                  <span className="metric-value" style={{ color: '#00ff88' }}>
                    {species.avgFitness.toFixed(1)}
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">Energy</span>
                  <span className="metric-value" style={{ 
                    color: species.avgEnergy > 60 ? '#00ff88' : species.avgEnergy > 30 ? '#ff8800' : '#ff4444' 
                  }}>
                    {species.avgEnergy.toFixed(0)}%
                  </span>
                </div>
                <div className="metric">
                  <span className="metric-label">Age</span>
                  <span className="metric-value">{species.avgAge.toFixed(0)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
