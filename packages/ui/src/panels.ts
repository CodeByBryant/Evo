/**
 * Which of the three docked panels are collapsed (docs/architecture/interface-design.md). Pure, so
 * every rule is unit-tested without a browser. A collapsed panel takes no room: the world gets it.
 */
export type PanelName = 'left' | 'right' | 'strip'

export const PANEL_NAMES: readonly PanelName[] = ['left', 'strip', 'right']

/** `true` means collapsed. */
export type PanelState = Readonly<Record<PanelName, boolean>>

export const PANELS_OPEN: PanelState = { left: false, right: false, strip: false }

export function togglePanel(state: PanelState, name: PanelName): PanelState {
  return { ...state, [name]: !state[name] }
}

/** Opens one panel; the same object when it already is, so a state setter can skip the render. */
export function openPanel(state: PanelState, name: PanelName): PanelState {
  return state[name] ? { ...state, [name]: false } : state
}

/** A stored value as a panel state: anything missing or not a boolean stays open. */
export function parsePanels(value: unknown): PanelState {
  if (typeof value !== 'object' || value === null) return PANELS_OPEN
  const record = value as Record<string, unknown>
  const pick = (name: PanelName): boolean => record[name] === true
  return { left: pick('left'), right: pick('right'), strip: pick('strip') }
}

export const PANEL_LABELS: Readonly<Record<PanelName, string>> = {
  left: 'left panel',
  right: 'inspector',
  strip: 'charts'
}

/** The key that toggles each panel (see `host/keys.ts`). */
export const PANEL_KEYS: Readonly<Record<PanelName, string>> = {
  left: '[',
  right: ']',
  strip: '\\'
}
