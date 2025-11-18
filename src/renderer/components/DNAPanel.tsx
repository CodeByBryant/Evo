import React, { useEffect, useRef, useState } from 'react'
import { Agent } from '../core/Agent'

interface DNAPanelProps {
  selectedAgent: Agent | null
  onClose: () => void
  allAgents?: Agent[]
  agentHistory?: Map<string, Agent>
}

export const DNAPanel: React.FC<DNAPanelProps> = ({ selectedAgent, onClose, allAgents = [], agentHistory = new Map() }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const networkCanvasRef = useRef<HTMLCanvasElement>(null)
  const [activeTab, setActiveTab] = useState<'genome' | 'genealogy' | 'network'>('genome')

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
        <h3>Agent Inspector</h3>
        <button className="btn-close" onClick={onClose}>
          <i className="bi bi-x-lg"></i>
        </button>
      </div>
      
      <div className="dna-tabs">
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

      {activeTab === 'genome' && (
        <>
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

        <h4 style={{ marginTop: '1rem' }}>🧬 Genetic Traits</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Size:</span>
            <span className="value">{selectedAgent.geneticTraits.size.toFixed(1)}</span>
          </div>
          <div className="info-item">
            <span className="label">Movement Speed:</span>
            <span className="value">{selectedAgent.geneticTraits.movementSpeed.toFixed(2)}</span>
          </div>
          <div className="info-item">
            <span className="label">Acceleration:</span>
            <span className="value">{selectedAgent.geneticTraits.acceleration.toFixed(2)}</span>
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
            <span className="value">{Math.round(selectedAgent.geneticTraits.sensorRayCount)}</span>
          </div>
          <div className="info-item">
            <span className="label">Sensor Range:</span>
            <span className="value">{selectedAgent.geneticTraits.sensorRayLength.toFixed(0)}</span>
          </div>
          <div className="info-item">
            <span className="label">Field of View:</span>
            <span className="value">{selectedAgent.geneticTraits.fieldOfView.toFixed(0)}°</span>
          </div>
          <div className="info-item">
            <span className="label">Color Vision:</span>
            <span className="value">{selectedAgent.geneticTraits.colorVision ? 'Yes' : 'No'}</span>
          </div>
        </div>

        <h4 style={{ marginTop: '1rem' }}>⚡ Metabolic Traits</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Energy Efficiency:</span>
            <span className="value">{selectedAgent.geneticTraits.energyEfficiency.toFixed(2)}x</span>
          </div>
          <div className="info-item">
            <span className="label">Digestion Rate:</span>
            <span className="value">{selectedAgent.geneticTraits.digestionRate.toFixed(2)}x</span>
          </div>
          <div className="info-item">
            <span className="label">Max Energy:</span>
            <span className="value">{selectedAgent.geneticTraits.maxEnergyCapacity.toFixed(0)}</span>
          </div>
        </div>

        <h4 style={{ marginTop: '1rem' }}>🔄 Reproductive Traits</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Mutation Rate:</span>
            <span className="value">{(selectedAgent.geneticTraits.mutationRate * 100).toFixed(1)}%</span>
          </div>
          <div className="info-item">
            <span className="label">Reproduction Threshold:</span>
            <span className="value">{selectedAgent.geneticTraits.reproductionThreshold.toFixed(0)}</span>
          </div>
          <div className="info-item">
            <span className="label">Offspring Count:</span>
            <span className="value">{Math.round(selectedAgent.geneticTraits.offspringCount)}</span>
          </div>
          <div className="info-item">
            <span className="label">Learning Rate:</span>
            <span className="value">{selectedAgent.geneticTraits.learningRate.toFixed(2)}x</span>
          </div>
        </div>

        <h4 style={{ marginTop: '1rem' }}>🧠 Neural Network</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Inputs:</span>
            <span className="value">{selectedAgent.Sensor.rayCount * 2 + 3 + (selectedAgent.geneticTraits.colorVision ? selectedAgent.Sensor.rayCount * 2 : 0)}</span>
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
            <span className="value">{selectedAgent.NeuralNetwork.getGenomeData().length}</span>
          </div>
        </div>
          </div>
        </>
      )}

      {activeTab === 'genealogy' && (
        <div className="genealogy-view">
          <GenealogyViewer agent={selectedAgent} allAgents={allAgents} agentHistory={agentHistory} />
        </div>
      )}

      {activeTab === 'network' && (
        <div className="network-view">
          <NetworkVisualizer agent={selectedAgent} canvasRef={networkCanvasRef} />
        </div>
      )}
    </div>
  )
}

interface GenealogyViewerProps {
  agent: Agent
  allAgents: Agent[]
  agentHistory: Map<string, Agent>
}

const GenealogyViewer: React.FC<GenealogyViewerProps> = ({ agent, allAgents, agentHistory }) => {
  // Create a combined map of current agents and historical agents
  const agentMap = new Map<string, Agent>(agentHistory)
  allAgents.forEach(a => agentMap.set(a.id, a))

  // Find parents (including extinct ones)
  const parentInfo = agent.parentIds.map(id => ({
    id,
    agent: agentMap.get(id)
  }))
  const parents = parentInfo.filter(p => p.agent).map(p => p.agent) as Agent[]
  const extinctParents = parentInfo.filter(p => !p.agent)
  
  // Find grandparents (including extinct ones)
  const grandparentInfo: Array<{ id: string; agent: Agent | undefined }> = []
  parents.forEach(parent => {
    parent.parentIds.forEach(id => {
      grandparentInfo.push({ id, agent: agentMap.get(id) })
    })
  })
  const grandparents = grandparentInfo.filter(gp => gp.agent).map(gp => gp.agent) as Agent[]
  const extinctGrandparents = grandparentInfo.filter(gp => !gp.agent)

  // Find great-grandparents (including extinct ones)
  const greatGrandparentInfo: Array<{ id: string; agent: Agent | undefined }> = []
  grandparents.forEach(gp => {
    gp.parentIds.forEach(id => {
      greatGrandparentInfo.push({ id, agent: agentMap.get(id) })
    })
  })
  const greatGrandparents = greatGrandparentInfo.filter(ggp => ggp.agent).map(ggp => ggp.agent) as Agent[]
  const extinctGreatGrandparents = greatGrandparentInfo.filter(ggp => !ggp.agent)

  // Count descendants
  const descendants = allAgents.filter(a => a.parentIds.includes(agent.id))

  const renderAgentCard = (a: Agent, relationship: string) => {
    const speciesHue = parseInt(a.species.substring(0, 6), 36) % 360
    return (
      <div key={a.id} className="ancestor-card" style={{ borderLeft: `4px solid hsl(${speciesHue}, 70%, 50%)` }}>
        <div className="ancestor-header">
          <span className="ancestor-relationship">{relationship}</span>
          <span className="ancestor-id">{a.id.substring(0, 8)}</span>
        </div>
        <div className="ancestor-stats">
          <div className="stat-item">
            <i className="bi bi-activity"></i>
            <span>Fitness: {a.fitness.toFixed(1)}</span>
          </div>
          <div className="stat-item">
            <i className="bi bi-hourglass-split"></i>
            <span>Gen: {a.generation}</span>
          </div>
          <div className="stat-item">
            <i className="bi bi-lightning-fill"></i>
            <span>Energy: {a.energy.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    )
  }

  const renderExtinctCard = (id: string, relationship: string) => {
    return (
      <div key={id} className="ancestor-card extinct" style={{ borderLeft: `4px solid #555` }}>
        <div className="ancestor-header">
          <span className="ancestor-relationship">{relationship}</span>
          <span className="ancestor-id">{id.substring(0, 8)}</span>
        </div>
        <div className="ancestor-stats">
          <div className="stat-item">
            <i className="bi bi-x-circle"></i>
            <span style={{ color: '#888' }}>Extinct - No longer in population</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="genealogy-container">
      <div className="genealogy-section">
        <h4><i className="bi bi-person-fill"></i> Current Agent</h4>
        <div className="current-agent-info">
          <div className="info-row">
            <span>ID:</span>
            <span className="value">{agent.id.substring(0, 12)}</span>
          </div>
          <div className="info-row">
            <span>Generation:</span>
            <span className="value">{agent.generation}</span>
          </div>
          <div className="info-row">
            <span>Fitness:</span>
            <span className="value fitness-value">{agent.fitness.toFixed(2)}</span>
          </div>
          <div className="info-row">
            <span>Species:</span>
            <span className="value">{agent.species.substring(0, 10)}</span>
          </div>
        </div>
      </div>

      {(parents.length > 0 || extinctParents.length > 0) && (
        <div className="genealogy-section">
          <h4><i className="bi bi-people-fill"></i> Parents ({parents.length + extinctParents.length})</h4>
          <div className="ancestor-grid">
            {parents.map((p, i) => renderAgentCard(p, `Parent ${i + 1}`))}
            {extinctParents.map((ep, i) => renderExtinctCard(ep.id, `Parent ${parents.length + i + 1} (Extinct)`))}
          </div>
        </div>
      )}

      {(grandparents.length > 0 || extinctGrandparents.length > 0) && (
        <div className="genealogy-section">
          <h4><i className="bi bi-people"></i> Grandparents ({grandparents.length + extinctGrandparents.length})</h4>
          <div className="ancestor-grid">
            {grandparents.map((gp, i) => renderAgentCard(gp, `Grandparent ${i + 1}`))}
            {extinctGrandparents.map((egp, i) => renderExtinctCard(egp.id, `Grandparent ${grandparents.length + i + 1} (Extinct)`))}
          </div>
        </div>
      )}

      {(greatGrandparents.length > 0 || extinctGreatGrandparents.length > 0) && (
        <div className="genealogy-section">
          <h4><i className="bi bi-diagram-2"></i> Great-Grandparents ({greatGrandparents.length + extinctGreatGrandparents.length})</h4>
          <div className="ancestor-grid">
            {greatGrandparents.map((ggp, i) => renderAgentCard(ggp, `Great-GP ${i + 1}`))}
            {extinctGreatGrandparents.map((eggp, i) => renderExtinctCard(eggp.id, `Great-GP ${greatGrandparents.length + i + 1} (Extinct)`))}
          </div>
        </div>
      )}

      {descendants.length > 0 && (
        <div className="genealogy-section">
          <h4><i className="bi bi-arrow-down-circle"></i> Descendants ({descendants.length})</h4>
          <div className="ancestor-grid">
            {descendants.slice(0, 6).map((d, i) => renderAgentCard(d, `Child ${i + 1}`))}
            {descendants.length > 6 && (
              <div className="more-indicator">
                +{descendants.length - 6} more
              </div>
            )}
          </div>
        </div>
      )}

      {agent.parentIds.length === 0 && (
        <div className="no-ancestors">
          <i className="bi bi-exclamation-circle"></i>
          <p>This is a first-generation agent with no recorded ancestry.</p>
        </div>
      )}
      
      {agent.parentIds.length > 0 && parents.length === 0 && extinctParents.length === 0 && (
        <div className="no-ancestors">
          <i className="bi bi-info-circle"></i>
          <p>This agent has {agent.parentIds.length} parent(s), but they are no longer in the current population.</p>
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
  const [lastOutputs, setLastOutputs] = useState<number[]>([0, 0, 0, 0, 0, 0])

  useEffect(() => {
    if (!agent || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    const drawNetwork = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Background
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
      gradient.addColorStop(0, '#0a0a0a')
      gradient.addColorStop(1, '#050510')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Get neural network structure
      const levels = agent.NeuralNetwork.levels
      const layerCount = levels.length + 1
      const maxNeurons = Math.max(...levels.map(l => l.outputs.length))

      // Layout parameters
      const padding = 40
      const layerSpacing = (canvas.width - 2 * padding) / (layerCount - 1)
      const neuronRadius = 8

      // Calculate current outputs for real-time display
      const agentOffsets = agent.Sensor.agentOutput.map((e) => (e == null ? 0 : 1 - e.offset))
      const foodOffsets = agent.Sensor.foodOutput.map((e) => (e == null ? 0 : 1 - e.offset))
      const inputs = [
        agent.position.x / 1000,
        agent.position.y / 1000,
        agent.position.rotation / (Math.PI * 2)
      ].concat(agentOffsets).concat(foodOffsets)

      const outputs = agent.NeuralNetwork.feedForward(inputs)
      setLastOutputs(outputs)

      // Get activations for all layers
      const allActivations: number[][] = []
      allActivations.push(inputs)
      
      let currentActivations = inputs
      for (let i = 0; i < levels.length; i++) {
        const level = levels[i]
        const nextActivations: number[] = []
        
        for (let j = 0; j < level.outputs.length; j++) {
          let sum = level.biases[j]
          for (let k = 0; k < level.inputs.length; k++) {
            sum += currentActivations[k] * level.weights[k][j]
          }
          nextActivations.push(Math.tanh(sum))
        }
        
        allActivations.push(nextActivations)
        currentActivations = nextActivations
      }

      // Draw connections first (behind neurons)
      ctx.lineWidth = 1
      for (let l = 0; l < layerCount - 1; l++) {
        const x1 = padding + l * layerSpacing
        const x2 = padding + (l + 1) * layerSpacing
        const neurons1 = allActivations[l].length
        const neurons2 = allActivations[l + 1].length
        const spacing1 = (canvas.height - 2 * padding) / (neurons1 + 1)
        const spacing2 = (canvas.height - 2 * padding) / (neurons2 + 1)

        for (let i = 0; i < neurons1; i++) {
          for (let j = 0; j < neurons2; j++) {
            const y1 = padding + (i + 1) * spacing1
            const y2 = padding + (j + 1) * spacing2
            
            const weight = levels[l].weights[i][j]
            const intensity = Math.abs(weight)
            const alpha = Math.min(intensity * 0.3, 0.5)
            
            // Blend from white (near 0) to cyan (positive) or red (negative)
            const targetColor = weight > 0 ? [100, 200, 255] : [255, 80, 80]
            const r = Math.round(255 + (targetColor[0] - 255) * intensity)
            const g = Math.round(255 + (targetColor[1] - 255) * intensity)
            const b = Math.round(255 + (targetColor[2] - 255) * intensity)
            
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
            
            ctx.beginPath()
            ctx.moveTo(x1, y1)
            ctx.lineTo(x2, y2)
            ctx.stroke()
          }
        }
      }

      // Draw neurons
      for (let l = 0; l < allActivations.length; l++) {
        const x = padding + l * layerSpacing
        const neurons = allActivations[l].length
        const spacing = (canvas.height - 2 * padding) / (neurons + 1)

        for (let i = 0; i < neurons; i++) {
          const y = padding + (i + 1) * spacing
          const activation = allActivations[l][i]
          
          // Blend from white (near 0) to cyan (positive) or red (negative)
          const intensity = Math.abs(activation)
          const targetColor = activation > 0 ? [100, 200, 255] : [255, 80, 80]
          const r = Math.round(255 + (targetColor[0] - 255) * intensity)
          const g = Math.round(255 + (targetColor[1] - 255) * intensity)
          const b = Math.round(255 + (targetColor[2] - 255) * intensity)
          
          ctx.shadowBlur = 10 * intensity
          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${intensity * 0.8})`
          
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.4 + intensity * 0.6})`
          ctx.beginPath()
          ctx.arc(x, y, neuronRadius, 0, Math.PI * 2)
          ctx.fill()
          
          const strokeR = Math.round(255 + (targetColor[0] - 255) * intensity * 1.1)
          const strokeG = Math.round(255 + (targetColor[1] - 255) * intensity * 1.1)
          const strokeB = Math.round(255 + (targetColor[2] - 255) * intensity * 1.1)
          ctx.strokeStyle = `rgba(${strokeR}, ${strokeG}, ${strokeB}, 0.9)`
          ctx.lineWidth = 2
          ctx.stroke()
          
          ctx.shadowBlur = 0
        }
      }

      // Draw layer labels
      ctx.fillStyle = '#ffffff'
      ctx.font = '12px monospace'
      ctx.textAlign = 'center'
      
      const labels = ['Input', ...Array(layerCount - 2).fill(0).map((_, i) => `Hidden ${i + 1}`), 'Output']
      for (let l = 0; l < allActivations.length; l++) {
        const x = padding + l * layerSpacing
        ctx.fillText(labels[l], x, 20)
        ctx.fillText(`(${allActivations[l].length})`, x, 32)
      }

      requestAnimationFrame(drawNetwork)
    }

    drawNetwork()
  }, [agent, canvasRef])

  const outputLabels = ['Forward', 'Backward', 'Strafe L', 'Strafe R', 'Rotate CW', 'Rotate CCW']

  return (
    <div className="network-visualizer">
      <canvas ref={canvasRef} className="network-canvas" />
      <div className="network-info">
        <h4><i className="bi bi-cpu"></i> Neural Network Architecture</h4>
        <div className="info-grid">
          <div className="info-item">
            <span className="label">Input Neurons:</span>
            <span className="value">{agent.Sensor.rayCount * 2 + 3}</span>
          </div>
          <div className="info-item">
            <span className="label">Hidden Layers:</span>
            <span className="value">{agent.NeuralNetwork.levels.length - 1}</span>
          </div>
          <div className="info-item">
            <span className="label">Output Neurons:</span>
            <span className="value">6</span>
          </div>
          <div className="info-item">
            <span className="label">Total Parameters:</span>
            <span className="value">{agent.NeuralNetwork.getGenomeData().length}</span>
          </div>
        </div>

        <h4 style={{ marginTop: '1rem' }}><i className="bi bi-activity"></i> Real-Time Outputs</h4>
        <div className="output-bars">
          {lastOutputs.map((output, i) => (
            <div key={i} className="output-bar-container">
              <span className="output-label">{outputLabels[i]}</span>
              <div className="output-bar-bg">
                <div 
                  className="output-bar-fill" 
                  style={{ 
                    width: `${Math.abs(output) * 100}%`,
                    backgroundColor: output > 0 ? '#64c8ff' : '#ff5050'
                  }}
                />
              </div>
              <span className="output-value">{output.toFixed(3)}</span>
            </div>
          ))}
        </div>

        <div className="network-legend">
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#64c8ff' }}></span>
            <span>Positive (Cyan)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#ff5050' }}></span>
            <span>Negative (Red)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#ffffff', border: '1px solid #666' }}></span>
            <span>Near Zero (White)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#00ff88' }}></span>
            <span>Active Neurons</span>
          </div>
        </div>
      </div>
    </div>
  )
}
