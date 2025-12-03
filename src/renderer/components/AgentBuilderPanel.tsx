import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { GeneticTraits } from '../types/simulation'
import AgentConfigData from '../core/utilities/AgentConfig.json'

interface AgentBuilderPanelProps {
  isOpen: boolean
  onClose: () => void
  onSpawnAgent: (traits: GeneticTraits) => void
}

const SHAPE_NAMES: { [key: number]: string } = {
  3: 'Triangle',
  4: 'Square',
  5: 'Pentagon',
  6: 'Hexagon',
  7: 'Heptagon',
  8: 'Octagon'
}

export const AgentBuilderPanel: React.FC<AgentBuilderPanelProps> = ({
  isOpen,
  onClose,
  onSpawnAgent
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const config = (AgentConfigData as any).GeneticTraits
  
  const [traits, setTraits] = useState<GeneticTraits>({
    size: config.size.default,
    movementSpeed: config.movementSpeed.default,
    acceleration: config.acceleration.default,
    turnRate: config.turnRate.default,
    drag: config.drag.default,
    sensorRayCount: config.sensorRayCount.default,
    sensorRayLength: config.sensorRayLength.default,
    sensorPrecision: config.sensorPrecision.default,
    fieldOfView: config.fieldOfView.default,
    colorVision: false,
    energyEfficiency: config.energyEfficiency.default,
    digestionRate: config.digestionRate.default,
    maxEnergyCapacity: config.maxEnergyCapacity.default,
    mutationRate: config.mutationRate.default,
    reproductionThreshold: config.reproductionThreshold.default,
    offspringCount: config.offspringCount.default,
    learningRate: config.learningRate.default,
    memoryNeurons: config.memoryNeurons.default,
    aggression: config.aggression.default,
    hue: Math.floor(Math.random() * 360),
    bodyShape: config.bodyShape?.default ?? 3
  })

  const updateTrait = useCallback((key: keyof GeneticTraits, value: number | boolean) => {
    setTraits(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSpawn = useCallback(() => {
    onSpawnAgent(traits)
  }, [onSpawnAgent, traits])

  const applyPreset = useCallback((preset: 'fast' | 'tank' | 'scout' | 'hunter') => {
    const presets: { [key: string]: Partial<GeneticTraits> } = {
      fast: {
        size: 25,
        movementSpeed: 1.8,
        acceleration: 1.3,
        turnRate: 0.12,
        sensorRayCount: 5,
        bodyShape: 3,
        energyEfficiency: 0.8
      },
      tank: {
        size: 55,
        movementSpeed: 0.8,
        acceleration: 0.6,
        turnRate: 0.05,
        sensorRayCount: 8,
        bodyShape: 8,
        energyEfficiency: 1.3,
        maxEnergyCapacity: 140
      },
      scout: {
        size: 30,
        movementSpeed: 1.4,
        sensorRayCount: 10,
        sensorRayLength: 250,
        fieldOfView: 270,
        bodyShape: 6,
        energyEfficiency: 1.1
      },
      hunter: {
        size: 40,
        movementSpeed: 1.5,
        aggression: 1.8,
        sensorRayCount: 8,
        sensorRayLength: 200,
        bodyShape: 5,
        turnRate: 0.1
      }
    }
    setTraits(prev => ({ ...prev, ...presets[preset] }))
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !isOpen) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const width = canvas.width
    const height = canvas.height
    const centerX = width / 2
    const centerY = height / 2
    
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, width, height)
    
    const sides = Math.round(traits.bodyShape)
    const radius = traits.size * 0.9
    const hue = traits.hue
    
    ctx.save()
    ctx.translate(centerX, centerY)
    
    const rayCount = Math.round(traits.sensorRayCount)
    const fov = (traits.fieldOfView * Math.PI) / 180
    const rayLength = traits.sensorRayLength * 0.5
    
    ctx.strokeStyle = `hsla(${hue}, 70%, 60%, 0.3)`
    ctx.lineWidth = 1
    
    for (let i = 0; i < rayCount; i++) {
      const angle = -Math.PI / 2 + (i - (rayCount - 1) / 2) * (fov / Math.max(rayCount - 1, 1))
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(Math.cos(angle) * rayLength, Math.sin(angle) * rayLength)
      ctx.stroke()
    }
    
    ctx.beginPath()
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI / sides) - Math.PI / 2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      if (i === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.closePath()
    
    ctx.fillStyle = `hsl(${hue}, 60%, 50%)`
    ctx.fill()
    ctx.strokeStyle = `hsl(${hue}, 60%, 35%)`
    ctx.lineWidth = 2
    ctx.stroke()
    
    const eyeSize = radius * 0.15
    const eyeOffset = radius * 0.25
    const eyeY = -radius * 0.2
    
    ctx.fillStyle = '#0a0a0f'
    ctx.beginPath()
    ctx.arc(-eyeOffset, eyeY, eyeSize, 0, Math.PI * 2)
    ctx.arc(eyeOffset, eyeY, eyeSize, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.fillStyle = '#4ade80'
    ctx.beginPath()
    ctx.arc(-eyeOffset, eyeY, eyeSize * 0.5, 0, Math.PI * 2)
    ctx.arc(eyeOffset, eyeY, eyeSize * 0.5, 0, Math.PI * 2)
    ctx.fill()
    
    ctx.restore()
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = '11px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(SHAPE_NAMES[sides] || `${sides}-gon`, centerX, height - 10)
    
  }, [traits, isOpen])

  if (!isOpen) return null

  return (
    <div className="agent-builder-popup">
      <div className="agent-builder-header">
        <h3>Agent Builder</h3>
        <button className="close-btn" onClick={onClose}>
          <i className="bi bi-x-lg"></i>
        </button>
      </div>
      
      <div className="agent-builder-content">
        <canvas 
          ref={canvasRef} 
          width={160} 
          height={160} 
          className="agent-preview-canvas"
        />
        
        <div className="preset-buttons">
          <button className="preset-btn" onClick={() => applyPreset('fast')}>Fast</button>
          <button className="preset-btn" onClick={() => applyPreset('tank')}>Tank</button>
          <button className="preset-btn" onClick={() => applyPreset('scout')}>Scout</button>
          <button className="preset-btn" onClick={() => applyPreset('hunter')}>Hunter</button>
        </div>
        
        <div className="traits-grid">
          <div className="trait-slider">
            <label>
              <span>Shape</span>
              <span className="value">{SHAPE_NAMES[Math.round(traits.bodyShape)]}</span>
            </label>
            <input
              type="range"
              min={config.bodyShape?.min ?? 3}
              max={config.bodyShape?.max ?? 8}
              step="1"
              value={traits.bodyShape}
              onChange={(e) => updateTrait('bodyShape', parseInt(e.target.value))}
            />
          </div>
          
          <div className="trait-slider">
            <label>
              <span>Size</span>
              <span className="value">{traits.size.toFixed(0)}</span>
            </label>
            <input
              type="range"
              min={config.size.min}
              max={config.size.max}
              step="1"
              value={traits.size}
              onChange={(e) => updateTrait('size', parseFloat(e.target.value))}
            />
          </div>
          
          <div className="trait-slider">
            <label>
              <span>Speed</span>
              <span className="value">{traits.movementSpeed.toFixed(1)}</span>
            </label>
            <input
              type="range"
              min={config.movementSpeed.min}
              max={config.movementSpeed.max}
              step="0.1"
              value={traits.movementSpeed}
              onChange={(e) => updateTrait('movementSpeed', parseFloat(e.target.value))}
            />
          </div>
          
          <div className="trait-slider">
            <label>
              <span>Sensors</span>
              <span className="value">{Math.round(traits.sensorRayCount)}</span>
            </label>
            <input
              type="range"
              min={config.sensorRayCount.min}
              max={config.sensorRayCount.max}
              step="1"
              value={traits.sensorRayCount}
              onChange={(e) => updateTrait('sensorRayCount', parseInt(e.target.value))}
            />
          </div>
          
          <div className="trait-slider">
            <label>
              <span>Sensor Range</span>
              <span className="value">{traits.sensorRayLength.toFixed(0)}</span>
            </label>
            <input
              type="range"
              min={config.sensorRayLength.min}
              max={config.sensorRayLength.max}
              step="10"
              value={traits.sensorRayLength}
              onChange={(e) => updateTrait('sensorRayLength', parseFloat(e.target.value))}
            />
          </div>
          
          <div className="trait-slider">
            <label>
              <span>Field of View</span>
              <span className="value">{traits.fieldOfView.toFixed(0)}°</span>
            </label>
            <input
              type="range"
              min={config.fieldOfView.min}
              max={config.fieldOfView.max}
              step="10"
              value={traits.fieldOfView}
              onChange={(e) => updateTrait('fieldOfView', parseFloat(e.target.value))}
            />
          </div>
          
          <div className="trait-slider">
            <label>
              <span>Aggression</span>
              <span className="value">{traits.aggression.toFixed(1)}</span>
            </label>
            <input
              type="range"
              min={config.aggression.min}
              max={config.aggression.max}
              step="0.1"
              value={traits.aggression}
              onChange={(e) => updateTrait('aggression', parseFloat(e.target.value))}
            />
          </div>
          
          <div className="trait-slider">
            <label>
              <span>Color</span>
              <span className="value" style={{ 
                backgroundColor: `hsl(${traits.hue}, 60%, 50%)`,
                padding: '2px 8px',
                borderRadius: '4px',
                color: traits.hue > 50 && traits.hue < 200 ? '#000' : '#fff'
              }}>{traits.hue}°</span>
            </label>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={traits.hue}
              onChange={(e) => updateTrait('hue', parseFloat(e.target.value))}
            />
          </div>
        </div>
        
        <button className="spawn-btn" onClick={handleSpawn}>
          <i className="bi bi-plus-circle" style={{ marginRight: '6px' }}></i>
          Spawn Agent
        </button>
        
        <p className="spawn-hint">Click anywhere on the canvas to place your agent</p>
      </div>
    </div>
  )
}
