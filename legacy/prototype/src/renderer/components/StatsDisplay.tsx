import React from 'react'
import type { SimulationStats } from '../types/simulation'

interface StatsDisplayProps {
  stats: SimulationStats
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({ stats }) => {
  return (
    <div className="card shadow-sm">
      <div className="card-header">
        <h5 className="mb-0">
          <i className="bi bi-speedometer2 me-2"></i>
          Live Stats
        </h5>
      </div>
      <div className="card-body">
        <div className="row g-3">
          <div className="col-6">
            <div className="stat-box">
              <div className="stat-label">Agents</div>
              <div className="stat-value text-success">{stats.agentCount}</div>
            </div>
          </div>
          <div className="col-6">
            <div className="stat-box">
              <div className="stat-label">Food</div>
              <div className="stat-value text-warning">{stats.foodCount}</div>
            </div>
          </div>
          <div className="col-6">
            <div className="stat-box">
              <div className="stat-label">FPS</div>
              <div className="stat-value text-primary">{stats.fps}</div>
            </div>
          </div>
          <div className="col-6">
            <div className="stat-box">
              <div className="stat-label">Status</div>
              <div className="h5 mb-0 mt-2">
                <span className={`badge ${stats.running ? 'bg-success' : 'bg-secondary'}`}>
                  {stats.running ? 'Active' : 'Paused'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
