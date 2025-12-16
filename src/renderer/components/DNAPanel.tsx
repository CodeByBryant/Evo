import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Agent } from '../core/Agent'
import { FamilyTreePanel } from './FamilyTreePanel'

interface InfoIconProps {
  content: string
}

const InfoIcon: React.FC<InfoIconProps> = ({ content }) => {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <span
      className="info-icon"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(!showTooltip)}
      style={{
        marginLeft: '8px',
        cursor: 'help',
        position: 'relative',
        display: 'inline-block'
      }}
    >
      <i className="bi bi-info-circle" style={{ fontSize: '0.9rem', color: '#8888ff' }}></i>
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            left: '0',
            top: '20px',
            backgroundColor: '#1a1a2e',
            border: '1px solid #3a3a5e',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '0.85rem',
            color: '#ccc',
            maxWidth: '250px',
            width: 'max-content',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            lineHeight: '1.4'
          }}
        >
          {content}
        </div>
      )}
    </span>
  )
}

interface LifeStageBarProps {
  agent: Agent
}

const LifeStageBar: React.FC<LifeStageBarProps> = ({ agent }) => {
  const ageProgress = agent.age / Agent.maxAge

  const segments = [
    { name: 'Embryo', start: 0.0, end: 0.02, color: '#9b87f5' },
    { name: 'Child', start: 0.02, end: 0.08, color: '#4488ff' },
    { name: 'Adolescent', start: 0.08, end: 0.15, color: '#00bfff' },
    { name: 'Adult', start: 0.15, end: 0.85, color: '#00ff88' },
    { name: 'Old', start: 0.85, end: 1.0, color: '#ff8800' }
  ]

  return (
    <div
      style={{
        width: '100%',
        marginTop: '0.5rem'
      }}
    >
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '24px',
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid #3a3a5e',
          backgroundColor: '#0a0a0a'
        }}
      >
        {segments.map((segment, index) => {
          const segmentWidth = (segment.end - segment.start) * 100
          const isActive = ageProgress >= segment.start && ageProgress < segment.end
          const isCompleted = ageProgress >= segment.end

          return (
            <div
              key={index}
              style={{
                flex: `0 0 ${segmentWidth}%`,
                backgroundColor: isCompleted || isActive ? segment.color : '#1a1a1a',
                opacity: isCompleted || isActive ? 1 : 0.3,
                position: 'relative',
                borderRight: index < segments.length - 1 ? '1px solid #0a0a0a' : 'none',
                transition: 'all 0.3s ease',
                boxShadow: isActive ? `inset 0 0 12px ${segment.color}80` : 'none'
              }}
              title={`${segment.name}: ${(segment.start * 100).toFixed(0)}%-${(segment.end * 100).toFixed(0)}%`}
            >
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${((ageProgress - segment.start) / (segment.end - segment.start)) * 100}%`,
                    backgroundColor: segment.color,
                    filter: 'brightness(1.3)',
                    boxShadow: `0 0 8px ${segment.color}`
                  }}
                />
              )}
            </div>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '6px',
          fontSize: '0.75rem',
          color: '#888'
        }}
      >
        {segments.map((segment, index) => {
          const isActive = ageProgress >= segment.start && ageProgress < segment.end
          return (
            <span
              key={index}
              style={{
                flex: `0 0 ${(segment.end - segment.start) * 100}%`,
                textAlign: 'center',
                color: isActive ? segment.color : '#666',
                fontWeight: isActive ? 'bold' : 'normal',
                fontSize: isActive ? '0.8rem' : '0.75rem'
              }}
            >
              {segment.name}
            </span>
          )
        })}
      </div>
    </div>
  )
}

type PanelSizeMode = 'normal' | 'expanded' | 'maximized'

interface PanelSize {
  width: number
  height: number
}

const PANEL_SIZES: Record<PanelSizeMode, PanelSize> = {
  normal: { width: 400, height: 550 },
  expanded: { width: 600, height: 700 },
  maximized: { width: 0, height: 0 }
}

interface DNAPanelProps {
  selectedAgent: Agent | null
  onClose: () => void
  allAgents?: Agent[]
  agentHistory?: Map<string, Agent>
  onAgentSelect?: (agent: Agent | null) => void
  screenPosition?: { x: number; y: number } | null
  resetKey?: number
}

export const DNAPanel: React.FC<DNAPanelProps> = ({
  selectedAgent,
  onClose,
  allAgents = [],
  agentHistory = new Map(),
  onAgentSelect,
  screenPosition,
  resetKey
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const networkCanvasRef = useRef<HTMLCanvasElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const [activeTab, setActiveTab] = useState<'genome' | 'genealogy' | 'network'>('genome')
  const [position, setPosition] = useState({ x: window.innerWidth - 520, y: 80 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [sizeMode, setSizeMode] = useState<PanelSizeMode>('normal')
  const [customSize, setCustomSize] = useState<PanelSize | null>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })

  const getCurrentSize = useCallback((): PanelSize => {
    if (sizeMode === 'maximized') {
      return {
        width: window.innerWidth * 0.9,
        height: window.innerHeight * 0.9
      }
    }
    if (customSize && sizeMode === 'normal') {
      return customSize
    }
    return PANEL_SIZES[sizeMode]
  }, [sizeMode, customSize])

  const cycleSizeMode = useCallback(() => {
    setSizeMode((prev) => {
      if (prev === 'normal') return 'expanded'
      if (prev === 'expanded') return 'maximized'
      return 'normal'
    })
    setCustomSize(null)
  }, [])

  const toggleMaximize = useCallback(() => {
    setSizeMode((prev) => (prev === 'maximized' ? 'normal' : 'maximized'))
  }, [])

  useEffect(() => {
    if (selectedAgent) {
      const container = document.querySelector('.canvas-container')
      if (!container) return

      const rect = container.getBoundingClientRect()
      const size = getCurrentSize()

      if (sizeMode === 'maximized') {
        const x = rect.left + (rect.width - size.width) / 2
        const y = rect.top + (rect.height - size.height) / 2
        setPosition({ x, y })
      } else {
        const x = rect.left + (rect.width - size.width) / 2
        const y = rect.top + (rect.height - size.height) / 2 + 100
        setPosition({ x, y })
      }
    }
  }, [selectedAgent, sizeMode])

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (
      (e.target as HTMLElement).closest('.dna-panel-header') &&
      !(e.target as HTMLElement).closest('button')
    ) {
      setIsDragging(true)
      const clientX = 'clientX' in e ? e.clientX : e.touches?.[0]?.clientX || 0
      const clientY = 'clientY' in e ? e.clientY : e.touches?.[0]?.clientY || 0
      setDragOffset({
        x: clientX - position.x,
        y: clientY - position.y
      })
    }
  }

  const handleDragMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return
      const clientX = 'clientX' in e ? e.clientX : e.touches?.[0]?.clientX || 0
      const clientY = 'clientY' in e ? e.clientY : e.touches?.[0]?.clientY || 0
      setPosition({
        x: clientX - dragOffset.x,
        y: clientY - dragOffset.y
      })
    },
    [isDragging, dragOffset]
  )

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    const size = getCurrentSize()
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    })
  }

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return
      const deltaX = e.clientX - resizeStart.x
      const deltaY = e.clientY - resizeStart.y

      const newWidth = Math.max(350, Math.min(window.innerWidth * 0.95, resizeStart.width + deltaX))
      const newHeight = Math.max(
        400,
        Math.min(window.innerHeight * 0.95, resizeStart.height + deltaY)
      )

      setCustomSize({ width: newWidth, height: newHeight })
      setSizeMode('normal')
    },
    [isResizing, resizeStart]
  )

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove)
      window.addEventListener('touchmove', handleDragMove)
      window.addEventListener('mouseup', handleDragEnd)
      window.addEventListener('touchend', handleDragEnd)
      return () => {
        window.removeEventListener('mousemove', handleDragMove)
        window.removeEventListener('touchmove', handleDragMove)
        window.removeEventListener('mouseup', handleDragEnd)
        window.removeEventListener('touchend', handleDragEnd)
      }
    }
  }, [isDragging, handleDragMove, handleDragEnd])

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove)
      window.addEventListener('mouseup', handleResizeEnd)
      return () => {
        window.removeEventListener('mousemove', handleResizeMove)
        window.removeEventListener('mouseup', handleResizeEnd)
      }
    }
  }, [isResizing, handleResizeMove, handleResizeEnd])

  useEffect(() => {
    if (!selectedAgent || !canvasRef.current || activeTab !== 'genome') return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    let animationFrameId: number

    const drawDoubleHelix = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const centerX = canvas.width / 2
      const amplitude = 35
      const wavelength = 40
      const offset = (Date.now() / 80) % wavelength

      const genome = selectedAgent.NeuralNetwork.getGenomeData()
      const genomeLength = genome.length

      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
      gradient.addColorStop(0, '#0a0a0a')
      gradient.addColorStop(1, '#050510')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (let y = 0; y < canvas.height; y += 1.5) {
        const t = (y + offset) / wavelength
        const x1 = centerX + amplitude * Math.sin(t * Math.PI * 2)
        const x2 = centerX - amplitude * Math.sin(t * Math.PI * 2)

        const genomeIndex = Math.floor((y / canvas.height) * genomeLength) % genomeLength
        const value = genome[genomeIndex]
        const hue = ((value + 1) / 2) * 360

        ctx.shadowBlur = 8
        ctx.shadowColor = `hsla(${hue}, 80%, 60%, 0.5)`

        ctx.fillStyle = `hsla(${hue}, 80%, 65%, 0.9)`
        ctx.beginPath()
        ctx.arc(x1, y, 3.5, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = `hsla(${(hue + 180) % 360}, 80%, 65%, 0.9)`
        ctx.beginPath()
        ctx.arc(x2, y, 3.5, 0, Math.PI * 2)
        ctx.fill()

        ctx.shadowBlur = 0

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

      animationFrameId = requestAnimationFrame(drawDoubleHelix)
    }

    drawDoubleHelix()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [selectedAgent, activeTab])

  if (!selectedAgent) {
    return null
  }

  const currentSize = getCurrentSize()
  const isMaximized = sizeMode === 'maximized'

  return (
    <div
      ref={panelRef}
      className={`dna-panel ${isMaximized ? 'maximized' : ''}`}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${currentSize.width}px`,
        height: `${currentSize.height}px`,
        cursor: isDragging ? 'grabbing' : 'default',
        userSelect: isDragging || isResizing ? 'none' : 'auto',
        touchAction: 'none',
        zIndex: isDragging ? 10001 : 1000,
        display: 'flex',
        flexDirection: 'column',
        transition: isResizing || isDragging ? 'none' : 'width 0.2s ease, height 0.2s ease'
      }}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
    >
      <div className="dna-panel-header" style={{ cursor: 'grab', flexShrink: 0 }}>
        <h3>Agent Inspector</h3>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button
            className="btn-header-action"
            onClick={cycleSizeMode}
            title={`Current: ${sizeMode} - Click to cycle sizes`}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              transition: 'all 0.2s'
            }}
          >
            <i
              className={`bi ${sizeMode === 'normal' ? 'bi-arrows-angle-expand' : sizeMode === 'expanded' ? 'bi-arrows-fullscreen' : 'bi-arrows-angle-contract'}`}
            ></i>
            <span style={{ marginLeft: '4px', fontSize: '0.7rem' }}>
              {sizeMode === 'normal' ? 'S' : sizeMode === 'expanded' ? 'M' : 'L'}
            </span>
          </button>
          <button
            className="btn-header-action"
            onClick={toggleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
            style={{
              background: 'transparent',
              border: 'none',
              color: isMaximized ? '#00ff88' : '#888',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
          >
            <i className={`bi ${isMaximized ? 'bi-fullscreen-exit' : 'bi-fullscreen'}`}></i>
          </button>
          <button className="btn-close" onClick={onClose}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      </div>

      <div className="dna-tabs" style={{ flexShrink: 0 }}>
        <button
          className={`tab-button ${activeTab === 'genome' ? 'active' : ''}`}
          onClick={() => setActiveTab('genome')}
        >
          <i className="bi bi-dna"></i> Genome
        </button>
        <button
          className={`tab-button ${activeTab === 'genealogy' ? 'active' : ''}`}
          onClick={() => setActiveTab('genealogy')}
        >
          <i className="bi bi-diagram-3"></i> Genealogy
        </button>
        <button
          className={`tab-button ${activeTab === 'network' ? 'active' : ''}`}
          onClick={() => setActiveTab('network')}
        >
          <i className="bi bi-cpu"></i> Network
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'genome' && (
          <div
            style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
          >
            <canvas
              ref={canvasRef}
              className="dna-canvas"
              style={{
                height: isMaximized ? '200px' : '120px',
                flexShrink: 0,
                width: '100%'
              }}
            />
            <div className="dna-info" style={{ flex: 1, overflow: 'auto' }}>
              <h4>Genetic Information</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Species ID:</span>
                  <span className="value">{selectedAgent.species.substring(0, 8)}</span>
                </div>
                <div className="info-item">
                  <span className="label">Genome Length:</span>
                  <span className="value">
                    {selectedAgent.NeuralNetwork.getGenomeData().length}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Parents:</span>
                  <span className="value">{selectedAgent.parentIds?.length || 0}</span>
                </div>
              </div>

              <h4 style={{ marginTop: '1rem' }}>Performance Stats</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Fitness:</span>
                  <span className="value" style={{ color: '#00ff88' }}>
                    {selectedAgent.fitness.toFixed(1)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Energy:</span>
                  <span
                    className="value"
                    style={{
                      color:
                        selectedAgent.energy > 60
                          ? '#00ff88'
                          : selectedAgent.energy > 30
                            ? '#ff8800'
                            : '#ff4444'
                    }}
                  >
                    {selectedAgent.energy.toFixed(1)}%
                  </span>
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

              <h4 style={{ marginTop: '1rem' }}>
                Life Stage & Maturity
                <InfoIcon content="Agents progress through 5 life stages: Embryo (0-2%), Child (2-8%), Adolescent (8-15%), Adult (15-85%), Old (85-100%). Can reproduce during Adult stage." />
              </h4>
              <div style={{ marginBottom: '1rem' }}>
                <div className="info-grid" style={{ marginBottom: '0.75rem' }}>
                  <div className="info-item">
                    <span className="label">Current Stage:</span>
                    <span
                      className="value"
                      style={{
                        color:
                          selectedAgent.getLifeStage() === 'adult'
                            ? '#00ff88'
                            : selectedAgent.getLifeStage() === 'old'
                              ? '#ff8800'
                              : selectedAgent.getLifeStage() === 'adolescent'
                                ? '#00bfff'
                                : selectedAgent.getLifeStage() === 'child'
                                  ? '#4488ff'
                                  : '#9b87f5',
                        textTransform: 'capitalize'
                      }}
                    >
                      {selectedAgent.getLifeStage()}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="label">Can Reproduce:</span>
                    <span
                      className="value"
                      style={{
                        color: selectedAgent.canReproduce() ? '#00ff88' : '#ff4444'
                      }}
                    >
                      {selectedAgent.canReproduce() ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
                <LifeStageBar agent={selectedAgent} />
                <div
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '0.85rem',
                    color: '#8888ff'
                  }}
                >
                  Age: {selectedAgent.age}/{Agent.maxAge} (
                  {((selectedAgent.age / Agent.maxAge) * 100).toFixed(1)}%)
                </div>
              </div>

              <h4 style={{ marginTop: '1rem' }}>Physical Traits</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Position:</span>
                  <span className="value">
                    ({selectedAgent.position.x.toFixed(0)}, {selectedAgent.position.y.toFixed(0)})
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Rotation:</span>
                  <span className="value">
                    {((selectedAgent.position.rotation * 180) / Math.PI).toFixed(0)}deg
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Size:</span>
                  <span className="value">
                    {selectedAgent.width}x{selectedAgent.height}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Body Shape:</span>
                  <span className="value">
                    {(() => {
                      const sides = Math.round(selectedAgent.geneticTraits.bodyShape ?? 3)
                      const names: { [k: number]: string } = {
                        3: 'Triangle',
                        4: 'Square',
                        5: 'Pentagon',
                        6: 'Hexagon',
                        7: 'Heptagon',
                        8: 'Octagon'
                      }
                      return names[sides] || `${sides}-gon`
                    })()}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Color Hue:</span>
                  <span
                    className="value"
                    style={{
                      backgroundColor: `hsl(${selectedAgent.geneticTraits.hue ?? 0}, 60%, 50%)`,
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}
                  >
                    {Math.round(selectedAgent.geneticTraits.hue ?? 0)}°
                  </span>
                </div>
              </div>

              <h4 style={{ marginTop: '1rem' }}>
                Genetic Traits
                <InfoIcon content="Inheritable traits that affect agent behavior and survival. Traits mutate slightly when agents reproduce, driving evolution." />
              </h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Size:</span>
                  <span className="value">{selectedAgent.geneticTraits.size.toFixed(1)}</span>
                </div>
                <div className="info-item">
                  <span className="label">Movement Speed:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.movementSpeed.toFixed(2)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Acceleration:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.acceleration.toFixed(2)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Turn Rate:</span>
                  <span className="value">{selectedAgent.geneticTraits.turnRate.toFixed(3)}</span>
                </div>
                <div className="info-item">
                  <span className="label">Drag:</span>
                  <span className="value">{selectedAgent.geneticTraits.drag.toFixed(2)}</span>
                </div>
                <div className="info-item">
                  <span className="label">Sensor Rays:</span>
                  <span className="value">
                    {Math.round(selectedAgent.geneticTraits.sensorRayCount)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Sensor Range:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.sensorRayLength.toFixed(0)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Sensor Precision:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.sensorPrecision.toFixed(2)}x
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Field of View:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.fieldOfView.toFixed(0)}deg
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Color Vision:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.colorVision ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>

              <h4 style={{ marginTop: '1rem' }}>
                Metabolic Traits
                <InfoIcon content="Energy efficiency affects how quickly energy depletes. Digestion rate controls how much energy is gained from food. Higher values are better." />
              </h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Energy Efficiency:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.energyEfficiency.toFixed(2)}x
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Digestion Rate:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.digestionRate.toFixed(2)}x
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Max Energy:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.maxEnergyCapacity.toFixed(0)}
                  </span>
                </div>
              </div>

              <h4 style={{ marginTop: '1rem' }}>
                Reproductive Traits
                <InfoIcon content="Mutation rate: chance of trait changes in offspring. Reproduction threshold: minimum energy to reproduce. Offspring count: babies per reproduction event." />
              </h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Mutation Rate:</span>
                  <span className="value">
                    {(selectedAgent.geneticTraits.mutationRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Reproduction Threshold:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.reproductionThreshold.toFixed(0)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Offspring Count:</span>
                  <span className="value">
                    {Math.round(selectedAgent.geneticTraits.offspringCount)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Learning Rate:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.learningRate.toFixed(2)}x
                  </span>
                </div>
              </div>

              <h4 style={{ marginTop: '1rem' }}>Behavioral Traits</h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Aggression:</span>
                  <span className="value">
                    {selectedAgent.geneticTraits.aggression.toFixed(2)}x
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Memory Neurons:</span>
                  <span className="value">
                    {Math.round(selectedAgent.geneticTraits.memoryNeurons)}
                  </span>
                </div>
              </div>

              <h4 style={{ marginTop: '1rem' }}>
                Neural Network
                <InfoIcon content="The brain of the agent. Input neurons receive sensor data, hidden layers process it, output neurons control movement. Weights and biases are learned through evolution." />
              </h4>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">Inputs:</span>
                  <span className="value">
                    {selectedAgent.Sensor.rayCount * 2 +
                      3 +
                      (selectedAgent.geneticTraits.colorVision
                        ? selectedAgent.Sensor.rayCount * 2
                        : 0) +
                      Math.round(selectedAgent.geneticTraits.memoryNeurons)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="label">Outputs:</span>
                  <span className="value">6 (Movement)</span>
                </div>
                <div className="info-item">
                  <span className="label">Sensors:</span>
                  <span className="value">{selectedAgent.Sensor.rayCount} rays</span>
                </div>
                <div className="info-item">
                  <span className="label">Total Weights:</span>
                  <span className="value">
                    {selectedAgent.NeuralNetwork.getGenomeData().length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'genealogy' && (
          <div style={{ height: '100%', overflow: 'hidden' }}>
            <FamilyTreePanel
              agents={allAgents}
              agentHistory={agentHistory}
              selectedAgent={selectedAgent}
              onAgentSelect={onAgentSelect}
              resetKey={resetKey}
            />
          </div>
        )}

        {activeTab === 'network' && (
          <div className="network-view" style={{ height: '100%', overflow: 'hidden' }}>
            <NetworkVisualizer agent={selectedAgent} canvasRef={networkCanvasRef} />
          </div>
        )}
      </div>

      {!isMaximized && (
        <div
          className="resize-handle"
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '20px',
            height: '20px',
            cursor: 'nwse-resize',
            background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.1) 50%)',
            borderBottomRightRadius: '8px'
          }}
        >
          <i
            className="bi bi-grip-horizontal"
            style={{
              position: 'absolute',
              right: '2px',
              bottom: '2px',
              fontSize: '10px',
              color: 'rgba(255,255,255,0.3)',
              transform: 'rotate(-45deg)'
            }}
          ></i>
        </div>
      )}
    </div>
  )
}

interface NetworkVisualizerProps {
  agent: Agent
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}

const NetworkVisualizer: React.FC<NetworkVisualizerProps> = ({ agent, canvasRef }) => {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, '#0a0a12')
    gradient.addColorStop(1, '#05050a')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const layers = [agent.Sensor.rayCount * 2 + 3, 16, 8, 6]

    const layerSpacing = canvas.width / (layers.length + 1)
    const nodeRadius = Math.min(8, canvas.height / 40)

    layers.forEach((nodeCount, layerIndex) => {
      const x = layerSpacing * (layerIndex + 1)
      const nodeSpacing = canvas.height / (nodeCount + 1)

      for (let i = 0; i < nodeCount; i++) {
        const y = nodeSpacing * (i + 1)

        if (layerIndex < layers.length - 1) {
          const nextLayerX = layerSpacing * (layerIndex + 2)
          const nextNodeCount = layers[layerIndex + 1]
          const nextNodeSpacing = canvas.height / (nextNodeCount + 1)

          for (let j = 0; j < nextNodeCount; j++) {
            const nextY = nextNodeSpacing * (j + 1)
            ctx.beginPath()
            ctx.moveTo(x + nodeRadius, y)
            ctx.lineTo(nextLayerX - nodeRadius, nextY)
            ctx.strokeStyle = 'rgba(100, 150, 255, 0.1)'
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }

        const nodeGradient = ctx.createRadialGradient(x, y, 0, x, y, nodeRadius)
        if (layerIndex === 0) {
          nodeGradient.addColorStop(0, '#00ff88')
          nodeGradient.addColorStop(1, '#00aa55')
        } else if (layerIndex === layers.length - 1) {
          nodeGradient.addColorStop(0, '#ff8800')
          nodeGradient.addColorStop(1, '#aa5500')
        } else {
          nodeGradient.addColorStop(0, '#4488ff')
          nodeGradient.addColorStop(1, '#2255aa')
        }

        ctx.beginPath()
        ctx.arc(x, y, nodeRadius, 0, Math.PI * 2)
        ctx.fillStyle = nodeGradient
        ctx.fill()
      }
    })

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.font = '11px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'

    const labels = ['Input', 'Hidden 1', 'Hidden 2', 'Output']
    labels.forEach((label, i) => {
      const x = layerSpacing * (i + 1)
      ctx.fillText(label, x, canvas.height - 10)
    })
  }, [agent, canvasRef])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '4px'
      }}
    />
  )
}
