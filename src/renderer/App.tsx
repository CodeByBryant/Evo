import React, { useState } from 'react'
import { SimulationCanvas } from './components/SimulationCanvas'
import { ControlPanel } from './components/ControlPanel'
import { StatsDisplay } from './components/StatsDisplay'
import { ConfigPanel } from './components/ConfigPanel'
import type { SimulationConfig, SimulationStats } from './types/simulation'
import AgentConfigData from './core/utilities/AgentConfig.json'

export const App: React.FC = () => {
  const [config, setConfig] = useState<SimulationConfig>(AgentConfigData as SimulationConfig)
  const [isRunning, setIsRunning] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [stats, setStats] = useState<SimulationStats>({
    agentCount: config.AgentCount,
    foodCount: config.FoodSettings.SpawnCount,
    fps: 60,
    running: true
  })
  const [resetKey, setResetKey] = useState(0)

  const handleToggleRunning = () => {
    setIsRunning(!isRunning)
  }

  const handleReset = () => {
    setResetKey(prev => prev + 1)
    setIsRunning(true)
  }

  const handleConfigChange = (newConfig: SimulationConfig) => {
    setConfig(newConfig)
    setResetKey(prev => prev + 1)
  }

  const handleStatsUpdate = (newStats: SimulationStats) => {
    setStats(newStats)
  }

  return (
    <div className="container-fluid min-vh-100 bg-dark text-white p-4">
      <div className="mb-4">
        <h1 className="display-4 text-center mb-2">
          <i className="bi bi-grid-3x3-gap me-3"></i>
          EvoSquares
        </h1>
        <p className="text-center text-muted">
          Neural Network Evolution Simulation
        </p>
      </div>

      <div className="row g-4">
        <div className="col-lg-9">
          <div className="card bg-black shadow-lg" style={{ height: '600px' }}>
            <div className="card-body p-0">
              <SimulationCanvas
                key={resetKey}
                config={config}
                onStatsUpdate={handleStatsUpdate}
                isRunning={isRunning}
                speed={speed}
              />
            </div>
          </div>
        </div>

        <div className="col-lg-3">
          <div className="d-flex flex-column gap-3">
            <ControlPanel
              isRunning={isRunning}
              speed={speed}
              onToggleRunning={handleToggleRunning}
              onSpeedChange={setSpeed}
              onReset={handleReset}
            />

            <StatsDisplay stats={stats} />

            <ConfigPanel
              config={config}
              onConfigChange={handleConfigChange}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 text-center text-muted">
        <small>
          Press <kbd>Start/Pause</kbd> to control • Adjust sliders to tune parameters • Reset to restart
        </small>
      </div>
    </div>
  )
}
