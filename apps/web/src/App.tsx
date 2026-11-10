import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  Dock,
  ExtinctionBanner,
  Hud,
  Inspector,
  InspectorEmpty,
  LayerPanel,
  SpeciesPanel,
  StatsPanel,
  Strip,
  TopBar,
  ViewTools,
  WorldPanel,
  layoutFor
} from '@evo/ui'
import type { LayoutKind } from '@evo/ui'
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

/** Nothing floats over the canvas in the docked layout, so the camera has the whole of it. */
const NO_INSETS = { left: 0, right: 0, top: 0, bottom: 0 }

/** Which arrangement the window gets (wide, laptop or phone), kept current as it is resized. */
function useLayout(): LayoutKind {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener('resize', listener)
    return () => window.removeEventListener('resize', listener)
  }, [])
  return useSyncExternalStore<LayoutKind>(
    subscribe,
    () => layoutFor(window.innerWidth),
    () => 'wide'
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

  const phone = useLayout() === 'phone'
  // On a phone the left rail is a sheet, closed until asked for; on wider windows it is always there.
  const [sheetOpen, setSheetOpen] = useState(false)
  const leftShown = !phone || sheetOpen

  // Remember the layers and speed for next time; a viewer's convenience, never needed to run.
  useEffect(() => {
    savePrefs(safeLocalStorage(), { layers: view.layers, speed: view.speed })
  }, [view.layers, view.speed])

  return (
    <div className="app">
      <div className="app-top">
        <TopBar view={view}>
          <Dock view={view} controls={host} compact={phone} />
          <button
            type="button"
            className="evo-button app-panels-toggle"
            aria-expanded={sheetOpen}
            aria-controls="app-left"
            onClick={() => setSheetOpen((open) => !open)}
          >
            {sheetOpen ? 'Close' : 'Panels'}
          </button>
        </TopBar>
      </div>
      <aside
        id="app-left"
        className="app-left"
        aria-label="World settings and statistics"
        hidden={!leftShown}
      >
        {phone && <Dock view={view} controls={host} />}
        <Hud view={view} />
        <WorldPanel view={view} controls={host} />
        <SpeciesPanel view={view} />
        <LayerPanel view={view} controls={host} />
        <StatsPanel view={view} />
        {phone && <Strip view={view} />}
        <p className="app-help">
          Keys: Space pause, . step, 1-5 speed, Esc deselect, T trails, F follow, Z focus, 0 fit.
          Drag to pan, wheel or pinch to zoom, click an organism to inspect it.
        </p>
      </aside>
      <main className="app-world">
        <Viewport host={host} layers={view.layers} insets={NO_INSETS} />
        <div className="app-viewtools">
          <ViewTools view={view} controls={host} />
        </div>
        <div className="app-overlay">
          <ExtinctionBanner view={view} controls={host} />
        </div>
      </main>
      {!phone && (
        <div className="app-strip">
          <Strip view={view} />
        </div>
      )}
      {(!phone || view.selected !== null) && (
        <div className="app-right">
          {view.selected !== null ? (
            <Inspector inspector={view.selected} controls={host} />
          ) : (
            <InspectorEmpty />
          )}
        </div>
      )}
    </div>
  )
}
