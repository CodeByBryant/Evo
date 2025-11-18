import React, { useEffect, useRef } from 'react'
import { Agent } from '../core/Agent'

interface DNAPanelProps {
  selectedAgent: Agent | null
  onClose: () => void
}

export const DNAPanel: React.FC<DNAPanelProps> = ({ selectedAgent, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!selectedAgent || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const drawDoubleHelix = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      const centerX = canvas.width / 2
      const amplitude = 35
      const wavelength = 40
      const offset = (Date.now() / 80) % wavelength
      
      // Get genome data from neural network weights
      const genome = selectedAgent.NeuralNetwork.getGenomeData()
      const genomeLength = genome.length
      
      // Draw background with gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
      gradient.addColorStop(0, '#0a0a0a')
      gradient.addColorStop(1, '#050510')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // Draw helix strands with smoother animation
      for (let y = 0; y < canvas.height; y += 1.5) {
        const t = (y + offset) / wavelength
        const x1 = centerX + amplitude * Math.sin(t * Math.PI * 2)
        const x2 = centerX - amplitude * Math.sin(t * Math.PI * 2)
        
        // Color based on genome data with smoother transition
        const genomeIndex = Math.floor((y / canvas.height) * genomeLength) % genomeLength
        const value = genome[genomeIndex]
        const hue = ((value + 1) / 2) * 360
        
        // Add glow effect to strands
        ctx.shadowBlur = 8
        ctx.shadowColor = `hsla(${hue}, 80%, 60%, 0.5)`
        
        // Strand 1 - larger, smoother circles
        ctx.fillStyle = `hsla(${hue}, 80%, 65%, 0.9)`
        ctx.beginPath()
        ctx.arc(x1, y, 3.5, 0, Math.PI * 2)
        ctx.fill()
        
        // Strand 2 - complementary color
        ctx.fillStyle = `hsla(${(hue + 180) % 360}, 80%, 65%, 0.9)`
        ctx.beginPath()
        ctx.arc(x2, y, 3.5, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.shadowBlur = 0
        
        // Draw connecting lines with gradient
        if (Math.abs(Math.sin(t * Math.PI * 2)) < 0.15 && y % 20 === 0) {
          const lineGradient = ctx.createLinearGradient(x1, y, x2, y)
          lineGradient.addColorStop(0, `hsla(${hue}, 70%, 50%, 0.4)`)
          lineGradient.addColorStop(0.5, `hsla(${hue}, 70%, 60%, 0.6)`)
          lineGradient.addColorStop(1, `hsla(${(hue + 180) % 360}, 70%, 50%, 0.4)`)
          ctx.strokeStyle = lineGradient
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(x1, y)
          ctx.lineTo(x2, y)
          ctx.stroke()
        }
      }
      
      requestAnimationFrame(drawDoubleHelix)
    }
    
    drawDoubleHelix()
  }, [selectedAgent])

  if (!selectedAgent) {
    return null
  }

  return (
    <div className="dna-panel">
      <div className="dna-panel-header">
        <h3>DNA Visualization</h3>
        <button className="btn-close" onClick={onClose}>
          <i className="bi bi-x-lg"></i>
        </button>
      </div>
      <canvas ref={canvasRef} className="dna-canvas" />
      <div className="dna-info">
        <h4>🧬 Genetic Information</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Species ID:</span>
            <span className="value">{selectedAgent.species.substring(0, 8)}</span>
          </div>
          <div className="info-item">
            <span className="label">Genome Length:</span>
            <span className="value">{selectedAgent.NeuralNetwork.getGenomeData().length}</span>
          </div>
          <div className="info-item">
            <span className="label">Generation:</span>
            <span className="value">{selectedAgent.generation}</span>
          </div>
          <div className="info-item">
            <span className="label">Parents:</span>
            <span className="value">{selectedAgent.parentIds?.length || 0}</span>
          </div>
        </div>

        <h4 style={{ marginTop: '1rem' }}>📊 Performance Stats</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Fitness:</span>
            <span className="value" style={{ color: '#00ff88' }}>{selectedAgent.fitness.toFixed(1)}</span>
          </div>
          <div className="info-item">
            <span className="label">Energy:</span>
            <span className="value" style={{ color: selectedAgent.energy > 60 ? '#00ff88' : selectedAgent.energy > 30 ? '#ff8800' : '#ff4444' }}>{selectedAgent.energy.toFixed(1)}%</span>
          </div>
          <div className="info-item">
            <span className="label">Age:</span>
            <span className="value">{selectedAgent.age}</span>
          </div>
          <div className="info-item">
            <span className="label">ID:</span>
            <span className="value">{selectedAgent.id.substring(0, 8)}</span>
          </div>
        </div>

        <h4 style={{ marginTop: '1rem' }}>🎯 Physical Traits</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Position:</span>
            <span className="value">({selectedAgent.position.x.toFixed(0)}, {selectedAgent.position.y.toFixed(0)})</span>
          </div>
          <div className="info-item">
            <span className="label">Rotation:</span>
            <span className="value">{(selectedAgent.position.rotation * 180 / Math.PI).toFixed(0)}°</span>
          </div>
          <div className="info-item">
            <span className="label">Size:</span>
            <span className="value">{selectedAgent.width}×{selectedAgent.height}</span>
          </div>
          <div className="info-item">
            <span className="label">Color Hue:</span>
            <span className="value">{(parseInt(selectedAgent.species.substring(0, 6), 36) % 360).toFixed(0)}°</span>
          </div>
        </div>

        <h4 style={{ marginTop: '1rem' }}>🧠 Neural Network</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Inputs:</span>
            <span className="value">{selectedAgent.Sensor.rayCount * 2 + 3}</span>
          </div>
          <div className="info-item">
            <span className="label">Outputs:</span>
            <span className="value">4 (Movement)</span>
          </div>
          <div className="info-item">
            <span className="label">Sensors:</span>
            <span className="value">{selectedAgent.Sensor.rayCount} rays</span>
          </div>
          <div className="info-item">
            <span className="label">Total Weights:</span>
            <span className="value">{selectedAgent.NeuralNetwork.getGenomeData().length}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
