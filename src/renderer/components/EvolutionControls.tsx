import React from 'react'
import { EvolutionConfig } from '../core/EvolutionManager'

interface EvolutionControlsProps {
  config: EvolutionConfig
  onChange: (config: EvolutionConfig) => void
}

export const EvolutionControls: React.FC<EvolutionControlsProps> = ({ config, onChange }) => {
  const updateConfig = (updates: Partial<EvolutionConfig>) => {
    onChange({ ...config, ...updates })
  }

  return (
    <div className="evolution-controls">
      <h4>Evolution Settings</h4>
      
      <div className="control-row">
        <label>
          <span>Generation Time (steps)</span>
          <span className="value">{config.generationTime}</span>
        </label>
        <input
          type="range"
          min="300"
          max="3000"
          step="100"
          value={config.generationTime}
          onChange={(e) => updateConfig({ generationTime: parseInt(e.target.value) })}
        />
      </div>

      <div className="control-row">
        <label>
          <span>Selection Rate</span>
          <span className="value">{(config.selectionRate * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0.1"
          max="0.8"
          step="0.05"
          value={config.selectionRate}
          onChange={(e) => updateConfig({ selectionRate: parseFloat(e.target.value) })}
        />
      </div>

      <div className="control-row">
        <label>
          <span>Mutation Rate</span>
          <span className="value">{(config.mutationRate * 100).toFixed(1)}%</span>
        </label>
        <input
          type="range"
          min="0.01"
          max="0.3"
          step="0.01"
          value={config.mutationRate}
          onChange={(e) => updateConfig({ mutationRate: parseFloat(e.target.value) })}
        />
      </div>

      <div className="control-row">
        <label>
          <span>Population Size</span>
          <span className="value">{config.populationSize}</span>
        </label>
        <input
          type="range"
          min="10"
          max="100"
          step="5"
          value={config.populationSize}
          onChange={(e) => updateConfig({ populationSize: parseInt(e.target.value) })}
        />
      </div>

      <div className="control-row">
        <label>
          <span>Reproduction Threshold</span>
          <span className="value">{config.reproductionThreshold}</span>
        </label>
        <input
          type="range"
          min="50"
          max="95"
          step="5"
          value={config.reproductionThreshold}
          onChange={(e) => updateConfig({ reproductionThreshold: parseInt(e.target.value) })}
        />
      </div>

      <div className="control-row">
        <label>
          <span>Max Age</span>
          <span className="value">{config.maxAge}</span>
        </label>
        <input
          type="range"
          min="200"
          max="1000"
          step="50"
          value={config.maxAge}
          onChange={(e) => updateConfig({ maxAge: parseInt(e.target.value) })}
        />
      </div>

      <div className="help-text">
        <p><strong>Generation Time:</strong> Steps before natural selection</p>
        <p><strong>Selection Rate:</strong> Top % of agents that survive</p>
        <p><strong>Mutation Rate:</strong> Chance of genetic changes</p>
        <p><strong>Reproduction Threshold:</strong> Energy needed to reproduce</p>
        <p><strong>Max Age:</strong> Maximum lifespan in steps</p>
      </div>
    </div>
  )
}
