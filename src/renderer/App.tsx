import React, { useState, useCallback } from 'react'
import { SimulationCanvasNew } from './components/SimulationCanvasNew'
import { Sidebar } from './components/Sidebar'
import { DNAPanel } from './components/DNAPanel'
import { StatsChart } from './components/StatsChart'
import { SaveLoadPanel } from './components/SaveLoadPanel'
import { SpeciesStats } from './components/SpeciesStats'
import { FamilyTreePanel } from './components/FamilyTreePanel'
import type { SimulationConfig, SimulationStats } from './types/simulation'
import type { Agent } from './core/Agent'
import type { GenerationStats, EvolutionConfig } from './core/EvolutionManager'
import AgentConfigData from './core/utilities/AgentConfig.json'
import { loadEvolutionConfig } from './core/utilities/loadConfig'

export const App: React.FC = () => {
  const [config, setConfig] = useState<SimulationConfig>(AgentConfigData as any as SimulationConfig)
  const [isRunning, setIsRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [stats, setStats] = useState<SimulationStats>({
    agentCount: config.AgentCount,
    foodCount: config.FoodSettings.SpawnCount,
    fps: 60,
    running: true,
    avgFitness: 0,
    maxFitness: 0,
    speciesCount: 0
  })
  const [resetKey, setResetKey] = useState(0)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [generationHistory, setGenerationHistory] = useState<GenerationStats[]>([])
  const [currentAgents, setCurrentAgents] = useState<Agent[]>([])
  const [agentHistory, setAgentHistory] = useState<Map<string, Agent>>(new Map())
  const [loadedAgents, setLoadedAgents] = useState<Agent[] | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [evolutionConfig, setEvolutionConfig] = useState<EvolutionConfig>(loadEvolutionConfig())

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Spacebar to pause/play
      if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement
        // Don't trigger if typing in an input
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          setIsRunning((prev) => !prev)
        }
      }
      // Escape to close DNA panel
      if (e.code === 'Escape' && selectedAgent) {
        setSelectedAgent(null)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [selectedAgent])

  const handleToggleRunning = useCallback(() => {
    setIsRunning((prev) => {
      console.log(`[App] Simulation ${prev ? 'paused' : 'started'}`)
      return !prev
    })
  }, [])

  const handleReset = useCallback(() => {
    console.log('[App] Resetting simulation')
    setResetKey((prev) => prev + 1)
    setIsRunning(true)
    setSelectedAgent(null)
    setGenerationHistory([])
    setAgentHistory(new Map())
  }, [])

  const handleConfigChange = useCallback((newConfig: SimulationConfig) => {
    console.log('[App] Configuration changed, resetting simulation')
    setConfig(newConfig)
    setResetKey((prev) => prev + 1)
  }, [])

  const handleStatsUpdate = useCallback((newStats: SimulationStats) => {
    setStats(newStats)

    // Update generation history for charts
    if (
      newStats.generation !== undefined &&
      newStats.avgFitness !== undefined &&
      newStats.maxFitness !== undefined &&
      newStats.speciesCount !== undefined
    ) {
      setGenerationHistory((prev) => {
        const lastGen = prev[prev.length - 1]
        if (!lastGen || lastGen.generation !== newStats.generation) {
          return [
            ...prev.slice(-50),
            {
              generation: newStats.generation!,
              population: newStats.agentCount,
              avgFitness: newStats.avgFitness!,
              maxFitness: newStats.maxFitness!,
              avgEnergy: 0,
              speciesCount: newStats.speciesCount!,
              births: 0,
              deaths: 0
            }
          ]
        }
        return prev
      })
    }
  }, [])

  const handleAgentSelect = useCallback((agent: Agent | null) => {
    if (agent) {
      console.log(
        `[App] Agent selected: ${agent.id.substring(0, 8)}, Species: ${agent.species.substring(0, 8)}`
      )
    }
    setSelectedAgent(agent)
  }, [])

  const handleCloseDNA = useCallback(() => {
    setSelectedAgent(null)
  }, [])

  const handleAgentsChange = useCallback((agents: Agent[]) => {
    setCurrentAgents(agents)

    // Update agent history - add new agents to the historical record
    setAgentHistory((prev) => {
      const newHistory = new Map(prev)
      agents.forEach((agent) => {
        if (!newHistory.has(agent.id)) {
          newHistory.set(agent.id, agent)
        }
      })
      return newHistory
    })
  }, [])

  const handleLoadAgents = useCallback((agents: Agent[]) => {
    console.log(`[App] Loading ${agents.length} agents from save`)
    setLoadedAgents(agents)
    setResetKey((prev) => prev + 1)
  }, [])

  const handleEvolutionConfigChange = useCallback((newConfig: EvolutionConfig) => {
    console.log('[App] Evolution config updated:', newConfig)
    setEvolutionConfig(newConfig)
  }, [])

  return (
    <div className="app-container">
      <Sidebar
        config={config}
        stats={stats}
        isRunning={isRunning}
        speed={speed}
        onToggleRunning={handleToggleRunning}
        onSpeedChange={setSpeed}
        onReset={handleReset}
        onConfigChange={handleConfigChange}
      >
        {/* Evolution Statistics */}
        <div className="evolution-stats">
          <h4>📈 Evolution Progress</h4>
          <div className="stats-grid">
            <div className="stat">
              <span className="stat-label">Generation</span>
              <span className="stat-value" style={{ color: '#00ff88' }}>
                {stats.generation || 0}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Species</span>
              <span className="stat-value" style={{ color: '#ff8800' }}>
                {stats.speciesCount || 0}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Avg Fitness</span>
              <span className="stat-value" style={{ color: '#00ddff' }}>
                {(stats.avgFitness || 0).toFixed(1)}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Max Fitness</span>
              <span className="stat-value" style={{ color: '#ff00ff' }}>
                {(stats.maxFitness || 0).toFixed(1)}
              </span>
            </div>
          </div>
          {generationHistory.length > 1 && (
            <div className="stats-chart">
              <StatsChart stats={generationHistory} />
            </div>
          )}
        </div>

        {/* Species Statistics */}
        <SpeciesStats agents={currentAgents} />

        {/* Save/Load Panel */}
        <SaveLoadPanel agents={currentAgents} onLoad={handleLoadAgents} />

        {/* Controls hint */}
        <div className="sidebar-footer">
          <p style={{ marginBottom: '0.5rem' }}>
            🖱️ <strong>Desktop Controls:</strong>
          </p>
          <p>• Click agent to view DNA</p>
          <p>• Middle/Right mouse to pan</p>
          <p>• Scroll to zoom</p>
          <p>• Ctrl+Click to pan</p>
          <p>• R/H/T for visual toggles</p>
          <p style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
            📱 <strong>Mobile Controls:</strong>
          </p>
          <p>• Tap agent to view DNA</p>
          <p>• Drag to pan camera</p>
          <p>• Pinch to zoom</p>
        </div>
      </Sidebar>

      <div className="canvas-container">
        <SimulationCanvasNew
          key={resetKey}
          config={config}
          onStatsUpdate={handleStatsUpdate}
          isRunning={isRunning}
          speed={speed}
          onAgentSelect={handleAgentSelect}
          onAgentsChange={handleAgentsChange}
          evolutionConfig={evolutionConfig}
          loadedAgents={loadedAgents}
        />
      </div>

      <DNAPanel
        selectedAgent={selectedAgent}
        onClose={handleCloseDNA}
        allAgents={currentAgents}
        agentHistory={agentHistory}
        onAgentSelect={handleAgentSelect}
      />
    </div>
  )
}
