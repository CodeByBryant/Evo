import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  Dock,
  ExtinctionBanner,
  Hud,
  Inspector,
  InspectorEmpty,
  LayerPanel,
  PANELS_OPEN,
  PanelToggles,
  SpeciesPanel,
  StatsPanel,
  Strip,
  TopBar,
  ViewTools,
  WorldPanel,
  layoutFor,
  openPanel,
  togglePanel
} from '@evo/ui'
import type { LayoutKind, PanelName, PanelState } from '@evo/ui'
import { Viewport } from './Viewport'
import type { SimulationHost } from './host/SimulationHost'
import { safeLocalStorage } from './host/browserHost'
import { applyKeyAction, keyAction } from './host/keys'
import { loadPrefs, savePrefs } from './host/prefs'

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

function useShortcuts(host: SimulationHost, onPanel: (panel: PanelName) => void): void {
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
      if (action.type === 'panel') onPanel(action.panel)
      else applyKeyAction(action, host, host.getViewState())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [host, onPanel])
}

export function App({ host }: { host: SimulationHost }): React.JSX.Element {
  const view = useViewState(host)
  const phone = useLayout() === 'phone'

  // Which docked panels the viewer has collapsed (remembered). On a phone the panels are sheets and
  // the inspector has its own close, so nothing is ever collapsed there.
  const [stored, setStored] = useState<PanelState>(
    () => loadPrefs(safeLocalStorage()).panels ?? PANELS_OPEN
  )
  const collapsed = phone ? PANELS_OPEN : stored
  const onPanel = useCallback((name: PanelName) => setStored((s) => togglePanel(s, name)), [])
  useShortcuts(host, onPanel)

  // Selecting something opens the inspector if it was collapsed: a click should show its answer.
  useEffect(() => {
    if (view.selectedId !== null) setStored((s) => openPanel(s, 'right'))
  }, [view.selectedId])

  // On a phone the left rail is a sheet, closed until asked for; on wider windows it is always there.
  const [sheetOpen, setSheetOpen] = useState(false)
  const leftShown = phone ? sheetOpen : !collapsed.left

  // Remember the layers and speed for next time; a viewer's convenience, never needed to run.
  useEffect(() => {
    savePrefs(safeLocalStorage(), { layers: view.layers, speed: view.speed, panels: stored })
  }, [view.layers, view.speed, stored])

  return (
    <div
      className="app"
      data-left={collapsed.left ? 'closed' : 'open'}
      data-right={collapsed.right ? 'closed' : 'open'}
      data-strip={collapsed.strip ? 'closed' : 'open'}
    >
      <div className="app-top">
        <TopBar view={view}>
          <Dock view={view} controls={host} compact={phone} />
          {!phone && <PanelToggles collapsed={collapsed} onToggle={onPanel} />}
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
          Keys: Space pause, . step, 1-5 speed, Esc deselect, T trails, F follow, Z focus, 0 fit, [
          ] \\ hide the panels. Drag to pan, wheel or pinch to zoom, click an organism to inspect
          it.
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
      {!phone && !collapsed.strip && (
        <div className="app-strip">
          <Strip view={view} />
        </div>
      )}
      {(phone ? view.selected !== null : !collapsed.right) && (
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
