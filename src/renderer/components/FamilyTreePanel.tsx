import React, { useRef, useEffect, useState, useCallback } from 'react'
import type { Agent } from '../core/Agent'
import type { SpeciesInfo } from '../core/SpeciesManager'

interface FamilyTreeNode {
  id: string
  speciesId: string
  parentIds: string[]
  generation: number
  x: number
  y: number
  isAlive: boolean
  fitness: number
  foodEaten: number
  age: number
}

interface FamilyTreePanelProps {
  agents: Agent[]
  selectedAgent: Agent | null
  onAgentSelect?: (agent: Agent | null) => void
  speciesManager?: { getAllSpecies: () => SpeciesInfo[] }
}

export const FamilyTreePanel: React.FC<FamilyTreePanelProps> = ({
  agents,
  selectedAgent,
  onAgentSelect,
  speciesManager
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<Map<string, FamilyTreeNode>>(new Map())
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const getSpeciesColor = useCallback((speciesId: string): string => {
    const hash = parseInt(speciesId.substring(0, 8), 36)
    const hue = hash % 360
    const saturation = 50 + (hash % 30)
    const lightness = 40 + ((hash >> 4) % 20)
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`
  }, [])

  useEffect(() => {
    const newNodes = new Map<string, FamilyTreeNode>()
    const agentIds = new Set(agents.map(a => a.id))

    agents.forEach((agent, index) => {
      const existingNode = nodes.get(agent.id)
      
      newNodes.set(agent.id, {
        id: agent.id,
        speciesId: agent.species,
        parentIds: agent.parentIds || [],
        generation: agent.generation,
        x: existingNode?.x ?? (index % 10) * 80 + 50,
        y: existingNode?.y ?? agent.generation * 100 + 50,
        isAlive: true,
        fitness: agent.fitness,
        foodEaten: agent.foodEaten,
        age: agent.age
      })
    })

    nodes.forEach((node, id) => {
      if (!agentIds.has(id)) {
        newNodes.set(id, { ...node, isAlive: false })
      }
    })

    setNodes(newNodes)
  }, [agents])

  const renderTree = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    context.fillStyle = '#0f0f0f'
    context.fillRect(0, 0, canvas.width, canvas.height)

    context.save()
    context.translate(canvas.width / 2 + viewOffset.x, viewOffset.y + 50)
    context.scale(zoom, zoom)

    renderAgentView(context)

    context.restore()

    context.fillStyle = '#888'
    context.font = '11px monospace'
    context.fillText(`Family Tree | Scroll to zoom | Drag to pan`, 10, canvas.height - 10)
  }, [nodes, viewOffset, zoom, selectedAgent])

  const renderSpeciesView = (context: CanvasRenderingContext2D) => {
    const species = speciesManager?.getAllSpecies() || []
    const speciesPopulation = new Map<string, number>()
    
    agents.forEach(agent => {
      speciesPopulation.set(agent.species, (speciesPopulation.get(agent.species) || 0) + 1)
    })

    const nodeRadius = 30
    const spacing = 120

    species.forEach((sp, index) => {
      const x = (index % 5 - 2) * spacing
      const y = Math.floor(index / 5) * spacing
      const population = speciesPopulation.get(sp.id) || 0
      const isExtinct = population === 0

      context.beginPath()
      context.arc(x, y, nodeRadius, 0, Math.PI * 2)
      context.fillStyle = isExtinct ? '#333' : getSpeciesColor(sp.id)
      context.fill()
      context.strokeStyle = selectedAgent?.species === sp.id ? '#fff' : '#555'
      context.lineWidth = selectedAgent?.species === sp.id ? 3 : 1
      context.stroke()

      context.fillStyle = isExtinct ? '#666' : '#fff'
      context.font = '10px monospace'
      context.textAlign = 'center'
      context.fillText(sp.id.substring(0, 6), x, y - 5)
      context.fillText(`Pop: ${population}`, x, y + 10)
    })
  }

  const renderAgentView = (context: CanvasRenderingContext2D) => {
    const generationGroups = new Map<number, FamilyTreeNode[]>()
    let maxGeneration = 0
    
    nodes.forEach(node => {
      const gen = node.generation
      if (!generationGroups.has(gen)) {
        generationGroups.set(gen, [])
      }
      generationGroups.get(gen)!.push(node)
      maxGeneration = Math.max(maxGeneration, gen)
    })

    // Recalculate positions for proper tree layout
    const generationSpacing = 120
    const newNodes = new Map(nodes)
    
    generationGroups.forEach((group, gen) => {
      group.forEach((node, index) => {
        const y = -maxGeneration * generationSpacing / 2 + gen * generationSpacing
        const totalInGen = group.length
        const horizontalSpacing = 80
        const x = (index - totalInGen / 2) * horizontalSpacing
        
        const updatedNode = { ...node, x, y }
        newNodes.set(node.id, updatedNode)
      })
    })

    // Draw generation labels on left
    context.fillStyle = '#666'
    context.font = '12px monospace'
    context.textAlign = 'right'
    for (let gen = 0; gen <= maxGeneration; gen++) {
      const y = -maxGeneration * generationSpacing / 2 + gen * generationSpacing
      context.fillText(`Gen ${gen}`, -100, y + 4)
    }

    // Draw parent-child connections
    newNodes.forEach(node => {
      node.parentIds.forEach(parentId => {
        const parentNode = newNodes.get(parentId)
        if (parentNode) {
          // Draw curved connection line
          context.beginPath()
          context.moveTo(parentNode.x, parentNode.y + 10)
          const midY = (parentNode.y + node.y) / 2
          context.bezierCurveTo(
            parentNode.x, midY,
            node.x, midY,
            node.x, node.y - 10
          )
          context.strokeStyle = node.isAlive ? 'rgba(100, 200, 100, 0.4)' : 'rgba(100, 100, 100, 0.2)'
          context.lineWidth = 2
          context.stroke()
        }
      })
    })

    // Draw agent nodes
    newNodes.forEach(node => {
      const radius = node.isAlive ? 10 + Math.min(node.fitness / 30, 5) : 6
      
      context.beginPath()
      context.arc(node.x, node.y, radius, 0, Math.PI * 2)
      
      if (!node.isAlive) {
        context.fillStyle = '#444'
      } else if (selectedAgent?.id === node.id) {
        context.fillStyle = '#ffff00'
      } else {
        context.fillStyle = getSpeciesColor(node.speciesId)
      }
      context.fill()

      context.strokeStyle = selectedAgent?.id === node.id ? '#fff' : '#555'
      context.lineWidth = selectedAgent?.id === node.id ? 3 : 1.5
      context.stroke()
    })

    // Draw selected agent info
    if (selectedAgent) {
      const selectedNode = newNodes.get(selectedAgent.id)
      if (selectedNode) {
        context.fillStyle = '#64c8ff'
        context.font = 'bold 11px monospace'
        context.textAlign = 'center'
        context.fillText(`Fitness: ${selectedNode.fitness.toFixed(1)}`, selectedNode.x, selectedNode.y - 25)
        context.fillText(`Food: ${selectedNode.foodEaten}`, selectedNode.x, selectedNode.y + 25)
      }
    }
  }

  useEffect(() => {
    renderTree()
  }, [renderTree])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      renderTree()
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [renderTree])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - viewOffset.x, y: e.clientY - viewOffset.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setViewOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.max(0.2, Math.min(3, prev * delta)))
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      background: '#0f0f0f',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        padding: '8px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333'
      }}>
        <button
          onClick={() => { setViewOffset({ x: 0, y: 0 }); setZoom(1) }}
          style={{
            padding: '6px 12px',
            background: '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            marginLeft: 'auto'
          }}
        >
          Reset View
        </button>
      </div>
      <canvas
        ref={canvasRef}
        style={{ 
          flex: 1, 
          cursor: isDragging ? 'grabbing' : 'grab',
          width: '100%'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
    </div>
  )
}
