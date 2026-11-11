import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PANELS_OPEN, PanelToggles, openPanel, parsePanels, togglePanel } from '../src/index'

describe('panel state', () => {
  it('toggles one panel and leaves the others', () => {
    const left = togglePanel(PANELS_OPEN, 'left')
    expect(left).toEqual({ left: true, right: false, strip: false })
    expect(togglePanel(left, 'left')).toEqual(PANELS_OPEN)
    expect(togglePanel(left, 'strip')).toEqual({ left: true, right: false, strip: true })
    // pure: the input is not changed
    expect(PANELS_OPEN).toEqual({ left: false, right: false, strip: false })
  })

  it('opens a collapsed panel, and is the same object when it is already open', () => {
    const closed = togglePanel(PANELS_OPEN, 'right')
    expect(openPanel(closed, 'right')).toEqual(PANELS_OPEN)
    expect(openPanel(PANELS_OPEN, 'right')).toBe(PANELS_OPEN)
    // opening the inspector does not open the other collapsed panels
    const both = togglePanel(closed, 'left')
    expect(openPanel(both, 'right')).toEqual({ left: true, right: false, strip: false })
  })

  it('reads a stored value strictly: only true collapses', () => {
    expect(parsePanels({ left: true, right: false })).toEqual({
      left: true,
      right: false,
      strip: false
    })
    expect(parsePanels({ left: 'true', right: 1, strip: {} })).toEqual(PANELS_OPEN)
    expect(parsePanels(undefined)).toEqual(PANELS_OPEN)
    expect(parsePanels('left')).toEqual(PANELS_OPEN)
  })
})

describe('PanelToggles', () => {
  const html = (collapsed = PANELS_OPEN): string =>
    renderToStaticMarkup(<PanelToggles collapsed={collapsed} onToggle={() => undefined} />)

  it('has one button per panel, each pressed while its panel is shown', () => {
    const open = html()
    expect(open.match(/<button/g)).toHaveLength(3)
    expect(open.match(/aria-pressed="true"/g)).toHaveLength(3)
    expect(open).toContain('aria-label="Hide left panel"')
    expect(open).toContain('aria-label="Hide inspector"')
    expect(open).toContain('aria-label="Hide charts"')
  })

  it('says Show and is not pressed for a collapsed panel, and only for that one', () => {
    const closed = html({ left: true, right: false, strip: false })
    expect(closed.match(/aria-pressed="false"/g)).toHaveLength(1)
    expect(closed).toContain('aria-label="Show left panel"')
    expect(closed).toContain('aria-label="Hide inspector"')
  })

  it('names each key shortcut for assistive technology and in the tooltip', () => {
    const markup = html()
    expect(markup).toContain('aria-keyshortcuts="["')
    expect(markup).toContain('aria-keyshortcuts="]"')
    expect(markup).toContain('title="Hide charts (\\)"')
  })
})
