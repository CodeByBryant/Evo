import React, { useState } from 'react'
import type { SimulationConfig } from '../types/simulation'

interface ConfigPanelProps {
  config: SimulationConfig
  onConfigChange: (config: SimulationConfig) => void
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onConfigChange }) => {
  const [collapsed, setCollapsed] = useState(true)

  const updateConfig = (updates: Partial<SimulationConfig>) => {
    onConfigChange({ ...config, ...updates })
  }

  return (
    <div className="card shadow-sm">
      <div
        className="card-header bg-secondary text-white d-flex justify-content-between align-items-center"
        style={{ cursor: 'pointer' }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <h5 className="mb-0">
          <i className="bi bi-gear me-2"></i>
          Configuration
        </h5>
        <i className={`bi bi-chevron-${collapsed ? 'down' : 'up'}`}></i>
      </div>
      {!collapsed && (
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label">Agent Count: {config.AgentCount}</label>
            <input
              type="range"
              className="form-range"
              min="1"
              max="50"
              value={config.AgentCount}
              onChange={(e) =>
                updateConfig({ AgentCount: parseInt(e.target.value) })
              }
            />
          </div>

          <div className="mb-3">
            <label className="form-label">
              Movement Speed: {config.MovementSpeed.toFixed(1)}
            </label>
            <input
              type="range"
              className="form-range"
              min="0.1"
              max="5"
              step="0.1"
              value={config.MovementSpeed}
              onChange={(e) =>
                updateConfig({ MovementSpeed: parseFloat(e.target.value) })
              }
            />
          </div>

          <div className="mb-3">
            <label className="form-label">
              Rotation Speed: {config.RotationSpeed.toFixed(2)}
            </label>
            <input
              type="range"
              className="form-range"
              min="0.01"
              max="0.5"
              step="0.01"
              value={config.RotationSpeed}
              onChange={(e) =>
                updateConfig({ RotationSpeed: parseFloat(e.target.value) })
              }
            />
          </div>

          <div className="mb-3">
            <label className="form-label">
              Sensor Rays: {config.Sensor.RayCount}
            </label>
            <input
              type="range"
              className="form-range"
              min="3"
              max="15"
              value={config.Sensor.RayCount}
              onChange={(e) =>
                updateConfig({
                  Sensor: { ...config.Sensor, RayCount: parseInt(e.target.value) }
                })
              }
            />
          </div>

          <div className="mb-3">
            <label className="form-label">
              Sensor Length: {config.Sensor.RayLength}
            </label>
            <input
              type="range"
              className="form-range"
              min="50"
              max="300"
              step="10"
              value={config.Sensor.RayLength}
              onChange={(e) =>
                updateConfig({
                  Sensor: { ...config.Sensor, RayLength: parseInt(e.target.value) }
                })
              }
            />
          </div>

          <div className="form-check form-switch mb-3">
            <input
              className="form-check-input"
              type="checkbox"
              checked={config.RenderSensor}
              onChange={(e) => updateConfig({ RenderSensor: e.target.checked })}
            />
            <label className="form-check-label">Show Sensors</label>
          </div>

          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              checked={config.EnableRotation}
              onChange={(e) => updateConfig({ EnableRotation: e.target.checked })}
            />
            <label className="form-check-label">Enable Rotation</label>
          </div>
        </div>
      )}
    </div>
  )
}
