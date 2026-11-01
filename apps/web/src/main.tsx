import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@evo/ui/styles.css'
import './styles.css'
import { App } from './App'
import { createBrowserHost } from './host/browserHost'

// One host for the life of the page. It is created outside React so that StrictMode's double
// rendering and effect replays can never create a second world.
const host = createBrowserHost()

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App host={host} />
    </StrictMode>
  )
}
