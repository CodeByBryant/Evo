import React, { useState, useCallback } from 'react'
import type { SimulationConfig, SimulationStats } from '../types/simulation'
import { BRANDING } from '../constants/branding'

interface SidebarProps {
  config: SimulationConfig
  stats: SimulationStats
  isRunning: boolean
  speed: number
  onToggleRunning: () => void
  onSpeedChange: (speed: number) => void
  onReset: () => void
  onConfigChange: (config: SimulationConfig) => void
  children?: React.ReactNode
}

export const Sidebar: React.FC<SidebarProps> = ({
  config,
  stats,
  isRunning,
  speed,
  onToggleRunning,
  onSpeedChange,
  onReset,
  onConfigChange,
  children
}) => {
  const [configExpanded, setConfigExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const updateConfig = useCallback(
    (updates: Partial<SimulationConfig>) => {
      onConfigChange({ ...config, ...updates })
    },
    [config, onConfigChange]
  )

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>
        <i className={`bi bi-chevron-${collapsed ? 'right' : 'left'}`}></i>
      </button>

      {!collapsed && (
        <>
          <div className="brand">
            <h1>{BRANDING.APP_NAME}</h1>
          </div>

          <div className="sidebar-section">
            <h3 className="section-title">Controls</h3>
            <div className="controls">
              <button className="btn-control" onClick={onToggleRunning}>
                {isRunning ? 'pause' : 'start'}
              </button>
              <button className="btn-control" onClick={onReset}>
                reset
              </button>
            </div>

            <div className="control-slider">
              <label>
                <span>Speed</span>
                <span className="value">{speed.toFixed(1)}x</span>
              </label>
              <input
                type="range"
                min="0.1"
                max="25"
                step="0.1"
                value={speed}
                onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
              />
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="section-title">Stats</h3>
            <div className="stats-grid">
              <div className="stat">
                <span className="stat-label">Agents</span>
                <span className="stat-value">{stats.agentCount}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Food</span>
                <span className="stat-value">{stats.foodCount}</span>
              </div>
              <div className="stat">
                <span className="stat-label">FPS</span>
                <span className="stat-value">{stats.fps}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Status</span>
                <span className={`stat-badge ${isRunning ? 'active' : 'paused'}`}>
                  {isRunning ? 'active' : 'paused'}
                </span>
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-header" onClick={() => setConfigExpanded(!configExpanded)}>
              <h3 className="section-title">Settings</h3>
              <i className={`bi bi-chevron-${configExpanded ? 'up' : 'down'}`}></i>
            </div>
          </div>

          {children}

          <div className="sidebar-footer">v{BRANDING.VERSION}</div>
        </>
      )}

      {collapsed && (
        <div className="sidebar-icons">
          <button onClick={onToggleRunning} title={isRunning ? 'Pause' : 'Start'}>
            <i className={`bi bi-${isRunning ? 'pause' : 'play'}-fill`}></i>
          </button>
          <button onClick={onReset} title="Reset">
            <i className="bi bi-arrow-clockwise"></i>
          </button>
          <div className="icon-stat" title="Agents">
            <i className="bi bi-cpu"></i>
            <span>{stats.agentCount}</span>
          </div>
          <div className="icon-stat" title="FPS">
            <i className="bi bi-speedometer2"></i>
            <span>{stats.fps}</span>
          </div>
        </div>
      )}
    </div>
  )
}
