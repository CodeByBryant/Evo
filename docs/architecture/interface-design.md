# Interface and organism design

The web application is a flat black interface over a living world. This note records the design so the code, the tests and later changes agree on it. Nothing here touches the simulation: it reads the view state and the render snapshot and changes only how they look.

## Principles

1. **The world is the interface.** The canvas is the thing on screen; everything else is information around it, dense and quiet.
2. **Flat.** Black and near-black surfaces, one pixel hairlines, nothing that glows, blurs, fades into another colour or casts a shadow: no `box-shadow`, `text-shadow`, `filter`, `backdrop-filter`, gradient or additive blend, in the stylesheets, the components or the renderer. `tools/flat-design.test.mjs` scans the sources and fails the build if one comes back.
3. **One neutral accent.** What is active (the running state is the only green, the chosen speed, a switched-on layer, a meter fill) is light on dark: white on black, no hue. Colour is for data: species, food kinds, region types and status.
4. **Small corners.** 2 px for controls, 3 px for panels. No pills; squares for species swatches, circles only for status dots.
5. **Numbers do not jitter.** Every number uses tabular figures.
6. **Motion is optional.** Animation respects `prefers-reduced-motion` and the in-app Motion switch.

## Tokens

All colors, radii and type live in `packages/ui/src/theme.css` as custom properties on `:root`. Re-theming is a change to that one file.

| Token                                    | Value                           | Use                                |
| ---------------------------------------- | ------------------------------- | ---------------------------------- |
| `--evo-ink`                              | `#000`                          | page background                    |
| `--evo-ink-2`, `--evo-panel`             | `#0a0a0a`                       | panels (the rails)                 |
| `--evo-line`, `--evo-line-2`             | `#1f1f1f`, `#333`               | hairlines                          |
| `--evo-text`, `--evo-muted`, `--evo-dim` | `#ededed`, `#9a9a9a`, `#7a7a7a` | text                               |
| `--evo-accent`                           | `#ededed`                       | the active state (neutral, no hue) |
| `--evo-good/warn/bad`                    | `#6fd08c`, `#e6c15a`, `#e8645a` | state                              |

Type is the system sans and mono stacks (no web font is downloaded; the app stays offline-capable and the Pages artifact stays small).

## Layout

The interface is **docked**: a grid with the world in the middle and nothing floating over it except the camera buttons in its corner and the extinction notice.

```text
top    top    top        thin bar: brand, status, time, tick, season, seed, preset | playback
left   world  right      left rail | the canvas | right rail (the inspector)
left   strip  right                 | charts    |
```

| Window                  | Columns (left / world / right) | Rows (top / world / strip) |
| ----------------------- | ------------------------------ | -------------------------- |
| wide, 1280 px and up    | 248 / rest / 320               | 36 / rest / 196            |
| laptop, 801 to 1279 px  | 208 / rest / 288               | 32 / rest / 140            |
| phone, 800 px and under | one column                     | 44 / rest / inspector      |

- **Top bar:** the brand, the run status (the only green), time, tick, season, seed and preset as hairline-separated cells; on the right the playback toolbar: step, start or pause, speeds and the achieved ticks per second.
- **Left rail (scrolls):** Now (organisms, food, species), World (preset, seed, reset, new seed), Species, Layers, Statistics (running totals), key hints.
- **World:** the canvas is the grid cell, so the camera has all of it (no insets). Fit, Focus and Follow sit in its top-right corner. The world is fitted again whenever the cell changes size, unless the viewer has taken the camera (panned, zoomed or followed).
- **Strip:** four flat history charts and the per-cluster table in a cluster world: Population, Species and Food over the run (one sample of every series per point, so they line up), and Deaths by cause as **rates**: deaths per simulated minute over the last two minutes (a difference of the cumulative counters over simulated time, so it does not depend on how coarsely the run was sampled), each with its share of those deaths as a flat bar and the count since the start. On a narrow window the strip scrolls sideways inside itself.
- **Right rail:** the inspector, always there; with nothing selected it says so and how to select. Five tabs: **Body** (vitals, the body schematic, the **parent tree**, a part table with **mass and upkeep per part** and totals with the bare body, each part opening to its **stats in real units**, the **sight** of every working eye, and what the body does against the founder), Genome, Brain, Lineage and Env.
- **Species table** (left rail): id, trend line, members now, the species it came from, and how long ago it appeared (hidden at laptop width, where the rail is narrow).
- **Phone:** the top bar keeps the brand, status, time, start or pause and a Panels button. Panels opens the left rail as a sheet, with the full playback toolbar and the strip's panels in it. While an organism is selected the inspector takes the area under the world, so the world shrinks and is fitted again instead of being covered. Every control is at least 44 px tall.
- **Reading order is the screen order:** top bar, left rail, world (`main`), strip, right rail, so the Tab key walks the screen the way it is laid out.

The two widths live in `packages/ui/src/layout.ts` (`layoutFor`) and in the media queries of `apps/web/src/styles.css`; `tools/layout-breakpoints.test.mjs` holds them together.

## The world

The page is black and the world is a barely lighter rectangle with a hairline edge. Regions are drawn as crisp cells at the data's own resolution (nearest-neighbour sampling, not a smoothed blend, which would read as a gradient), in muted colours that stay dark enough for creatures and food to stand out. Food keeps its kind colours and the selected creature gets a white ring: colour is data.

## Organisms

Creatures are drawn as flat cells, not shapes with icons stuck on:

- **Body:** the evolved outline in one solid colour (the creature's `hue` gene), the painted pattern as flat shapes on it, a darker disc toward the front so the heading reads, and a thin darker outline. No layers of depth, granules, halo, glow or drop shadow. Energy fades the whole creature a little; that is data, not styling.
- **Parts grow out of the body:** a tapered **flagellum** that waves (faster when the creature moves faster), a **cilia** fringe beating as a wave, **antennae** that sway, an **eye** with a pupil and an occasional blink, a **mouth** that opens and closes, a **stomach vacuole** whose fill is the creature's energy, **armor** plates, a membrane outline that pulses and a **mender** cross. Dormant parts are drawn faded and still, so dead weight is visible.
- **Parts ride their parents:** a part that hangs from another part (an eye on a sniffer on a flagellum, an eye on a stalk) is drawn on its parent's _animated_ pose, at the same fraction along the parent that it was developed at, and keeps its direction relative to it, so it moves with a beating tail or a swaying stalk instead of hanging where the tail rests. The pose is pure arithmetic on the snapshot (`partPose.ts`, one forward pass: a parent always comes before its children). A tail is as long as its developed `length`, and its drawing and its riders share one curve.
- **Sight:** for the selected creature only, each working eye shows a thin flat wedge (one-pixel lines, no fill) about its axis as far as it reaches; an all-round eye shows a circle. The snapshot carries each eye's half-angle and reach in world units.
- **Level of detail:** far away a creature is a flat dot at least a few pixels wide and nothing animates. Parts appear when zoomed in, and only creatures on screen animate, up to a budget; a creature past the budget is drawn once per scene at rest, so a crowd never shows creatures without their parts.
- **Presentation only:** animation reads a wall-clock time and the snapshot. It never feeds back into the engine, so determinism is untouched.
