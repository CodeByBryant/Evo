import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  ClusterPanel,
  Dock,
  ExtinctionBanner,
  Hud,
  Inspector,
  LayerPanel,
  SpeciesPanel,
  StatsPanel,
  TopBar,
  WorldPanel
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

/** Width of the left column and the height the dock takes at the bottom, in pixels. */
const SIDEBAR_WIDTH = 264
const DOCK_CLEARANCE = 64

/** Whether the window is phone-narrow, where panels become sheets. */
function useNarrow(): boolean {
  const query = '(max-width: 800px)'
  const subscribe = useCallback((listener: () => void) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', listener)
    return () => list.removeEventListener('change', listener)
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
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

  const narrow = useNarrow()
  const [sidebarOpen, setSidebarOpen] = useState(() => !narrow)
  // The left column covers part of the world on wide screens (it is a sheet on narrow ones).
  const insets = useMemo(
    () => ({
      left: sidebarOpen && !narrow ? SIDEBAR_WIDTH : 0,
      right: 0,
      top: 0,
      bottom: DOCK_CLEARANCE
    }),
    [sidebarOpen, narrow]
  )

  // Remember the layers and speed for next time; a viewer's convenience, never needed to run.
  useEffect(() => {
    savePrefs(safeLocalStorage(), { layers: view.layers, speed: view.speed })
  }, [view.layers, view.speed])

  return (
    <div className="app">
      <main className="app-stage">
        <Viewport host={host} layers={view.layers} insets={insets} />
      </main>
      <div className="app-topleft">
        <TopBar view={view} />
      </div>
      <div className="app-topright">
        <Hud view={view} />
      </div>
      <aside
        id="app-sidebar"
        className="app-sidebar"
        aria-label="World settings and statistics"
        hidden={!sidebarOpen}
      >
        <WorldPanel view={view} controls={host} />
        <SpeciesPanel view={view} />
        <ClusterPanel view={view} />
        <LayerPanel view={view} controls={host} />
        <StatsPanel view={view} />
        <p className="app-help">
          Keys: Space pause, . step, 1-5 speed, Esc deselect, T trails, F follow, Z focus, 0 fit.
          Drag to pan, wheel or pinch to zoom, click an organism to inspect it.
        </p>
      </aside>
      <button
        type="button"
        className="evo-button app-panels-toggle"
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
        onClick={() => setSidebarOpen((open) => !open)}
      >
        {sidebarOpen ? 'Hide panels' : 'Panels'}
      </button>
      {view.selected !== null && (
        <div className="app-inspector">
          <Inspector inspector={view.selected} controls={host} />
        </div>
      )}
      <div className="app-dock">
        <Dock view={view} controls={host} />
      </div>
      <div className="app-overlay">
        <ExtinctionBanner view={view} controls={host} />
      </div>
    </div>
  )
}
