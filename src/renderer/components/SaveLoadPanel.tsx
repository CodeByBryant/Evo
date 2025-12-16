import React, { useState } from 'react'
import { Agent } from '../core/Agent'

interface SaveLoadPanelProps {
  agents: Agent[]
  onLoad: (agents: Agent[]) => void
}

interface SavedAgentData {
  position: { x: number; y: number; rotation: number }
  width: number
  height: number
  fitness: number
  energy: number
  age: number
  generation: number
  species: string
  genome?: number[]
}

export const SaveLoadPanel: React.FC<SaveLoadPanelProps> = ({ agents, onLoad }) => {
  const [expanded, setExpanded] = useState(false)
  const [saves, setSaves] = useState<{ name: string; date: string; data: string }[]>(() => {
    const saved = localStorage.getItem('evo_saves')
    return saved ? JSON.parse(saved) : []
  })

  const handleSave = (): void => {
    const name = prompt('Enter save name:')
    if (!name) return

    console.log(`[SaveLoadPanel] Saving ${agents.length} agents as "${name}"`)

    const saveData = {
      name,
      date: new Date().toISOString(),
      data: JSON.stringify(
        agents.map((a) => ({
          position: a.position,
          width: a.width,
          height: a.height,
          fitness: a.fitness,
          energy: a.energy,
          age: a.age,
          generation: a.generation,
          species: a.species,
          genome: a.NeuralNetwork.getGenomeData()
        }))
      )
    }

    const newSaves = [...saves, saveData]
    setSaves(newSaves)
    localStorage.setItem('evo_saves', JSON.stringify(newSaves))
    console.log('[SaveLoadPanel] Save successful')
  }

  const handleLoad = (saveData: string): void => {
    try {
      console.log('[SaveLoadPanel] Loading save data')
      const data = JSON.parse(saveData) as SavedAgentData[]
      const loadedAgents = data.map((d: SavedAgentData) => {
        const agent = new Agent(d.position.x, d.position.y, d.width, d.height)
        agent.position.rotation = d.position.rotation
        agent.fitness = d.fitness
        agent.energy = d.energy
        agent.age = d.age
        agent.generation = d.generation
        agent.species = d.species

        // Restore neural network weights from genome
        if (d.genome) {
          const genome = d.genome
          let idx = 0
          for (const level of agent.NeuralNetwork.levels) {
            for (let i = 0; i < level.biases.length; i++) {
              level.biases[i] = genome[idx++]
            }
            for (let i = 0; i < level.weights.length; i++) {
              for (let j = 0; j < level.weights[i].length; j++) {
                level.weights[i][j] = genome[idx++]
              }
            }
          }
        }

        return agent
      })
      console.log(`[SaveLoadPanel] Successfully loaded ${loadedAgents.length} agents`)
      onLoad(loadedAgents)
    } catch (e) {
      console.error('[SaveLoadPanel] Failed to load save:', e)
      alert('Failed to load save')
    }
  }

  const handleDelete = (index: number): void => {
    console.log(`[SaveLoadPanel] Deleting save: ${saves[index].name}`)
    const newSaves = saves.filter((_, i) => i !== index)
    setSaves(newSaves)
    localStorage.setItem('evo_saves', JSON.stringify(newSaves))
  }

  const handleExport = (): void => {
    console.log(`[SaveLoadPanel] Exporting ${agents.length} agents to JSON file`)
    const dataStr = JSON.stringify(
      agents.map((a) => ({
        position: a.position,
        fitness: a.fitness,
        energy: a.energy,
        genome: a.NeuralNetwork.getGenomeData()
      })),
      null,
      2
    )

    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evo_export_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    console.log('[SaveLoadPanel] Export complete')
  }

  const handleImport = (): void => {
    console.log('[SaveLoadPanel] Opening file import dialog')
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e: Event): void => {
      const target = e.target as HTMLInputElement
      const file = target.files?.[0]
      if (!file) return

      console.log(`[SaveLoadPanel] Importing file: ${file.name}`)
      const reader = new FileReader()
      reader.onload = (e: ProgressEvent<FileReader>): void => {
        try {
          const result = e.target?.result as string
          const data = JSON.parse(result)
          handleLoad(JSON.stringify(data))
        } catch (err) {
          console.error('[SaveLoadPanel] Import failed - invalid file format:', err)
          alert('Invalid file format')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="sidebar-section save-load-panel">
      <div
        className="section-header"
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', marginBottom: expanded ? '0.75rem' : '0' }}
      >
        <h3 className="section-title">Save / Load</h3>
        <i
          className={`bi bi-chevron-${expanded ? 'up' : 'down'}`}
          style={{ color: '#555', fontSize: '0.7rem' }}
        ></i>
      </div>

      {expanded && (
        <>
          <div
            className="save-controls"
            style={{ display: 'flex', gap: '4px', marginBottom: '0.5rem' }}
          >
            <button
              className="btn-control"
              onClick={handleSave}
              style={{ flex: 1, fontSize: '0.65rem', padding: '4px' }}
            >
              Save
            </button>
            <button
              className="btn-control"
              onClick={handleExport}
              style={{ flex: 1, fontSize: '0.65rem', padding: '4px' }}
            >
              Export
            </button>
            <button
              className="btn-control"
              onClick={handleImport}
              style={{ flex: 1, fontSize: '0.65rem', padding: '4px' }}
            >
              Import
            </button>
          </div>

          {saves.length > 0 && (
            <div className="saves-list" style={{ maxHeight: '100px', overflowY: 'auto' }}>
              {saves.map((save, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.35rem 0',
                    borderBottom: '1px solid #1a1a1a',
                    fontSize: '0.7rem'
                  }}
                >
                  <span style={{ color: '#888' }}>{save.name}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => handleLoad(save.data)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#00ff88',
                        cursor: 'pointer',
                        padding: '2px'
                      }}
                    >
                      <i className="bi bi-play-fill"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ff4444',
                        cursor: 'pointer',
                        padding: '2px'
                      }}
                    >
                      <i className="bi bi-x"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
