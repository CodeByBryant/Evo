import React from 'react'
import type { SimulationStats } from '../types/simulation'

interface StatsDisplayProps {
  stats: SimulationStats
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({ stats }) => {
  return (
    <div className="card shadow-sm">
      <div className="card-header bg-info text-white">
        <h5 className="mb-0">
          <i className="bi bi-graph-up me-2"></i>
          Statistics
        </h5>
      </div>
      <div className="card-body">
        <div className="row g-3">
          <div className="col-6">
            <div className="border rounded p-3 text-center">
              <div className="text-muted small mb-1">Agents</div>
              <div className="h3 mb-0 text-success">{stats.agentCount}</div>
            </div>
          </div>
          <div className="col-6">
            <div className="border rounded p-3 text-center">
              <div className="text-muted small mb-1">Food</div>
              <div className="h3 mb-0 text-warning">{stats.foodCount}</div>
            </div>
          </div>
          <div className="col-6">
            <div className="border rounded p-3 text-center">
              <div className="text-muted small mb-1">FPS</div>
              <div className="h3 mb-0 text-primary">{stats.fps}</div>
            </div>
          </div>
          <div className="col-6">
            <div className="border rounded p-3 text-center">
              <div className="text-muted small mb-1">Status</div>
              <div className="h5 mb-0">
                <span
                  className={`badge ${stats.running ? 'bg-success' : 'bg-secondary'}`}
                >
                  {stats.running ? 'Running' : 'Paused'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
