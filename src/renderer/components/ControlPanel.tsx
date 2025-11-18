import React from 'react'

interface ControlPanelProps {
  isRunning: boolean
  speed: number
  onToggleRunning: () => void
  onSpeedChange: (speed: number) => void
  onReset: () => void
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isRunning,
  speed,
  onToggleRunning,
  onSpeedChange,
  onReset
}) => {
  return (
    <div className="card shadow-sm">
      <div className="card-header bg-primary text-white">
        <h5 className="mb-0">
          <i className="bi bi-controller me-2"></i>
          Simulation Controls
        </h5>
      </div>
      <div className="card-body">
        <div className="d-flex gap-2 mb-3">
          <button
            className={`btn ${isRunning ? 'btn-danger' : 'btn-success'} flex-grow-1`}
            onClick={onToggleRunning}
          >
            <i className={`bi bi-${isRunning ? 'pause' : 'play'}-fill me-2`}></i>
            {isRunning ? 'Pause' : 'Start'}
          </button>
          <button className="btn btn-warning" onClick={onReset}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            Reset
          </button>
        </div>

        <div className="mb-2">
          <label className="form-label d-flex justify-content-between">
            <span>Speed: {speed.toFixed(1)}x</span>
          </label>
          <input
            type="range"
            className="form-range"
            min="0.1"
            max="3"
            step="0.1"
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          />
          <div className="d-flex justify-content-between text-muted small">
            <span>0.1x</span>
            <span>3.0x</span>
          </div>
        </div>
      </div>
    </div>
  )
}
