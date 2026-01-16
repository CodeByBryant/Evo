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
  const [expanded, setExpanded] = React.useState(false)

  const speciesData = useMemo(() => {
    if (agents.length === 0) return []

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
        maxFitness: Math.max(...speciesAgents.map((a) => a.fitness)),
        avgEnergy: totalEnergy / speciesAgents.length,
        avgAge: totalAge / speciesAgents.length,
        color: `hsl(${speciesHue}, 70%, 50%)`,
        hue: speciesHue
      }
    })

    return data.sort((a, b) => b.avgFitness - a.avgFitness)
  }, [agents])

  if (agents.length === 0) {
    return null
  }

  return (
    <div className="sidebar-section species-stats-panel">
      <div
        className="section-header"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', marginBottom: expanded ? '0.75rem' : '0' }}
      >
        <h3 className="section-title">Species ({speciesData.length})</h3>
        <i
          className={`bi bi-chevron-${expanded ? 'up' : 'down'}`}
          style={{ color: '#555', fontSize: '0.7rem' }}
        ></i>
      </div>

      {expanded && (
        <>
          <div className="species-chart-container" style={{ marginBottom: '0.5rem' }}>
            <SpeciesChart agents={agents} />
          </div>

          <div className="species-list" style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {speciesData.slice(0, 5).map((species, index) => (
              <div
                key={species.id}
                className="species-card"
                style={{ padding: '0.35rem 0', borderBottom: '1px solid #1a1a1a' }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: '#555', fontSize: '0.65rem', width: '12px' }}>
                      {index + 1}
                    </span>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: species.color
                      }}
                    ></div>
                    <span style={{ fontSize: '0.7rem', color: '#888' }}>
                      {species.id.substring(0, 6)}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: '#555' }}>({species.count})</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.65rem' }}>
                    <span style={{ color: '#00ff88' }}>{species.avgFitness.toFixed(0)}</span>
                    <span style={{ color: species.avgEnergy > 50 ? '#00ff88' : '#ff8800' }}>
                      {species.avgEnergy.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
