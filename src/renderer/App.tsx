import React, { useState, useCallback } from 'react'
import { SimulationCanvasNew } from './components/SimulationCanvasNew'
import { Sidebar } from './components/Sidebar'
import { DNAPanel } from './components/DNAPanel'
import { StatsChart } from './components/StatsChart'
import { SaveLoadPanel } from './components/SaveLoadPanel'
import { EvolutionControls } from './components/EvolutionControls'
import { SpeciesStats } from './components/SpeciesStats'
import type { SimulationConfig, SimulationStats } from './types/simulation'
import type { Agent } from './core/Agent'
import type { GenerationStats, EvolutionConfig } from './core/EvolutionManager'
import AgentConfigData from './core/utilities/AgentConfig.json'

export const App: React.FC = () => {
  const [config, setConfig] = useState<SimulationConfig>(AgentConfigData as any as SimulationConfig)
  const [isRunning, setIsRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [stats, setStats] = useState<SimulationStats>({
    agentCount: config.AgentCount,
    foodCount: config.FoodSettings.SpawnCount,
    fps: 60,
    running: true,
    generation: 0,
    avgFitness: 0,
    maxFitness: 0,
    speciesCount: 0
  })
  const [resetKey, setResetKey] = useState(0)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [generationHistory, setGenerationHistory] = useState<GenerationStats[]>([])
  const [currentAgents, setCurrentAgents] = useState<Agent[]>([])
  const [loadedAgents, setLoadedAgents] = useState<Agent[] | null>(null)
  const [evolutionConfig, setEvolutionConfig] = useState<EvolutionConfig>({
    generationTime: 3000,
    selectionRate: 0.3,
    mutationRate: 0.05,
    populationSize: 30,
    reproductionThreshold: 80,
    maxAge: 1500
  })

  const handleToggleRunning = useCallback(() => {
    setIsRunning(prev => !prev)
  }, [])

  const handleReset = useCallback(() => {
    setResetKey(prev => prev + 1)
    setIsRunning(true)
    setSelectedAgent(null)
    setGenerationHistory([])
  }, [])

  const handleConfigChange = useCallback((newConfig: SimulationConfig) => {
    setConfig(newConfig)
    setResetKey(prev => prev + 1)
  }, [])

  const handleStatsUpdate = useCallback((newStats: SimulationStats) => {
    setStats(newStats)
    
    // Update generation history for charts
    if (newStats.generation !== undefined && 
        newStats.avgFitness !== undefined && 
        newStats.maxFitness !== undefined &&
        newStats.speciesCount !== undefined) {
      setGenerationHistory(prev => {
        const lastGen = prev[prev.length - 1]
        if (!lastGen || lastGen.generation !== newStats.generation) {
          return [...prev.slice(-50), {
            generation: newStats.generation!,
            population: newStats.agentCount,
            avgFitness: newStats.avgFitness!,
            maxFitness: newStats.maxFitness!,
            avgEnergy: 0,
            speciesCount: newStats.speciesCount!,
            births: 0,
            deaths: 0
          }]
        }
        return prev
      })
    }
  }, [])

  const handleAgentSelect = useCallback((agent: Agent | null) => {
    setSelectedAgent(agent)
  }, [])

  const handleCloseDNA = useCallback(() => {
    setSelectedAgent(null)
  }, [])

  const handleAgentsChange = useCallback((agents: Agent[]) => {
    setCurrentAgents(agents)
  }, [])

  const handleLoadAgents = useCallback((agents: Agent[]) => {
    setLoadedAgents(agents)
    setResetKey(prev => prev + 1)
  }, [])

  const handleEvolutionConfigChange = useCallback((newConfig: EvolutionConfig) => {
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
              <span className="stat-value" style={{ color: '#00ff88' }}>{stats.generation || 0}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Species</span>
              <span className="stat-value" style={{ color: '#ff8800' }}>{stats.speciesCount || 0}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Avg Fitness</span>
              <span className="stat-value" style={{ color: '#00ddff' }}>{(stats.avgFitness || 0).toFixed(1)}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Max Fitness</span>
              <span className="stat-value" style={{ color: '#ff00ff' }}>{(stats.maxFitness || 0).toFixed(1)}</span>
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

        {/* Evolution Controls */}
        <EvolutionControls 
          config={evolutionConfig}
          onChange={handleEvolutionConfigChange}
        />

        {/* Save/Load Panel */}
        <SaveLoadPanel
          agents={currentAgents}
          onLoad={handleLoadAgents}
        />

        {/* Controls hint */}
        <div className="sidebar-footer">
          <p style={{ marginBottom: '0.5rem' }}>🖱️ <strong>Controls:</strong></p>
          <p>• Click agent to view DNA</p>
          <p>• Middle/Right mouse to pan</p>
          <p>• Scroll to zoom</p>
          <p>• Ctrl+Click to pan</p>
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

      <DNAPanel selectedAgent={selectedAgent} onClose={handleCloseDNA} />
    </div>
  )
}
