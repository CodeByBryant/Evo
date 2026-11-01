import { describe, expect, it } from 'vitest'
import type { ViewState } from '@evo/contracts'
import { applyKeyAction, keyAction } from '../src/host/keys'
import type { KeyInput } from '../src/host/keys'

const press = (key: string, extra: Partial<KeyInput> = {}): ReturnType<typeof keyAction> =>
  keyAction({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    targetTag: 'BODY',
    targetEditable: false,
    ...extra
  })

describe('keyboard shortcuts', () => {
  it('maps the documented keys', () => {
    expect(press(' ')).toEqual({ type: 'toggle' })
    expect(press('.')).toEqual({ type: 'step' })
    expect(press('Escape')).toEqual({ type: 'deselect' })
    expect(press('t')).toEqual({ type: 'trails' })
    expect(press('T')).toEqual({ type: 'trails' })
    expect(press('f')).toEqual({ type: 'follow' })
    expect(press('z')).toEqual({ type: 'focus' })
    expect(press('0')).toEqual({ type: 'fit' })
    expect(press('1')).toEqual({ type: 'speed', speed: 1 })
    expect(press('3')).toEqual({ type: 'speed', speed: 25 })
    expect(press('5')).toEqual({ type: 'speed', speed: 'max' })
  })

  it('ignores unknown keys and browser shortcuts', () => {
    expect(press('q')).toBeNull()
    expect(press('6')).toBeNull()
    expect(press('Enter')).toBeNull()
    expect(press(' ', { ctrlKey: true })).toBeNull()
    expect(press('f', { metaKey: true })).toBeNull()
    expect(press('t', { altKey: true })).toBeNull()
  })

  it('does not fire while typing', () => {
    expect(press(' ', { targetTag: 'INPUT' })).toBeNull()
    expect(press('1', { targetTag: 'TEXTAREA' })).toBeNull()
    expect(press('f', { targetTag: 'SELECT' })).toBeNull()
    expect(press('f', { targetEditable: true })).toBeNull()
  })

  it('applies an action to the controls', () => {
    const calls: string[] = []
    const controls = {
      start: () => undefined,
      pause: () => undefined,
      toggle: () => calls.push('toggle'),
      step: () => calls.push('step'),
      reset: () => undefined,
      newWorld: () => undefined,
      setSpeed: (s: unknown) => calls.push(`speed:${String(s)}`),
      setPreset: () => undefined,
      select: (id: unknown) => calls.push(`select:${String(id)}`),
      setLayer: (l: string, on: boolean) => calls.push(`layer:${l}:${on}`),
      focusSelected: () => calls.push('focus'),
      toggleFollow: () => calls.push('follow'),
      fitWorld: () => calls.push('fit')
    }
    const view = { layers: { trails: false } } as unknown as ViewState
    for (const action of [
      { type: 'toggle' },
      { type: 'step' },
      { type: 'deselect' },
      { type: 'trails' },
      { type: 'follow' },
      { type: 'fit' },
      { type: 'focus' },
      { type: 'speed', speed: 100 }
    ] as const) {
      applyKeyAction(action, controls, view)
    }
    expect(calls).toEqual([
      'toggle',
      'step',
      'select:null',
      'layer:trails:true',
      'follow',
      'fit',
      'focus',
      'speed:100'
    ])
  })
})
