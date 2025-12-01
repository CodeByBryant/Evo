import React, { useState, useCallback } from 'react'
import type { SimulationConfig, SimulationStats } from '../types/simulation'
import { BRANDING } from '../constants/branding'
import { useFullscreen } from '../hooks/useFullscreen'

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
  const { isFullscreen, toggleFullscreen, isElectron } = useFullscreen()

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
              <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                <button 
                  className="btn-control" 
                  onClick={() => onSpeedChange(50)}
                  style={{ flex: 1, fontSize: '0.7rem' }}
                  title="50x Speed"
                >
                  50x
                </button>
                <button 
                  className="btn-control" 
                  onClick={() => onSpeedChange(100)}
                  style={{ flex: 1, fontSize: '0.7rem' }}
                  title="100x Speed"
                >
                  100x
                </button>
                <button 
                  className="btn-control" 
                  onClick={() => onSpeedChange(500)}
                  style={{ flex: 1, fontSize: '0.7rem' }}
                  title="500x Speed"
                >
                  500x
                </button>
              </div>
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

          <div className="sidebar-section">
            <h3 className="section-title">Display</h3>
            <div className="controls">
              <button 
                className={`btn-control fullscreen-btn ${isFullscreen ? 'active' : ''}`}
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                <i className={`bi ${isFullscreen ? 'bi-fullscreen-exit' : 'bi-fullscreen'}`}></i>
                <span style={{ marginLeft: '6px' }}>
                  {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                </span>
              </button>
            </div>
            {isElectron && (
              <div style={{ 
                fontSize: '0.7rem', 
                color: 'rgba(255,255,255,0.4)', 
                marginTop: '4px',
                textAlign: 'center'
              }}>
                Press F11 for quick toggle
              </div>
            )}
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
          <button 
            onClick={toggleFullscreen} 
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            className={isFullscreen ? 'active' : ''}
          >
            <i className={`bi ${isFullscreen ? 'bi-fullscreen-exit' : 'bi-fullscreen'}`}></i>
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
