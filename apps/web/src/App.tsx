import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  ControlPanel,
  ExtinctionBanner,
  Inspector,
  LayerPanel,
  SpeciesPanel,
  StatsPanel,
  TopBar
} from '@evo/ui'
import { Viewport } from './Viewport'
import type { SimulationHost } from './host/SimulationHost'
import { safeLocalStorage } from './host/browserHost'
import { applyKeyAction, keyAction } from './host/keys'
import { savePrefs } from './host/prefs'

/** The host's view state as React state: updated a few times a second, never per tick. */
function useViewState(host: SimulationHost) {
  const subscribe = useCallback((listener: () => void) => host.subscribe(listener), [host])
  const getSnapshot = useCallback(() => host.getViewState(), [host])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function useShortcuts(host: SimulationHost): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null
      const action = keyAction({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        targetTag: target?.tagName ?? '',
        targetEditable: target?.isContentEditable ?? false
      })
      if (action === null) return
      // A focused button handles Space itself; do not also toggle the simulation.
      if (action.type === 'toggle' && target?.tagName === 'BUTTON') return
      event.preventDefault()
      applyKeyAction(action, host, host.getViewState())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [host])
}

export function App({ host }: { host: SimulationHost }): React.JSX.Element {
  const view = useViewState(host)
  useShortcuts(host)

  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 800px)').matches
  )

  // Remember the layers and speed for next time; a viewer's convenience, never needed to run.
  useEffect(() => {
    savePrefs(safeLocalStorage(), { layers: view.layers, speed: view.speed })
  }, [view.layers, view.speed])

  return (
    <div className="app">
      <TopBar view={view} />
      <div className="app-body">
        <aside
          id="app-sidebar"
          className="app-sidebar"
          aria-label="Controls and statistics"
          hidden={!sidebarOpen}
        >
          <ControlPanel view={view} controls={host} />
          <StatsPanel view={view} />
          <SpeciesPanel view={view} />
          <LayerPanel view={view} controls={host} />
          <p className="app-help">
            Keys: Space pause, . step, 1-5 speed, Esc deselect, T trails, F follow, Z focus, 0 fit.
            Drag to pan, wheel or pinch to zoom, click an organism to inspect it.
          </p>
        </aside>
        <main className="app-stage">
          <Viewport host={host} layers={view.layers} />
          <button
            type="button"
            className="evo-button app-panels-toggle"
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            onClick={() => setSidebarOpen((open) => !open)}
          >
            {sidebarOpen ? 'Hide panels' : 'Panels'}
          </button>
          <div className="app-overlay">
            <ExtinctionBanner view={view} controls={host} />
          </div>
        </main>
        {view.selected !== null && (
          <div className="app-inspector">
            <Inspector inspector={view.selected} controls={host} />
          </div>
        )}
      </div>
    </div>
  )
}
