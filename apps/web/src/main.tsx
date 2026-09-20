import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { World } from '@evo/simulation'

const world = new World({ seed: 0 })
const root = document.getElementById('root')

if (root) {
  createRoot(root).render(
    <StrictMode>
      <h1>Evo</h1>
      <p>Simulation kernel not implemented yet (seed {world.seed}).</p>
    </StrictMode>
  )
}
