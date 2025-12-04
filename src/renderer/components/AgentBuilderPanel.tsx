import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { GeneticTraits } from '../types/simulation'
import AgentConfigData from '../core/utilities/AgentConfig.json'

interface AgentBuilderPanelProps {
  isOpen: boolean
  onClose: () => void
  onSpawnAgent: (traits: GeneticTraits, multiPlace?: boolean, speciesId?: string) => void
}

const SHAPE_NAMES: { [key: number]: string } = {
  3: 'Triangle',
  4: 'Square',
  5: 'Pentagon',
  6: 'Hexagon',
  7: 'Heptagon',
  8: 'Octagon'
}

interface CollapsibleSectionProps {
  title: string
  icon: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, icon, isOpen, onToggle, children }) => {
  return (
    <div className="trait-section">
      <button className="section-header" onClick={onToggle}>
        <span className="section-title">
          <i className={`bi ${icon}`}></i>
          {title}
        </span>
        <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`}></i>
      </button>
      {isOpen && <div className="section-content">{children}</div>}
    </div>
  )
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

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    physical: true,
    movement: false,
    sensors: false,
    energy: false,
    reproduction: false,
    neural: false
  })

  const [multiPlace, setMultiPlace] = useState(false)
  const [spawnedSpeciesId, setSpawnedSpeciesId] = useState<string | null>(null)

  const toggleSection = useCallback((section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }))
  }, [])

  const updateTrait = useCallback((key: keyof GeneticTraits, value: number | boolean) => {
    setTraits(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSpawn = useCallback(() => {
    onSpawnAgent(traits, multiPlace, spawnedSpeciesId || undefined)
  }, [onSpawnAgent, traits, multiPlace, spawnedSpeciesId])

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

  const resetSpeciesId = useCallback(() => {
    setSpawnedSpeciesId(null)
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
    
    ctx.fillStyle = traits.colorVision ? '#ff44ff' : '#4ade80'
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

  useEffect(() => {
    if (!isOpen) {
      setSpawnedSpeciesId(null)
    }
  }, [isOpen])

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

        <div className="traits-container">
          <CollapsibleSection
            title="Physical"
            icon="bi-box"
            isOpen={openSections.physical}
            onToggle={() => toggleSection('physical')}
          >
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
          </CollapsibleSection>

          <CollapsibleSection
            title="Movement"
            icon="bi-arrows-move"
            isOpen={openSections.movement}
            onToggle={() => toggleSection('movement')}
          >
            <div className="trait-slider">
              <label>
                <span>Speed</span>
                <span className="value">{traits.movementSpeed.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={config.movementSpeed.min}
                max={config.movementSpeed.max}
                step="0.05"
                value={traits.movementSpeed}
                onChange={(e) => updateTrait('movementSpeed', parseFloat(e.target.value))}
              />
            </div>
            
            <div className="trait-slider">
              <label>
                <span>Acceleration</span>
                <span className="value">{traits.acceleration.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={config.acceleration.min}
                max={config.acceleration.max}
                step="0.05"
                value={traits.acceleration}
                onChange={(e) => updateTrait('acceleration', parseFloat(e.target.value))}
              />
            </div>
            
            <div className="trait-slider">
              <label>
                <span>Turn Rate</span>
                <span className="value">{traits.turnRate.toFixed(3)}</span>
              </label>
              <input
                type="range"
                min={config.turnRate.min}
                max={config.turnRate.max}
                step="0.005"
                value={traits.turnRate}
                onChange={(e) => updateTrait('turnRate', parseFloat(e.target.value))}
              />
            </div>
            
            <div className="trait-slider">
              <label>
                <span>Drag</span>
                <span className="value">{traits.drag.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={config.drag.min}
                max={config.drag.max}
                step="0.01"
                value={traits.drag}
                onChange={(e) => updateTrait('drag', parseFloat(e.target.value))}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Sensors"
            icon="bi-eye"
            isOpen={openSections.sensors}
            onToggle={() => toggleSection('sensors')}
          >
            <div className="trait-slider">
              <label>
                <span>Ray Count</span>
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
                <span>Ray Length</span>
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
                <span>Precision</span>
                <span className="value">{traits.sensorPrecision.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={config.sensorPrecision.min}
                max={config.sensorPrecision.max}
                step="0.05"
                value={traits.sensorPrecision}
                onChange={(e) => updateTrait('sensorPrecision', parseFloat(e.target.value))}
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
            
            <div className="trait-toggle">
              <label>
                <span>Color Vision</span>
                <span className="value">{traits.colorVision ? 'On' : 'Off'}</span>
              </label>
              <button
                className={`toggle-btn ${traits.colorVision ? 'active' : ''}`}
                onClick={() => updateTrait('colorVision', !traits.colorVision)}
              >
                <i className={`bi ${traits.colorVision ? 'bi-eye-fill' : 'bi-eye'}`}></i>
              </button>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Energy"
            icon="bi-lightning-charge"
            isOpen={openSections.energy}
            onToggle={() => toggleSection('energy')}
          >
            <div className="trait-slider">
              <label>
                <span>Efficiency</span>
                <span className="value">{traits.energyEfficiency.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={config.energyEfficiency.min}
                max={config.energyEfficiency.max}
                step="0.05"
                value={traits.energyEfficiency}
                onChange={(e) => updateTrait('energyEfficiency', parseFloat(e.target.value))}
              />
            </div>
            
            <div className="trait-slider">
              <label>
                <span>Digestion Rate</span>
                <span className="value">{traits.digestionRate.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={config.digestionRate.min}
                max={config.digestionRate.max}
                step="0.05"
                value={traits.digestionRate}
                onChange={(e) => updateTrait('digestionRate', parseFloat(e.target.value))}
              />
            </div>
            
            <div className="trait-slider">
              <label>
                <span>Max Capacity</span>
                <span className="value">{traits.maxEnergyCapacity.toFixed(0)}</span>
              </label>
              <input
                type="range"
                min={config.maxEnergyCapacity.min}
                max={config.maxEnergyCapacity.max}
                step="5"
                value={traits.maxEnergyCapacity}
                onChange={(e) => updateTrait('maxEnergyCapacity', parseFloat(e.target.value))}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Reproduction"
            icon="bi-heart"
            isOpen={openSections.reproduction}
            onToggle={() => toggleSection('reproduction')}
          >
            <div className="trait-slider">
              <label>
                <span>Mutation Rate</span>
                <span className="value">{(traits.mutationRate * 100).toFixed(0)}%</span>
              </label>
              <input
                type="range"
                min={config.mutationRate.min}
                max={config.mutationRate.max}
                step="0.01"
                value={traits.mutationRate}
                onChange={(e) => updateTrait('mutationRate', parseFloat(e.target.value))}
              />
            </div>
            
            <div className="trait-slider">
              <label>
                <span>Repro Threshold</span>
                <span className="value">{traits.reproductionThreshold.toFixed(0)}</span>
              </label>
              <input
                type="range"
                min={config.reproductionThreshold.min}
                max={config.reproductionThreshold.max}
                step="5"
                value={traits.reproductionThreshold}
                onChange={(e) => updateTrait('reproductionThreshold', parseFloat(e.target.value))}
              />
            </div>
            
            <div className="trait-slider">
              <label>
                <span>Offspring Count</span>
                <span className="value">{Math.round(traits.offspringCount)}</span>
              </label>
              <input
                type="range"
                min={config.offspringCount.min}
                max={config.offspringCount.max}
                step="1"
                value={traits.offspringCount}
                onChange={(e) => updateTrait('offspringCount', parseInt(e.target.value))}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Neural"
            icon="bi-cpu"
            isOpen={openSections.neural}
            onToggle={() => toggleSection('neural')}
          >
            <div className="trait-slider">
              <label>
                <span>Learning Rate</span>
                <span className="value">{traits.learningRate.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min={config.learningRate.min}
                max={config.learningRate.max}
                step="0.1"
                value={traits.learningRate}
                onChange={(e) => updateTrait('learningRate', parseFloat(e.target.value))}
              />
            </div>
            
            <div className="trait-slider">
              <label>
                <span>Memory Neurons</span>
                <span className="value">{Math.round(traits.memoryNeurons)}</span>
              </label>
              <input
                type="range"
                min={config.memoryNeurons.min}
                max={config.memoryNeurons.max}
                step="1"
                value={traits.memoryNeurons}
                onChange={(e) => updateTrait('memoryNeurons', parseInt(e.target.value))}
              />
            </div>
            
            <div className="trait-slider">
              <label>
                <span>Aggression</span>
                <span className="value">{traits.aggression.toFixed(2)}</span>
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
          </CollapsibleSection>
        </div>

        <div className="spawn-options">
          <div className="multi-place-toggle">
            <label>
              <span>Multi-place Mode</span>
              <span className="hint">{multiPlace ? 'Click multiple times to spawn' : 'Single spawn'}</span>
            </label>
            <button
              className={`toggle-btn ${multiPlace ? 'active' : ''}`}
              onClick={() => {
                setMultiPlace(!multiPlace)
                if (!multiPlace) {
                  setSpawnedSpeciesId(null)
                }
              }}
            >
              <i className={`bi ${multiPlace ? 'bi-collection-fill' : 'bi-collection'}`}></i>
            </button>
          </div>
          {multiPlace && spawnedSpeciesId && (
            <div className="species-info">
              <span>Species: {spawnedSpeciesId.substring(0, 8)}</span>
              <button className="reset-species-btn" onClick={resetSpeciesId} title="Reset species ID for next batch">
                <i className="bi bi-arrow-counterclockwise"></i>
              </button>
            </div>
          )}
        </div>
        
        <button className="spawn-btn" onClick={handleSpawn}>
          <i className="bi bi-plus-circle" style={{ marginRight: '6px' }}></i>
          {multiPlace ? 'Start Placing' : 'Spawn Agent'}
        </button>
        
        <p className="spawn-hint">
          {multiPlace 
            ? 'Click anywhere on the canvas to place agents. All will share the same species.' 
            : 'Click anywhere on the canvas to place your agent'}
        </p>
      </div>
    </div>
  )
}
