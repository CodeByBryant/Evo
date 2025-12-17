import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { Agent } from '../core/Agent'
import type { SpeciesInfo } from '../core/SpeciesManager'
import type { GeneticTraits } from '../types/simulation'

interface FamilyTreeNode {
  id: string
  speciesId: string
  parentIds: string[]
  childIds: string[]
  generation: number
  x: number
  y: number
  isAlive: boolean
  fitness: number
  foodEaten: number
  age: number
  descendants: number
  ancestors: number
  geneticTraits?: GeneticTraits
}

interface FamilyTreePanelProps {
  agents: Agent[]
  agentHistory?: Map<string, Agent>
  selectedAgent: Agent | null
  onAgentSelect?: (agent: Agent | null) => void
  speciesManager?: { getAllSpecies: () => SpeciesInfo[] }
  resetKey?: number
}

export const FamilyTreePanel: React.FC<FamilyTreePanelProps> = ({
  agents,
  agentHistory,
  selectedAgent,
  onAgentSelect,
  resetKey
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<Map<string, FamilyTreeNode>>(new Map())
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showLineage, setShowLineage] = useState(true)
  const [hoveredNode, setHoveredNode] = useState<FamilyTreeNode | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null)
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null)
  const [animationFrame, setAnimationFrame] = useState(0)
  const [showDeadAgents, setShowDeadAgents] = useState(true)
  const [filterToLineage, setFilterToLineage] = useState(false)
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    setNodes(new Map())
    setViewOffset({ x: 0, y: 0 })
    setZoom(1)
    setHoveredNode(null)
  }, [resetKey])

  const getSafeHash = useCallback((speciesId: string | undefined): number => {
    const safeId = speciesId || '0'
    const hash = parseInt(safeId.substring(0, 8), 36)
    return Number.isFinite(hash) ? Math.abs(hash) : 0
  }, [])

  const getSafeHue = useCallback((rawHue: number | undefined, fallbackHash: number): number => {
    if (typeof rawHue === 'number' && Number.isFinite(rawHue)) {
      return Math.floor(rawHue) % 360
    }
    return fallbackHash % 360
  }, [])

  const getNodeColor = useCallback(
    (node: FamilyTreeNode, alpha = 1): string => {
      const hash = getSafeHash(node?.speciesId)
      const hue = getSafeHue(node?.geneticTraits?.hue, hash)
      const saturation = 60 + (hash % 25)
      const lightness = 45 + ((hash >> 4) % 15)
      const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1
      return `hsla(${hue}, ${saturation}%, ${lightness}%, ${safeAlpha})`
    },
    [getSafeHash, getSafeHue]
  )

  const getNodeGlow = useCallback(
    (node: FamilyTreeNode): string => {
      const hash = getSafeHash(node?.speciesId)
      const hue = getSafeHue(node?.geneticTraits?.hue, hash)
      return `hsla(${hue}, 80%, 60%, 0.6)`
    },
    [getSafeHash, getSafeHue]
  )

  const calculateTraitDifferences = useCallback(
    (
      parentTraits: GeneticTraits | undefined,
      childTraits: GeneticTraits | undefined
    ): { count: number; differences: string[] } => {
      if (!parentTraits || !childTraits) return { count: 0, differences: [] }

      const differences: string[] = []
      const numericKeys: (keyof GeneticTraits)[] = [
        'size',
        'movementSpeed',
        'acceleration',
        'turnRate',
        'drag',
        'sensorRayCount',
        'sensorRayLength',
        'sensorPrecision',
        'fieldOfView',
        'energyEfficiency',
        'digestionRate',
        'maxEnergyCapacity',
        'mutationRate',
        'reproductionThreshold',
        'offspringCount',
        'learningRate',
        'memoryNeurons',
        'aggression'
      ]

      for (const key of numericKeys) {
        const parentVal = parentTraits[key] as number
        const childVal = childTraits[key] as number
        if (Math.abs(parentVal - childVal) > 0.01) {
          const percentChange = ((childVal - parentVal) / parentVal) * 100
          const sign = percentChange > 0 ? '+' : ''
          differences.push(`${key}: ${sign}${percentChange.toFixed(0)}%`)
        }
      }

      if (parentTraits.colorVision !== childTraits.colorVision) {
        differences.push(`colorVision: ${childTraits.colorVision ? 'gained' : 'lost'}`)
      }

      const parentHue = Number.isFinite(parentTraits.hue) ? parentTraits.hue : 0
      const childHue = Number.isFinite(childTraits.hue) ? childTraits.hue : 0
      const hueDiff = Math.abs(parentHue - childHue)
      const hueChange = hueDiff > 180 ? 360 - hueDiff : hueDiff
      if (hueChange > 5) {
        differences.push(`hue: ${parentHue.toFixed(0)}° → ${childHue.toFixed(0)}°`)
      }

      return { count: differences.length, differences }
    },
    []
  )

  const getMutationEdgeColor = useCallback((mutationCount: number, alpha: number = 0.5): string => {
    const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0.5
    const safeMutation = Number.isFinite(mutationCount) ? mutationCount : 0
    if (safeMutation === 0) return `rgba(100, 200, 100, ${safeAlpha})`
    if (safeMutation <= 2) return `rgba(150, 200, 100, ${safeAlpha})`
    if (safeMutation <= 4) return `rgba(220, 180, 80, ${safeAlpha})`
    return `rgba(255, 120, 80, ${safeAlpha})`
  }, [])

  const countDescendants = useCallback(
    (
      nodeId: string,
      nodesMap: Map<string, FamilyTreeNode>,
      visited = new Set<string>()
    ): number => {
      if (visited.has(nodeId)) return 0
      visited.add(nodeId)
      const node = nodesMap.get(nodeId)
      if (!node) return 0
      let count = 0
      node.childIds.forEach((childId) => {
        count += 1 + countDescendants(childId, nodesMap, visited)
      })
      return count
    },
    []
  )

  const countAncestors = useCallback(
    (
      nodeId: string,
      nodesMap: Map<string, FamilyTreeNode>,
      visited = new Set<string>()
    ): number => {
      if (visited.has(nodeId)) return 0
      visited.add(nodeId)
      const node = nodesMap.get(nodeId)
      if (!node) return 0
      let count = 0
      node.parentIds.forEach((parentId) => {
        if (nodesMap.has(parentId)) {
          count += 1 + countAncestors(parentId, nodesMap, visited)
        }
      })
      return count
    },
    []
  )

  const countSiblings = useCallback(
    (nodeId: string, nodesMap: Map<string, FamilyTreeNode>): number => {
      const node = nodesMap.get(nodeId)
      if (!node || node.parentIds.length === 0) return 0

      const siblingSet = new Set<string>()
      node.parentIds.forEach((parentId) => {
        const parent = nodesMap.get(parentId)
        if (parent) {
          parent.childIds.forEach((childId) => {
            if (childId !== nodeId) {
              siblingSet.add(childId)
            }
          })
        }
      })
      return siblingSet.size
    },
    []
  )

  const getLineage = useCallback(
    (nodeId: string, nodesMap: Map<string, FamilyTreeNode>): Set<string> => {
      const lineage = new Set<string>()

      const getAncestors = (id: string, visited = new Set<string>()): void => {
        if (visited.has(id)) return
        visited.add(id)
        lineage.add(id)
        const node = nodesMap.get(id)
        if (node) {
          node.parentIds.forEach((parentId) => {
            if (nodesMap.has(parentId)) {
              getAncestors(parentId, visited)
            }
          })
        }
      }

      const getDescendants = (id: string, visited = new Set<string>()): void => {
        if (visited.has(id)) return
        visited.add(id)
        lineage.add(id)
        const node = nodesMap.get(id)
        if (node) {
          node.childIds.forEach((childId) => {
            getDescendants(childId, visited)
          })
        }
      }

      getAncestors(nodeId)
      getDescendants(nodeId)
      return lineage
    },
    []
  )

  useEffect(() => {
    const newNodes = new Map<string, FamilyTreeNode>()
    const childrenMap = new Map<string, string[]>()

    // Combine current agents with agent history
    // Note: agentHistory should be cleared on reset, but we also check for empty history
    const allAgentsMap = new Map<string, Agent>()
    if (agentHistory && agentHistory.size > 0) {
      agentHistory.forEach((agent, id) => allAgentsMap.set(id, agent))
    }
    agents.forEach((agent) => allAgentsMap.set(agent.id, agent))

    const agentIds = new Set(agents.map((a) => a.id))

    allAgentsMap.forEach((agent) => {
      agent.parentIds?.forEach((parentId) => {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, [])
        }
        childrenMap.get(parentId)!.push(agent.id)
      })
    })

    allAgentsMap.forEach((agent) => {
      const existingNode = nodes.get(agent.id)

      newNodes.set(agent.id, {
        id: agent.id,
        speciesId: agent.species,
        parentIds: agent.parentIds || [],
        childIds: childrenMap.get(agent.id) || [],
        generation: agent.generation,
        x: existingNode?.x ?? 0,
        y: existingNode?.y ?? 0,
        isAlive: agentIds.has(agent.id),
        fitness: agent.fitness,
        foodEaten: agent.foodEaten,
        age: agent.age,
        descendants: 0,
        ancestors: 0,
        geneticTraits: agent.geneticTraits
      })
    })

    newNodes.forEach((node, id) => {
      node.descendants = countDescendants(id, newNodes)
      node.ancestors = countAncestors(id, newNodes)
    })

    setNodes(newNodes)
  }, [agents, agentHistory, countDescendants, countAncestors])

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationFrame((f) => (f + 1) % 360)
    }, 50)
    return (): void => clearInterval(interval)
  }, [])

  const lineageSet = useMemo(() => {
    if (!selectedAgent || !showLineage) return new Set<string>()
    return getLineage(selectedAgent.id, nodes)
  }, [selectedAgent, nodes, showLineage, getLineage])

  const statistics = useMemo(() => {
    const stats = {
      totalNodes: nodes.size,
      aliveNodes: 0,
      deadNodes: 0,
      maxGeneration: 0,
      speciesCount: new Set<string>(),
      avgFitness: 0,
      selectedLineageSize: lineageSet.size,
      selectedDescendants: 0,
      selectedAncestors: 0
    }

    let fitnessSum = 0
    let fitnessCount = 0

    nodes.forEach((node) => {
      if (node.isAlive) {
        stats.aliveNodes++
        fitnessSum += node.fitness
        fitnessCount++
      } else {
        stats.deadNodes++
      }
      stats.maxGeneration = Math.max(stats.maxGeneration, node.generation)
      stats.speciesCount.add(node.speciesId)
    })

    stats.avgFitness = fitnessCount > 0 ? fitnessSum / fitnessCount : 0

    if (selectedAgent) {
      const selectedNode = nodes.get(selectedAgent.id)
      if (selectedNode) {
        stats.selectedDescendants = selectedNode.descendants
        stats.selectedAncestors = selectedNode.ancestors
      }
    }

    return stats
  }, [nodes, lineageSet, selectedAgent])

  const calculatePositions = useCallback(
    (nodesMap: Map<string, FamilyTreeNode>) => {
      const positioned = new Map<string, { x: number; y: number }>()

      const lineageSet =
        selectedAgent && filterToLineage ? getLineage(selectedAgent.id, nodesMap) : null

      const generationGroups = new Map<number, FamilyTreeNode[]>()
      let maxGeneration = 0

      nodesMap.forEach((node) => {
        if (!showDeadAgents && !node.isAlive) return
        if (filterToLineage && selectedAgent && lineageSet && !lineageSet.has(node.id)) return

        const gen = node.generation
        if (!generationGroups.has(gen)) {
          generationGroups.set(gen, [])
        }
        generationGroups.get(gen)!.push(node)
        maxGeneration = Math.max(maxGeneration, gen)
      })

      const generationSpacing = 100
      const baseHorizontalSpacing = 60

      generationGroups.forEach((group, gen) => {
        const sortedGroup = [...group].sort((a, b) => {
          if (a.parentIds.length && b.parentIds.length) {
            const aParent = positioned.get(a.parentIds[0])
            const bParent = positioned.get(b.parentIds[0])
            if (aParent && bParent) return aParent.x - bParent.x
          }
          return a.speciesId.localeCompare(b.speciesId)
        })

        const totalInGen = sortedGroup.length
        const horizontalSpacing = Math.max(baseHorizontalSpacing, 400 / Math.max(totalInGen, 1))

        sortedGroup.forEach((node, index) => {
          const y = gen * generationSpacing
          const x = (index - (totalInGen - 1) / 2) * horizontalSpacing
          positioned.set(node.id, { x, y })
        })
      })

      return positioned
    },
    [showDeadAgents, selectedAgent, filterToLineage, getLineage]
  )

  const renderTree = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, '#0a0a12')
    gradient.addColorStop(0.5, '#0f0f1a')
    gradient.addColorStop(1, '#0a0a12')
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < 10; i++) {
      const x = (Math.sin(i * 234.5 + animationFrame * 0.01) * 0.5 + 0.5) * canvas.width
      const y = (Math.cos(i * 345.6 + animationFrame * 0.008) * 0.5 + 0.5) * canvas.height
      const alpha = 0.05 + Math.sin(i + animationFrame * 0.05) * 0.03
      context.fillStyle = `rgba(100, 150, 255, ${alpha})`
      context.beginPath()
      context.arc(x, y, 0.8, 0, Math.PI * 2)
      context.fill()
    }

    context.save()
    context.translate(canvas.width / 2 + viewOffset.x, canvas.height / 3 + viewOffset.y)
    context.scale(zoom, zoom)

    const positions = calculatePositions(nodes)

    const maxGen = statistics.maxGeneration
    for (let gen = 0; gen <= maxGen; gen++) {
      const y = gen * 100
      context.strokeStyle = 'rgba(255, 255, 255, 0.03)'
      context.lineWidth = 1
      context.setLineDash([5, 10])
      context.beginPath()
      context.moveTo(-1000, y)
      context.lineTo(1000, y)
      context.stroke()
      context.setLineDash([])

      context.fillStyle = 'rgba(255, 255, 255, 0.15)'
      context.font = '10px Inter, system-ui, sans-serif'
      context.textAlign = 'left'
      context.fillText(`Depth ${gen}`, -180, y + 4)
    }

    nodes.forEach((node) => {
      const nodePos = positions.get(node.id)
      if (!nodePos) return

      node.parentIds.forEach((parentId) => {
        const parentNode = nodes.get(parentId)
        const parentPos = positions.get(parentId)
        if (!parentNode || !parentPos) return

        const isInLineage = lineageSet.has(node.id) && lineageSet.has(parentId)

        // Calculate mutation count for edge coloring
        const traitDiff = calculateTraitDifferences(parentNode.geneticTraits, node.geneticTraits)
        const mutationCount = traitDiff.count

        const gradient = context.createLinearGradient(
          parentPos.x,
          parentPos.y,
          nodePos.x,
          nodePos.y
        )

        if (isInLineage && showLineage) {
          const pulseAlpha = 0.4 + Math.sin(animationFrame * 0.1) * 0.2
          // Use mutation-based coloring for lineage edges
          const mutationColor = getMutationEdgeColor(mutationCount, pulseAlpha + 0.4)
          gradient.addColorStop(0, getNodeColor(parentNode, pulseAlpha + 0.3))
          gradient.addColorStop(0.5, mutationColor)
          gradient.addColorStop(1, getNodeColor(node, pulseAlpha + 0.3))
          context.lineWidth = 2 + Math.min(mutationCount, 4)

          context.shadowBlur = 8
          context.shadowColor = getNodeGlow(node)
        } else if (!node.isAlive) {
          gradient.addColorStop(0, 'rgba(80, 80, 80, 0.15)')
          gradient.addColorStop(1, 'rgba(60, 60, 60, 0.1)')
          context.lineWidth = 1
          context.shadowBlur = 0
        } else {
          // Use mutation-based coloring for regular edges
          const mutationColor = getMutationEdgeColor(mutationCount, 0.35)
          gradient.addColorStop(0, getNodeColor(parentNode, 0.25))
          gradient.addColorStop(0.5, mutationColor)
          gradient.addColorStop(1, getNodeColor(node, 0.25))
          context.lineWidth = 1 + Math.min(mutationCount * 0.3, 2)
          context.shadowBlur = 0
        }

        context.strokeStyle = gradient
        context.beginPath()
        context.moveTo(parentPos.x, parentPos.y + 12)

        const midY = (parentPos.y + nodePos.y) / 2
        const controlOffset = (nodePos.x - parentPos.x) * 0.3

        context.bezierCurveTo(
          parentPos.x + controlOffset,
          midY,
          nodePos.x - controlOffset,
          midY,
          nodePos.x,
          nodePos.y - 12
        )
        context.stroke()
        context.shadowBlur = 0
      })
    })

    nodes.forEach((node) => {
      const pos = positions.get(node.id)
      if (!pos) return

      const isSelected = selectedAgent?.id === node.id
      const isHovered = hoveredNode?.id === node.id
      const isInLineage = lineageSet.has(node.id)

      // Use genetic traits size for node radius (normalized from 20-60 range to 6-14 radius)
      const sizeFromTraits = node.geneticTraits?.size ?? 40
      const normalizedSize = ((sizeFromTraits - 20) / 40) * 8 + 6
      let baseRadius = node.isAlive
        ? normalizedSize + Math.min(node.fitness / 60, 4)
        : normalizedSize * 0.6
      if (isSelected) baseRadius += 4
      if (isHovered) baseRadius += 2

      if (node.isAlive && (isSelected || isInLineage)) {
        const pulseRadius = baseRadius + Math.sin(animationFrame * 0.15) * 2
        const glowGradient = context.createRadialGradient(
          pos.x,
          pos.y,
          0,
          pos.x,
          pos.y,
          pulseRadius + 15
        )
        glowGradient.addColorStop(0, getNodeColor(node, 0.4))
        glowGradient.addColorStop(0.5, getNodeColor(node, 0.15))
        glowGradient.addColorStop(1, 'transparent')

        context.fillStyle = glowGradient
        context.beginPath()
        context.arc(pos.x, pos.y, pulseRadius + 15, 0, Math.PI * 2)
        context.fill()
      }

      context.beginPath()
      context.arc(pos.x, pos.y, baseRadius, 0, Math.PI * 2)

      if (!node.isAlive) {
        const deadGradient = context.createRadialGradient(
          pos.x - 2,
          pos.y - 2,
          0,
          pos.x,
          pos.y,
          baseRadius
        )
        deadGradient.addColorStop(0, '#555')
        deadGradient.addColorStop(1, '#333')
        context.fillStyle = deadGradient
      } else if (isSelected) {
        const selectGradient = context.createRadialGradient(
          pos.x - 3,
          pos.y - 3,
          0,
          pos.x,
          pos.y,
          baseRadius
        )
        selectGradient.addColorStop(0, '#fff')
        selectGradient.addColorStop(0.3, '#ffee00')
        selectGradient.addColorStop(1, '#ffaa00')
        context.fillStyle = selectGradient
      } else {
        const nodeGradient = context.createRadialGradient(
          pos.x - 3,
          pos.y - 3,
          0,
          pos.x,
          pos.y,
          baseRadius
        )
        nodeGradient.addColorStop(0, getNodeColor(node, 1))
        nodeGradient.addColorStop(1, getNodeColor(node, 0.7))
        context.fillStyle = nodeGradient
      }
      context.fill()

      if (isSelected || isHovered) {
        context.strokeStyle = isSelected ? '#fff' : 'rgba(255, 255, 255, 0.7)'
        context.lineWidth = isSelected ? 3 : 2
        context.stroke()
      } else if (node.isAlive) {
        context.strokeStyle = 'rgba(255, 255, 255, 0.2)'
        context.lineWidth = 1
        context.stroke()
      }

      if (node.childIds.length > 3 && node.isAlive) {
        context.fillStyle = '#fff'
        context.font = 'bold 8px Inter, system-ui, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(`${node.childIds.length}`, pos.x, pos.y)
      }

      const siblingCount = countSiblings(node.id, nodes)
      if (siblingCount >= 25) {
        context.fillStyle = 'rgba(255, 200, 100, 0.9)'
        context.font = '9px Inter, system-ui, sans-serif'
        context.textAlign = 'left'
        context.textBaseline = 'top'
        context.fillText(`+${siblingCount} siblings`, pos.x + baseRadius + 4, pos.y - 4)
      }
    })

    context.restore()

    context.fillStyle = 'rgba(255, 255, 255, 0.4)'
    context.font = '11px Inter, system-ui, sans-serif'
    context.fillText(`Scroll/pinch to zoom | Drag/touch to pan`, 12, canvas.height - 12)

    context.fillStyle = 'rgba(255, 255, 255, 0.3)'
    context.textAlign = 'right'
    context.fillText(`Zoom: ${(zoom * 100).toFixed(0)}%`, canvas.width - 12, canvas.height - 12)
  }, [
    nodes,
    viewOffset,
    zoom,
    selectedAgent,
    hoveredNode,
    lineageSet,
    showLineage,
    animationFrame,
    calculatePositions,
    getNodeColor,
    getNodeGlow,
    statistics,
    showDeadAgents,
    countSiblings
  ])

  const renderMinimap = useCallback(() => {
    const minimap = minimapRef.current
    if (!minimap) return

    const ctx = minimap.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = 'rgba(15, 15, 25, 0.9)'
    ctx.fillRect(0, 0, minimap.width, minimap.height)

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, minimap.width, minimap.height)

    const positions = calculatePositions(nodes)
    if (positions.size === 0) return

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    positions.forEach((pos) => {
      minX = Math.min(minX, pos.x)
      maxX = Math.max(maxX, pos.x)
      minY = Math.min(minY, pos.y)
      maxY = Math.max(maxY, pos.y)
    })

    const padding = 20
    const scaleX = (minimap.width - padding * 2) / Math.max(maxX - minX, 1)
    const scaleY = (minimap.height - padding * 2) / Math.max(maxY - minY, 1)
    const scale = Math.min(scaleX, scaleY, 0.5)

    ctx.save()
    ctx.translate(minimap.width / 2, minimap.height / 2)
    ctx.scale(scale, scale)
    ctx.translate(-(minX + maxX) / 2, -(minY + maxY) / 2)

    nodes.forEach((node) => {
      const pos = positions.get(node.id)
      if (!pos) return

      ctx.beginPath()
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2)

      if (selectedAgent?.id === node.id) {
        ctx.fillStyle = '#ffff00'
      } else if (lineageSet.has(node.id)) {
        ctx.fillStyle = getNodeColor(node, 0.8)
      } else if (node.isAlive) {
        ctx.fillStyle = getNodeColor(node, 0.5)
      } else {
        ctx.fillStyle = 'rgba(100, 100, 100, 0.3)'
      }
      ctx.fill()
    })

    ctx.restore()

    const canvas = canvasRef.current
    if (canvas) {
      const viewWidth = canvas.width / zoom / scale
      const viewHeight = canvas.height / zoom / scale
      const viewX = minimap.width / 2 - (viewOffset.x / zoom) * scale - (viewWidth * scale) / 2
      const viewY = minimap.height / 2 - (viewOffset.y / zoom) * scale - (viewHeight * scale) / 2

      ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)'
      ctx.lineWidth = 1
      ctx.strokeRect(viewX, viewY, viewWidth * scale, viewHeight * scale)
    }
  }, [nodes, viewOffset, zoom, selectedAgent, lineageSet, calculatePositions, getNodeColor])

  useEffect(() => {
    renderTree()
    renderMinimap()
  }, [renderTree, renderMinimap])

  useEffect(() => {
    const canvas = canvasRef.current
    const minimap = minimapRef.current
    if (!canvas) return

    const resizeCanvas = (): void => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      if (minimap) {
        minimap.width = 120
        minimap.height = 80
      }
      renderTree()
      renderMinimap()
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return (): void => window.removeEventListener('resize', resizeCanvas)
  }, [renderTree, renderMinimap])

  const getNodeAtPosition = useCallback(
    (clientX: number, clientY: number): FamilyTreeNode | null => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top

      const worldX = (x - canvas.width / 2 - viewOffset.x) / zoom
      const worldY = (y - canvas.height / 3 - viewOffset.y) / zoom

      const positions = calculatePositions(nodes)

      let closestNode: FamilyTreeNode | null = null
      let closestDistance = 20

      positions.forEach((pos, nodeId) => {
        const node = nodes.get(nodeId)
        if (!node) return

        const distance = Math.sqrt((worldX - pos.x) ** 2 + (worldY - pos.y) ** 2)
        if (distance < closestDistance) {
          closestDistance = distance
          closestNode = node
        }
      })

      return closestNode
    },
    [nodes, viewOffset, zoom, calculatePositions]
  )

  const handleMouseDown = (e: React.MouseEvent): void => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - viewOffset.x, y: e.clientY - viewOffset.y })
  }

  const handleMouseMove = (e: React.MouseEvent): void => {
    if (isDragging) {
      setViewOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    } else {
      const node = getNodeAtPosition(e.clientX, e.clientY)
      setHoveredNode(node)
      if (node) {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) {
          setTooltipPosition({
            x: e.clientX - rect.left + 15,
            y: e.clientY - rect.top - 10
          })
        }
      }
    }
  }

  const handleMouseUp = (e: React.MouseEvent): void => {
    if (
      !isDragging ||
      (Math.abs(e.clientX - dragStart.x - viewOffset.x) < 5 &&
        Math.abs(e.clientY - dragStart.y - viewOffset.y) < 5)
    ) {
      const node = getNodeAtPosition(e.clientX, e.clientY)
      if (node && onAgentSelect) {
        const agent = agents.find((a) => a.id === node.id)
        if (agent) {
          onAgentSelect(agent)
        } else if (nodes.has(node.id)) {
          // For dead agents, still trigger selection even if not in current agents list
          onAgentSelect(null)
        }
      }
    }
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent): void => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom((prev) => Math.max(0.1, Math.min(4, prev * delta)))
  }

  const getTouchDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const getTouchCenter = (touches: React.TouchList): { x: number; y: number } => {
    if (touches.length < 2) {
      return { x: touches[0].clientX, y: touches[0].clientY }
    }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    }
  }

  const handleTouchStart = (e: React.TouchEvent): void => {
    e.preventDefault()

    if (e.touches.length === 1) {
      const touch = e.touches[0]
      setIsDragging(true)
      setDragStart({ x: touch.clientX - viewOffset.x, y: touch.clientY - viewOffset.y })
      setTouchStartPos({ x: touch.clientX, y: touch.clientY })
    } else if (e.touches.length === 2) {
      const center = getTouchCenter(e.touches)
      setLastTouchDistance(getTouchDistance(e.touches))
      setTouchStartPos(center)
      setIsDragging(false)
    }
  }

  const handleTouchMove = (e: React.TouchEvent): void => {
    e.preventDefault()

    if (e.touches.length === 1 && isDragging) {
      const touch = e.touches[0]
      setViewOffset({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      })
    } else if (e.touches.length === 2 && lastTouchDistance !== null) {
      const newDistance = getTouchDistance(e.touches)
      const scale = newDistance / lastTouchDistance

      setZoom((prev) => Math.max(0.1, Math.min(4, prev * scale)))
      setLastTouchDistance(newDistance)

      const center = getTouchCenter(e.touches)
      if (touchStartPos) {
        const dx = center.x - touchStartPos.x
        const dy = center.y - touchStartPos.y
        setViewOffset((prev) => ({
          x: prev.x + dx * 0.3,
          y: prev.y + dy * 0.3
        }))
        setTouchStartPos(center)
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent): void => {
    if (e.touches.length === 0) {
      if (touchStartPos && !lastTouchDistance) {
        const touch = e.changedTouches[0]
        const dx = Math.abs(touch.clientX - touchStartPos.x)
        const dy = Math.abs(touch.clientY - touchStartPos.y)

        if (dx < 10 && dy < 10) {
          const node = getNodeAtPosition(touch.clientX, touch.clientY)
          if (node && onAgentSelect) {
            const agent = agents.find((a) => a.id === node.id)
            if (agent) {
              onAgentSelect(agent)
            } else if (nodes.has(node.id)) {
              // For dead agents, still trigger selection
              onAgentSelect(null)
            }
          }
        }
      }

      setIsDragging(false)
      setLastTouchDistance(null)
      setTouchStartPos(null)
    } else if (e.touches.length === 1) {
      const touch = e.touches[0]
      setDragStart({ x: touch.clientX - viewOffset.x, y: touch.clientY - viewOffset.y })
      setLastTouchDistance(null)
      setIsDragging(true)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'linear-gradient(135deg, #0a0a12 0%, #12121f 100%)',
        borderRadius: '8px',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          padding: '10px 12px',
          background: 'rgba(20, 20, 35, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          alignItems: 'center'
        }}
      >
        <button
          onClick={() => setShowLineage(!showLineage)}
          style={{
            padding: '5px 10px',
            background: showLineage ? 'rgba(100, 200, 100, 0.2)' : 'rgba(255, 255, 255, 0.06)',
            color: showLineage ? '#8f8' : 'rgba(255, 255, 255, 0.6)',
            border: showLineage ? '1px solid rgba(100, 200, 100, 0.3)' : '1px solid transparent',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            transition: 'all 0.2s'
          }}
        >
          <i className="bi bi-diagram-3" style={{ marginRight: '4px' }}></i>
          Lineage
        </button>

        <button
          onClick={() => setShowDeadAgents(!showDeadAgents)}
          style={{
            padding: '5px 10px',
            background: showDeadAgents ? 'rgba(150, 150, 150, 0.2)' : 'rgba(255, 255, 255, 0.06)',
            color: showDeadAgents ? '#aaa' : 'rgba(255, 255, 255, 0.6)',
            border: showDeadAgents ? '1px solid rgba(150, 150, 150, 0.3)' : '1px solid transparent',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            transition: 'all 0.2s'
          }}
        >
          <i className="bi bi-eye" style={{ marginRight: '4px' }}></i>
          Deceased
        </button>

        <button
          onClick={() => setShowStats(!showStats)}
          style={{
            padding: '5px 10px',
            background: showStats ? 'rgba(100, 150, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)',
            color: showStats ? '#8af' : 'rgba(255, 255, 255, 0.7)',
            border: showStats ? '1px solid rgba(100, 150, 255, 0.3)' : 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            transition: 'all 0.2s'
          }}
        >
          <i className="bi bi-info-circle" style={{ marginRight: '4px' }}></i>
          Stats
        </button>

        <button
          onClick={() => {
            setViewOffset({ x: 0, y: 0 })
            setZoom(1)
          }}
          style={{
            padding: '5px 10px',
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'rgba(255, 255, 255, 0.7)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            marginLeft: 'auto',
            transition: 'all 0.2s'
          }}
        >
          <i className="bi bi-arrows-fullscreen" style={{ marginRight: '4px' }}></i>
          Reset
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        {showStats && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              background: 'rgba(15, 15, 25, 0.9)',
              borderRadius: '8px',
              padding: '10px 12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.8)',
              zIndex: 10,
              backdropFilter: 'blur(8px)',
              minWidth: '140px'
            }}
          >
            <div
              style={{
                fontWeight: '600',
                marginBottom: '8px',
                color: '#fff',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                paddingBottom: '6px'
              }}
            >
              <i className="bi bi-bar-chart" style={{ marginRight: '6px', opacity: 0.7 }}></i>
              Statistics
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.6 }}>Total:</span>
                <span style={{ color: '#8af' }}>{statistics.totalNodes}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.6 }}>Alive:</span>
                <span style={{ color: '#8f8' }}>{statistics.aliveNodes}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.6 }}>Dead:</span>
                <span style={{ color: '#888' }}>{statistics.deadNodes}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.6 }}>Generations:</span>
                <span style={{ color: '#fa8' }}>{statistics.maxGeneration + 1}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.6 }}>Species:</span>
                <span style={{ color: '#f8a' }}>{statistics.speciesCount.size}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.6 }}>Avg Fitness:</span>
                <span style={{ color: '#8fa' }}>{statistics.avgFitness.toFixed(1)}</span>
              </div>
            </div>

            {selectedAgent && (
              <>
                <div
                  style={{
                    fontWeight: '600',
                    margin: '10px 0 8px',
                    color: '#ffee00',
                    borderBottom: '1px solid rgba(255, 238, 0, 0.2)',
                    paddingBottom: '6px'
                  }}
                >
                  <i className="bi bi-star-fill" style={{ marginRight: '6px', opacity: 0.7 }}></i>
                  Selected
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.6 }}>ID:</span>
                    <span style={{ color: '#ff8', fontFamily: 'monospace' }}>
                      {selectedAgent.id.substring(0, 8)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.6 }}>Ancestors:</span>
                    <span style={{ color: '#f8a' }}>{statistics.selectedAncestors}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.6 }}>Descendants:</span>
                    <span style={{ color: '#8af' }}>{statistics.selectedDescendants}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.6 }}>Lineage:</span>
                    <span style={{ color: '#8fa' }}>{statistics.selectedLineageSize}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            bottom: '30px',
            left: '10px',
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            zIndex: 10
          }}
        >
          <canvas ref={minimapRef} width={120} height={80} style={{ display: 'block' }} />
        </div>

        <canvas
          ref={canvasRef}
          style={{
            flex: 1,
            cursor: isDragging ? 'grabbing' : hoveredNode ? 'pointer' : 'grab',
            width: '100%',
            touchAction: 'none'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            setIsDragging(false)
            setHoveredNode(null)
          }}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => {
            setIsDragging(false)
            setLastTouchDistance(null)
            setTouchStartPos(null)
          }}
        />

        {hoveredNode &&
          !isDragging &&
          ((): JSX.Element => {
            const parentNode =
              hoveredNode.parentIds.length > 0 ? nodes.get(hoveredNode.parentIds[0]) : null
            const traitDiff = parentNode
              ? calculateTraitDifferences(parentNode.geneticTraits, hoveredNode.geneticTraits)
              : null

            return (
              <div
                ref={tooltipRef}
                style={{
                  position: 'absolute',
                  left: tooltipPosition.x,
                  top: tooltipPosition.y,
                  background: 'rgba(20, 20, 35, 0.95)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontSize: '11px',
                  color: '#fff',
                  zIndex: 100,
                  pointerEvents: 'none',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                  maxWidth: '220px'
                }}
              >
                <div
                  style={{
                    fontWeight: '600',
                    marginBottom: '4px',
                    color: hoveredNode.isAlive ? getNodeColor(hoveredNode) : '#888',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: hoveredNode.isAlive ? getNodeColor(hoveredNode) : '#555',
                      display: 'inline-block'
                    }}
                  ></span>
                  {hoveredNode.id.substring(0, 10)}...
                  {!hoveredNode.isAlive && (
                    <span style={{ color: '#888', fontSize: '10px' }}>(dead)</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', opacity: 0.9 }}>
                  <div>
                    Depth: <span style={{ color: '#fa8' }}>{hoveredNode.generation}</span>
                  </div>
                  <div>
                    Fitness: <span style={{ color: '#8f8' }}>{hoveredNode.fitness.toFixed(1)}</span>
                  </div>
                  <div>
                    Food: <span style={{ color: '#8af' }}>{hoveredNode.foodEaten}</span>
                  </div>
                  <div>
                    Age: <span style={{ color: '#f8a' }}>{hoveredNode.age}</span>
                  </div>
                  <div>
                    Children: <span style={{ color: '#ff8' }}>{hoveredNode.childIds.length}</span>
                  </div>
                  <div>
                    Descendants: <span style={{ color: '#8fa' }}>{hoveredNode.descendants}</span>
                  </div>
                  {hoveredNode.geneticTraits && (
                    <div>
                      Size:{' '}
                      <span style={{ color: '#aaf' }}>
                        {hoveredNode.geneticTraits.size.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
                {traitDiff && traitDiff.differences.length > 0 && (
                  <div
                    style={{
                      marginTop: '6px',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      fontSize: '10px'
                    }}
                  >
                    <div
                      style={{
                        color: getMutationEdgeColor(traitDiff.count, 1),
                        fontWeight: '600',
                        marginBottom: '3px'
                      }}
                    >
                      Mutations ({traitDiff.count}):
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1px',
                        maxHeight: '80px',
                        overflow: 'hidden'
                      }}
                    >
                      {traitDiff.differences.slice(0, 5).map((diff, i) => (
                        <div key={i} style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                          {diff}
                        </div>
                      ))}
                      {traitDiff.differences.length > 5 && (
                        <div style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                          +{traitDiff.differences.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {hoveredNode.isAlive && (
                  <div
                    style={{
                      marginTop: '6px',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                      color: 'rgba(255, 255, 255, 0.5)',
                      fontSize: '10px',
                      textAlign: 'center'
                    }}
                  >
                    Click to select
                  </div>
                )}
              </div>
            )
          })()}
      </div>
    </div>
  )
}
