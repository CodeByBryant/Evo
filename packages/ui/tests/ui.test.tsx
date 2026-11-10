import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RENDER_LAYERS } from '@evo/contracts'
import {
  ClusterPanel,
  DeathCauses,
  Dock,
  ExtinctionBanner,
  Hud,
  Inspector,
  InspectorEmpty,
  LAPTOP_MAX_WIDTH,
  LayerPanel,
  PHONE_MAX_WIDTH,
  PopulationChart,
  SpeciesPanel,
  StatsPanel,
  Strip,
  TopBar,
  ViewTools,
  WorldPanel,
  barWidth,
  formatCount,
  formatNumber,
  formatTime,
  humanize,
  layoutFor,
  parseSeedInput,
  percent,
  polylinePoints,
  speedLabel,
  statusLabel,
  totalDeaths
} from '../src/index'
import { inspector, recorder, view } from './support/fixtures'

describe('formatting', () => {
  it('formats simulated time', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(61.9)).toBe('1:01')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(formatTime(-5)).toBe('0:00')
    expect(formatTime(Number.NaN)).toBe('0:00')
  })

  it('formats counts and numbers, and survives bad input', () => {
    expect(formatCount(1234567)).toBe('1,234,567')
    expect(formatCount(Number.NaN)).toBe('-')
    expect(formatNumber(1.23456, 2)).toBe('1.23')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('-')
  })

  it('labels speeds and statuses', () => {
    expect(speedLabel(25)).toBe('25×')
    expect(speedLabel('max')).toBe('Max')
    expect(statusLabel('running')).toBe('Running')
    expect(statusLabel('paused')).toBe('Paused')
    expect(statusLabel('extinct')).toBe('Extinct')
  })

  it('computes totals, percentages, bars and labels', () => {
    expect(totalDeaths(view().metrics)).toBe(350)
    expect(percent(1, 4)).toBe('25%')
    expect(percent(1, 0)).toBe('-')
    expect(barWidth(50, 100)).toBe('50.0%')
    expect(barWidth(500, 100)).toBe('100.0%')
    expect(barWidth(-5, 100)).toBe('0.0%')
    expect(barWidth(5, 0)).toBe('0%')
    expect(humanize('sensorRadius')).toBe('sensor radius')
    expect(humanize('x')).toBe('x')
  })

  it('parses seeds typed by a person', () => {
    expect(parseSeedInput('123')).toBe(123)
    expect(parseSeedInput(' 0 ')).toBe(0)
    expect(parseSeedInput('4294967295')).toBe(4294967295)
    for (const bad of ['', 'abc', '-1', '1.5', '4294967296', '99999999999', '1e3']) {
      expect(parseSeedInput(bad)).toBeNull()
    }
  })

  it('scales polylines into the box', () => {
    expect(polylinePoints([], 100, 50, 10)).toBe('')
    const points = polylinePoints([0, 10], 100, 50, 10).split(' ')
    expect(points).toEqual(['2.0,48.0', '98.0,2.0'])
    // a value above max is clamped to the top
    expect(polylinePoints([100], 100, 50, 10)).toBe('2.0,2.0')
  })
})

describe('components render', () => {
  it('top bar shows status, time, tick, season, seed and preset, and docks what it is given', () => {
    const html = renderToStaticMarkup(<TopBar view={view()} />)
    expect(html).toContain('Running')
    expect(html).toContain('20:34')
    expect(html).toContain('12,345')
    expect(html).toContain('autumn')
    expect(html).toContain('>7<')
    expect(html).toContain('>Balanced<')
    expect(html).not.toContain('evo-topbar-tools')
    expect(renderToStaticMarkup(<TopBar view={view({ season: null })} />)).not.toContain('Season')
    // an unknown preset name is shown as it is, not dropped
    expect(renderToStaticMarkup(<TopBar view={view({ preset: 'mystery' })} />)).toContain(
      '>mystery<'
    )
    const docked = renderToStaticMarkup(
      <TopBar view={view()}>
        <b>tools here</b>
      </TopBar>
    )
    expect(docked).toMatch(/evo-topbar-tools[^>]*><b>tools here<\/b>/)
  })

  it('dock reflects state and wires its buttons', () => {
    const { controls } = recorder()
    const running = renderToStaticMarkup(<Dock view={view()} controls={controls} />)
    expect(running).toContain('>Pause<')
    expect(running).toMatch(/<button[^>]*aria-pressed="true"[^>]*>25×/)
    expect(running).toMatch(/<button[^>]*disabled=""[^>]*>Step/)
    expect(running).toContain('<b>249</b> ticks/s')
    const paused = renderToStaticMarkup(
      <Dock view={view({ status: 'paused' })} controls={controls} />
    )
    expect(paused).toContain('>Start<')
    expect(paused).toContain('paused')
    expect(paused).not.toMatch(/<button[^>]*disabled=""[^>]*>Step/)
    const extinct = renderToStaticMarkup(
      <Dock view={view({ status: 'extinct' })} controls={controls} />
    )
    expect(extinct).toMatch(/<button[^>]*disabled=""[^>]*>Start/)
  })

  it('compact dock keeps only start or pause', () => {
    const { controls } = recorder()
    const compact = renderToStaticMarkup(<Dock view={view()} controls={controls} compact />)
    expect(compact).toContain('role="toolbar"')
    expect(compact).toContain('>Pause<')
    expect(compact).not.toContain('>Step<')
    expect(compact).not.toContain('aria-label="Speed"')
    expect(compact).not.toContain('ticks/s')
    const extinct = renderToStaticMarkup(
      <Dock view={view({ status: 'extinct' })} controls={controls} compact />
    )
    expect(extinct).toMatch(/<button[^>]*disabled=""[^>]*>Start/)
  })

  it('world panel offers the preset, the seed and a fresh start', () => {
    const { controls } = recorder()
    const html = renderToStaticMarkup(<WorldPanel view={view()} controls={controls} />)
    expect(html).toContain('Harsh')
    expect(html).toContain('The default world.')
    expect(html).toContain('Same seed and preset, same world, every time.')
    expect(html).toContain('>New seed<')
    expect(html).toContain('>Reset<')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Go/)
  })

  it('hud shows the three headline numbers and no chart (the chart is in the strip)', () => {
    const html = renderToStaticMarkup(<Hud view={view()} />)
    expect(html).toContain('>31<')
    expect(html).toContain('>120<')
    expect(html).toContain('+1 extinct')
    expect(html).not.toContain('<svg')
  })

  it('statistics lists the running totals, without the death causes or a chart', () => {
    const html = renderToStaticMarkup(<StatsPanel view={view()} />)
    expect(html).toContain('>400<') // born
    expect(html).toContain('>350<') // died: 200 + 100 + 50
    expect(html).toContain('25%')
    expect(html).toContain('Food eaten')
    expect(html).not.toContain('Starved')
    expect(html).not.toContain('<svg')
  })

  it('death causes show each count, its share and a bar that long', () => {
    const html = renderToStaticMarkup(<DeathCauses view={view()} />)
    expect(html).toMatch(/Starved.*>200<small[^>]*> 57%/s)
    expect(html).toMatch(/Old age.*>100<small[^>]*> 29%/s)
    expect(html).toMatch(/Damage.*>50<small[^>]*> 14%/s)
    expect(html).toContain('width:57.1')
    // no deaths yet: no share to show and empty bars, not a division by zero
    const none = renderToStaticMarkup(
      <DeathCauses
        view={view({
          metrics: {
            ...view().metrics,
            deathsByStarvation: 0,
            deathsByAge: 0,
            deathsByDamage: 0
          }
        })}
      />
    )
    expect(none).not.toContain('NaN')
    expect(none).toContain('width:0')
  })

  it('strip shows the population chart and the death causes, and clusters only in a cluster world', () => {
    const html = renderToStaticMarkup(<Strip view={view()} />)
    expect(html).toContain('aria-label="Charts"')
    expect(html).toContain('Population over time: now 31, highest 31, lowest 20')
    expect(html).toContain('Deaths by cause')
    expect(html).toContain('>350<')
    expect(html).not.toContain('Cluster 1')
    const clusters = renderToStaticMarkup(
      <Strip
        view={view({
          clusters: { clusters: [{ index: 0, alive: 12, inVoid: 0 }], species: [], meanPurity: 1 }
        })}
      />
    )
    expect(clusters).toContain('Cluster 1')
    expect(renderToStaticMarkup(<Strip view={view({ populationHistory: [] })} />)).toContain(
      'no data yet'
    )
  })

  it('population chart explains an empty history', () => {
    expect(renderToStaticMarkup(<PopulationChart points={[]} />)).toContain('no data yet')
  })

  it('species panel lists species with colors and highlights the selected one', () => {
    const html = renderToStaticMarkup(<SpeciesPanel view={view({ selected: inspector() })} />)
    expect(html).toContain('#ff7ab8')
    expect(html).toContain('from #0')
    expect(html).toMatch(/evo-species-selected[^>]*>.*#3/s)
    expect(renderToStaticMarkup(<SpeciesPanel view={view({ species: [] })} />)).toContain(
      'No living species'
    )
  })

  it('layer panel has a checkbox per layer and no camera buttons', () => {
    const { controls } = recorder()
    const html = renderToStaticMarkup(<LayerPanel view={view()} controls={controls} />)
    expect(html.match(/type="checkbox"/g)).toHaveLength(RENDER_LAYERS.length)
    expect(html).toContain('Debug overlay')
    expect(html).not.toContain('<button')
  })

  it('camera buttons: fit always, focus and follow only with a selection', () => {
    const { controls } = recorder()
    const html = renderToStaticMarkup(<ViewTools view={view()} controls={controls} />)
    expect(html).toContain('aria-label="Camera"')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Fit/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Focus/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Follow/)
    const selected = renderToStaticMarkup(
      <ViewTools view={view({ selectedId: 42 })} controls={controls} />
    )
    expect(selected).not.toMatch(/<button[^>]*disabled=""[^>]*>Focus/)
    expect(selected).not.toMatch(/<button[^>]*disabled=""[^>]*>Follow/)
    // still following after the organism was deselected: Follow stays usable so it can be switched off
    const following = renderToStaticMarkup(
      <ViewTools view={view({ following: true })} controls={controls} />
    )
    expect(following).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Follow/)
    expect(following).not.toMatch(/<button[^>]*disabled=""[^>]*>Follow/)
  })

  it('extinction banner appears only when extinct, as an alert with a way out', () => {
    const { controls } = recorder()
    expect(renderToStaticMarkup(<ExtinctionBanner view={view()} controls={controls} />)).toBe('')
    const html = renderToStaticMarkup(
      <ExtinctionBanner
        view={view({ status: 'extinct', extinctionTick: 9000, tick: 9000 })}
        controls={controls}
      />
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('tick 9,000')
    expect(html).toContain('New world')
    expect(html).toContain('Replay this seed')
  })

  it('inspector renders nothing without a selection and the overview with one', () => {
    const { controls } = recorder()
    expect(renderToStaticMarkup(<Inspector inspector={null} controls={controls} />)).toBe('')
    const html = renderToStaticMarkup(<Inspector inspector={inspector()} controls={controls} />)
    expect(html).toContain('Organism #42')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('55 / 100')
    expect(html).toContain('role="meter"')
    expect(html).toContain('aria-label="Close inspector"')
  })

  it('the empty inspector says nothing is selected and how to select', () => {
    const html = renderToStaticMarkup(<InspectorEmpty />)
    expect(html).toContain('Nothing selected')
    expect(html).toContain('Click an organism')
    expect(html).not.toContain('role="tablist"')
  })
})

describe('layoutFor', () => {
  it('gives the three arrangements, with both edges on the right side', () => {
    expect(layoutFor(390)).toBe('phone')
    expect(layoutFor(PHONE_MAX_WIDTH)).toBe('phone')
    expect(layoutFor(PHONE_MAX_WIDTH + 1)).toBe('laptop')
    expect(layoutFor(1100)).toBe('laptop')
    expect(layoutFor(LAPTOP_MAX_WIDTH)).toBe('laptop')
    expect(layoutFor(LAPTOP_MAX_WIDTH + 1)).toBe('wide')
    expect(layoutFor(2560)).toBe('wide')
  })

  it('treats a width that is not a number as a phone', () => {
    expect(layoutFor(Number.NaN)).toBe('phone')
    expect(layoutFor(0)).toBe('phone')
  })
})

describe('ClusterPanel', () => {
  it('renders nothing in the field layout', () => {
    expect(renderToStaticMarkup(<ClusterPanel view={view({ clusters: null })} />)).toBe('')
  })

  it('lists every cluster with its population, the void count and the mean purity', () => {
    const html = renderToStaticMarkup(
      <ClusterPanel
        view={view({
          clusters: {
            clusters: [
              { index: 0, alive: 12, inVoid: 3 },
              { index: 1, alive: 0, inVoid: 0 }
            ],
            species: [],
            meanPurity: 0.874
          }
        })}
      />
    )
    expect(html).toContain('Cluster 1')
    expect(html).toContain('3 in void')
    expect(html).toContain('Cluster 2')
    expect(html).toContain('empty')
    expect(html).toContain('Purity 87%')
  })
})
