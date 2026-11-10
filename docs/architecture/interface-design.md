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

| Token                                    | Value                           | Use                                   |
| ---------------------------------------- | ------------------------------- | ------------------------------------- |
| `--evo-ink`                              | `#000`                          | page background                       |
| `--evo-ink-2`, `--evo-panel`             | `#0a0a0a`                       | panels (inspector, dock, left column) |
| `--evo-line`, `--evo-line-2`             | `#1f1f1f`, `#333`               | hairlines                             |
| `--evo-text`, `--evo-muted`, `--evo-dim` | `#ededed`, `#9a9a9a`, `#7a7a7a` | text                                  |
| `--evo-accent`                           | `#ededed`                       | the active state (neutral, no hue)    |
| `--evo-good/warn/bad`                    | `#6fd08c`, `#e6c15a`, `#e8645a` | state                                 |

Type is the system sans and mono stacks (no web font is downloaded; the app stays offline-capable and the Pages artifact stays small).

## Layout

- **Top left:** brand and run status, then time, tick, season and seed.
- **Top right:** organisms, food and species, with the population line under them.
- **Left column (scrolls, remembers nothing):** World (preset, seed, reset, new seed), Species, Clusters (cluster layout only), Layers, Statistics (collapsed).
- **Right:** the inspector, a flat panel, only while an organism is selected.
- **Bottom centre:** the dock: step, start or pause, a segmented speed control and the achieved ticks per second.
- **Narrow screens:** the left column hides behind a Panels button, the inspector becomes a bottom sheet and the dock uses the full width.

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
