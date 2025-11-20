import React, { useState } from 'react'
import { Agent } from '../core/Agent'

interface SaveLoadPanelProps {
  agents: Agent[]
  onLoad: (agents: Agent[]) => void
}

export const SaveLoadPanel: React.FC<SaveLoadPanelProps> = ({ agents, onLoad }) => {
  const [saves, setSaves] = useState<{ name: string; date: string; data: string }[]>(() => {
    const saved = localStorage.getItem('evo_saves')
    return saved ? JSON.parse(saved) : []
  })

  const handleSave = () => {
    const name = prompt('Enter save name:')
    if (!name) return

    console.log(`[SaveLoadPanel] Saving ${agents.length} agents as "${name}"`)

    const saveData = {
      name,
      date: new Date().toISOString(),
      data: JSON.stringify(agents.map(a => ({
        position: a.position,
        width: a.width,
        height: a.height,
        fitness: a.fitness,
        energy: a.energy,
        age: a.age,
        generation: a.generation,
        species: a.species,
        genome: a.NeuralNetwork.getGenomeData()
      })))
    }

    const newSaves = [...saves, saveData]
    setSaves(newSaves)
    localStorage.setItem('evo_saves', JSON.stringify(newSaves))
    console.log('[SaveLoadPanel] Save successful')
  }

  const handleLoad = (saveData: string) => {
    try {
      console.log('[SaveLoadPanel] Loading save data')
      const data = JSON.parse(saveData)
      const loadedAgents = data.map((d: any) => {
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

  const handleDelete = (index: number) => {
    console.log(`[SaveLoadPanel] Deleting save: ${saves[index].name}`)
    const newSaves = saves.filter((_, i) => i !== index)
    setSaves(newSaves)
    localStorage.setItem('evo_saves', JSON.stringify(newSaves))
  }

  const handleExport = () => {
    console.log(`[SaveLoadPanel] Exporting ${agents.length} agents to JSON file`)
    const dataStr = JSON.stringify(agents.map(a => ({
      position: a.position,
      fitness: a.fitness,
      energy: a.energy,
      genome: a.NeuralNetwork.getGenomeData()
    })), null, 2)
    
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evo_export_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    console.log('[SaveLoadPanel] Export complete')
  }

  const handleImport = () => {
    console.log('[SaveLoadPanel] Opening file import dialog')
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e: any) => {
      const file = e.target.files[0]
      if (!file) return
      
      console.log(`[SaveLoadPanel] Importing file: ${file.name}`)
      const reader = new FileReader()
      reader.onload = (e: any) => {
        try {
          const data = JSON.parse(e.target.result)
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
    <div className="save-load-panel">
      <h4>Save / Load</h4>
      <div className="save-controls">
        <button className="btn-small" onClick={handleSave}>
          <i className="bi bi-save"></i> Save Current
        </button>
        <button className="btn-small" onClick={handleExport}>
          <i className="bi bi-download"></i> Export
        </button>
        <button className="btn-small" onClick={handleImport}>
          <i className="bi bi-upload"></i> Import
        </button>
      </div>
      
      {saves.length > 0 && (
        <div className="saves-list">
          {saves.map((save, idx) => (
            <div key={idx} className="save-item">
              <div className="save-info">
                <div className="save-name">{save.name}</div>
                <div className="save-date">{new Date(save.date).toLocaleString()}</div>
              </div>
              <div className="save-actions">
                <button onClick={() => handleLoad(save.data)}>
                  <i className="bi bi-arrow-clockwise"></i>
                </button>
                <button onClick={() => handleDelete(idx)}>
                  <i className="bi bi-trash"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
