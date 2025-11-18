import React, { useState, useCallback } from 'react'
import { SimulationCanvas } from './components/SimulationCanvas'
import { Sidebar } from './components/Sidebar'
import type { SimulationConfig, SimulationStats } from './types/simulation'
import AgentConfigData from './core/utilities/AgentConfig.json'

export const App: React.FC = () => {
  const [config, setConfig] = useState<SimulationConfig>(AgentConfigData as any as SimulationConfig)
  const [isRunning, setIsRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [stats, setStats] = useState<SimulationStats>({
    agentCount: config.AgentCount,
    foodCount: config.FoodSettings.SpawnCount,
    fps: 60,
    running: true
  })
  const [resetKey, setResetKey] = useState(0)

  const handleToggleRunning = useCallback(() => {
    setIsRunning(prev => !prev)
  }, [])

  const handleReset = useCallback(() => {
    setResetKey(prev => prev + 1)
    setIsRunning(true)
  }, [])

  const handleConfigChange = useCallback((newConfig: SimulationConfig) => {
    setConfig(newConfig)
    setResetKey(prev => prev + 1)
  }, [])

  const handleStatsUpdate = useCallback((newStats: SimulationStats) => {
    setStats(newStats)
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
      />
      <div className="canvas-container">
        <SimulationCanvas
          key={resetKey}
          config={config}
          onStatsUpdate={handleStatsUpdate}
          isRunning={isRunning}
          speed={speed}
        />
      </div>
    </div>
  )
}
