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
      const amplitude = 40
      const wavelength = 30
      const offset = (Date.now() / 50) % wavelength
      
      // Get genome data from neural network weights
      const genome = selectedAgent.NeuralNetwork.getGenomeData()
      const genomeLength = genome.length
      
      // Draw background
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      
      // Draw helix strands
      for (let y = 0; y < canvas.height; y += 2) {
        const t = (y + offset) / wavelength
        const x1 = centerX + amplitude * Math.sin(t * Math.PI * 2)
        const x2 = centerX - amplitude * Math.sin(t * Math.PI * 2)
        
        // Color based on genome data
        const genomeIndex = Math.floor((y / canvas.height) * genomeLength) % genomeLength
        const value = genome[genomeIndex]
        const hue = ((value + 1) / 2) * 360
        
        // Strand 1
        ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.8)`
        ctx.beginPath()
        ctx.arc(x1, y, 3, 0, Math.PI * 2)
        ctx.fill()
        
        // Strand 2
        ctx.fillStyle = `hsla(${(hue + 180) % 360}, 70%, 60%, 0.8)`
        ctx.beginPath()
        ctx.arc(x2, y, 3, 0, Math.PI * 2)
        ctx.fill()
        
        // Draw connecting lines at intervals
        if (Math.floor(t) % 3 === 0 && y % 15 === 0) {
          ctx.strokeStyle = `hsla(${hue}, 50%, 50%, 0.3)`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(x1, y)
          ctx.lineTo(x2, y)
          ctx.stroke()
        }
      }
      
      // Draw genome info
      ctx.fillStyle = '#00ff88'
      ctx.font = '12px monospace'
      ctx.fillText(`Genome Length: ${genomeLength}`, 10, 20)
      ctx.fillText(`Species: ${selectedAgent.species}`, 10, 40)
      ctx.fillText(`Fitness: ${selectedAgent.fitness.toFixed(2)}`, 10, 60)
      ctx.fillText(`Energy: ${selectedAgent.energy.toFixed(1)}`, 10, 80)
      ctx.fillText(`Age: ${selectedAgent.age}`, 10, 100)
      
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
        <h4>Agent Information</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Position:</span>
            <span className="value">({selectedAgent.position.x.toFixed(0)}, {selectedAgent.position.y.toFixed(0)})</span>
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
      </div>
    </div>
  )
}
