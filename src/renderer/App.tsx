import React, { useState, useCallback } from 'react'
import { SimulationCanvasNew } from './components/SimulationCanvasNew'
import { Sidebar } from './components/Sidebar'
import { DNAPanel } from './components/DNAPanel'
import { StatsChart } from './components/StatsChart'
import { SaveLoadPanel } from './components/SaveLoadPanel'
import { SpeciesStats } from './components/SpeciesStats'
import { AgentBuilderPanel } from './components/AgentBuilderPanel'
import type { SimulationConfig, SimulationStats, GeneticTraits } from './types/simulation'
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
  const [agentScreenPos, setAgentScreenPos] = useState<{ x: number; y: number } | null>(null)
  const [generationHistory, setGenerationHistory] = useState<GenerationStats[]>([])
  const [currentAgents, setCurrentAgents] = useState<Agent[]>([])
  const [agentHistory, setAgentHistory] = useState<Map<string, Agent>>(new Map())
  const [loadedAgents, setLoadedAgents] = useState<Agent[] | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [evolutionConfig, setEvolutionConfig] = useState<EvolutionConfig>(loadEvolutionConfig())
  const [placementMode, setPlacementMode] = useState(false)
  const [pendingAgentTraits, setPendingAgentTraits] = useState<GeneticTraits | null>(null)
  const [showAgentBuilder, setShowAgentBuilder] = useState(false)
  const [multiPlaceMode, setMultiPlaceMode] = useState(false)
  const [multiPlaceSpeciesId, setMultiPlaceSpeciesId] = useState<string | null>(null)

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
    setAgentHistory(new Map())
    setGenerationHistory([])
    setSelectedAgent(null)
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

  const handleAgentSelect = useCallback(
    (agent: Agent | null, screenPos?: { x: number; y: number }) => {
      if (agent) {
        console.log(
          `[App] Agent selected: ${agent.id.substring(0, 8)}, Species: ${agent.species.substring(0, 8)}`
        )
        setAgentScreenPos(screenPos || null)
      }
      setSelectedAgent(agent)
    },
    []
  )

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

  const handleSpawnAgent = useCallback(
    (traits: GeneticTraits, multiPlace?: boolean, speciesId?: string) => {
      console.log('[App] Spawning custom agent with placement mode, multiPlace:', multiPlace)
      setPendingAgentTraits(traits)
      setPlacementMode(true)
      setMultiPlaceMode(multiPlace || false)
      setMultiPlaceSpeciesId(speciesId || null)
      setShowAgentBuilder(false)
    },
    []
  )

  const handlePlacementComplete = useCallback(
    (newSpeciesId?: string) => {
      console.log('[App] Agent placed successfully, multiPlaceMode:', multiPlaceMode)
      if (multiPlaceMode) {
        if (newSpeciesId && !multiPlaceSpeciesId) {
          setMultiPlaceSpeciesId(newSpeciesId)
        }
      } else {
        setPlacementMode(false)
        setPendingAgentTraits(null)
        setMultiPlaceSpeciesId(null)
      }
    },
    [multiPlaceMode, multiPlaceSpeciesId]
  )

  const handleCancelPlacement = useCallback(() => {
    console.log('[App] Placement cancelled')
    setPlacementMode(false)
    setPendingAgentTraits(null)
    setMultiPlaceMode(false)
    setMultiPlaceSpeciesId(null)
  }, [])

  const handleCloseAgentBuilder = useCallback(() => {
    setShowAgentBuilder(false)
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
        <div className="sidebar-section evolution-stats">
          <h3 className="section-title">Evolution</h3>
          <div
            className="stats-grid"
            style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}
          >
            <div className="stat" style={{ textAlign: 'center' }}>
              <span className="stat-label" style={{ fontSize: '0.6rem' }}>
                Gen
              </span>
              <span className="stat-value" style={{ color: '#00ff88', fontSize: '1rem' }}>
                {stats.generation || 0}
              </span>
            </div>
            <div className="stat" style={{ textAlign: 'center' }}>
              <span className="stat-label" style={{ fontSize: '0.6rem' }}>
                Species
              </span>
              <span className="stat-value" style={{ color: '#ff8800', fontSize: '1rem' }}>
                {stats.speciesCount || 0}
              </span>
            </div>
            <div className="stat" style={{ textAlign: 'center' }}>
              <span className="stat-label" style={{ fontSize: '0.6rem' }}>
                Avg Fit
              </span>
              <span className="stat-value" style={{ color: '#00ddff', fontSize: '1rem' }}>
                {(stats.avgFitness || 0).toFixed(0)}
              </span>
            </div>
            <div className="stat" style={{ textAlign: 'center' }}>
              <span className="stat-label" style={{ fontSize: '0.6rem' }}>
                Max Fit
              </span>
              <span className="stat-value" style={{ color: '#ff00ff', fontSize: '1rem' }}>
                {(stats.maxFitness || 0).toFixed(0)}
              </span>
            </div>
          </div>
          {generationHistory.length > 1 && (
            <div className="stats-chart" style={{ marginTop: '0.5rem' }}>
              <StatsChart stats={generationHistory} />
            </div>
          )}
        </div>

        {/* Species Statistics */}
        <SpeciesStats agents={currentAgents} />

        {/* Save/Load Panel */}
        <SaveLoadPanel agents={currentAgents} onLoad={handleLoadAgents} />

        {/* Agent Builder Button */}
        <div className="sidebar-section">
          <button
            className="btn-control"
            onClick={() => setShowAgentBuilder(true)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px'
            }}
          >
            <i className="bi bi-plus-circle" style={{ display: 'inline-block' }}></i>
            Create Agent
          </button>
        </div>

        {/* Controls hint - compact */}
        <div
          className="sidebar-footer"
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: '0.75rem',
            marginTop: '0.5rem'
          }}
        >
          <span style={{ color: '#666', fontSize: '0.6rem' }}>
            Click agent for DNA | Scroll to zoom | R = trails | Space = pause
          </span>
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
          placementMode={placementMode}
          pendingAgentTraits={pendingAgentTraits}
          onPlacementComplete={handlePlacementComplete}
          multiPlaceMode={multiPlaceMode}
          multiPlaceSpeciesId={multiPlaceSpeciesId}
          onCancelPlacement={handleCancelPlacement}
        />
      </div>

      <DNAPanel
        selectedAgent={selectedAgent}
        onClose={handleCloseDNA}
        allAgents={currentAgents}
        agentHistory={agentHistory}
        onAgentSelect={handleAgentSelect}
        screenPosition={agentScreenPos}
        resetKey={resetKey}
      />

      <AgentBuilderPanel
        isOpen={showAgentBuilder}
        onClose={handleCloseAgentBuilder}
        onSpawnAgent={handleSpawnAgent}
      />
    </div>
  )
}
