import type { SimulationControls, SpeedSetting, ViewState } from '@evo/contracts'

/** What a key press asks for. Returned rather than executed so the mapping is testable on its own. */
export type KeyAction =
  | { readonly type: 'toggle' }
  | { readonly type: 'step' }
  | { readonly type: 'deselect' }
  | { readonly type: 'trails' }
  | { readonly type: 'follow' }
  | { readonly type: 'fit' }
  | { readonly type: 'focus' }
  | { readonly type: 'speed'; readonly speed: SpeedSetting }

export interface KeyInput {
  readonly key: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  /** The element the key was pressed on, as its tag name (upper case) and whether it is editable. */
  readonly targetTag: string
  readonly targetEditable: boolean
}

const SPEEDS: Readonly<Record<string, SpeedSetting>> = {
  '1': 1,
  '2': 5,
  '3': 25,
  '4': 100,
  '5': 'max'
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * The keyboard shortcuts: Space pause/resume, `.` step, Esc deselect, `t` trails, `f` follow,
 * `z` focus, `0` fit, `1`-`5` speeds. Ignored while typing in a field and with Ctrl/Alt/Meta held,
 * so browser and screen-reader shortcuts keep working.
 */
export function keyAction(input: KeyInput): KeyAction | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null
  if (input.targetEditable || TYPING_TAGS.has(input.targetTag)) return null
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key
  if (key === ' ' || key === 'Spacebar') return { type: 'toggle' }
  if (key === '.') return { type: 'step' }
  if (key === 'Escape') return { type: 'deselect' }
  if (key === 't') return { type: 'trails' }
  if (key === 'f') return { type: 'follow' }
  if (key === 'z') return { type: 'focus' }
  if (key === '0') return { type: 'fit' }
  const speed = SPEEDS[key]
  return speed === undefined ? null : { type: 'speed', speed }
}

export function applyKeyAction(
  action: KeyAction,
  controls: SimulationControls,
  view: ViewState
): void {
  switch (action.type) {
    case 'toggle':
      controls.toggle()
      break
    case 'step':
      controls.step()
      break
    case 'deselect':
      controls.select(null)
      break
    case 'trails':
      controls.setLayer('trails', !view.layers.trails)
      break
    case 'follow':
      controls.toggleFollow()
      break
    case 'fit':
      controls.fitWorld()
      break
    case 'focus':
      controls.focusSelected()
      break
    case 'speed':
      controls.setSpeed(action.speed)
      break
  }
}
