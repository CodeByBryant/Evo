# Interface and organism design

The web application is a dark, quiet interface over a living world. This note records the design so the code, the tests and later changes agree on it. Nothing here touches the simulation: it reads the view state and the render snapshot and changes only how they look.

## Principles

1. **The world is the interface.** The canvas fills the window. Everything else floats over it and stays out of the way.
2. **Text before boxes.** Status, counts, world settings, species and layers are plain text on a soft scrim with hairline rules. Only the two things you act on, the inspector and the playback dock, are frosted glass.
3. **One glow.** Cyan to violet marks what is active (the running state, the chosen speed, a switched-on layer, a meter fill). Everything else is ink, two greys and white.
4. **Small corners.** 4 px for controls, 6 px for panels. No pills, no circles except status dots and species swatches.
5. **Numbers do not jitter.** Every number uses tabular figures.
6. **Motion is optional.** Animation respects `prefers-reduced-motion` and the in-app Motion switch.

## Tokens

All colors, radii and type live in `packages/ui/src/theme.css` as custom properties on `:root`. Re-theming is a change to that one file.

| Token                                    | Value                               | Use                                 |
| ---------------------------------------- | ----------------------------------- | ----------------------------------- |
| `--evo-ink`                              | `#07090f`                           | page background                     |
| `--evo-ink-2`                            | `#0a0d17`                           | wells (chart and schematic grounds) |
| `--evo-glass`                            | `rgb(14 18 31 / 0.66)` + blur 18 px | inspector, dock, extinction dialog  |
| `--evo-line`, `--evo-line-2`             | `rgb(160 180 255 / 0.12 / 0.26)`    | hairlines                           |
| `--evo-text`, `--evo-muted`, `--evo-dim` | `#e7ecff`, `#8d97bb`, `#565f7f`     | text                                |
| `--evo-cyan`, `--evo-violet`             | `#5ee1ff`, `#9b7bff`                | the glow                            |
| `--evo-good/warn/bad`                    | `#6df0b4`, `#ffc866`, `#ff7d8a`     | state                               |

Type is the system sans and mono stacks (no web font is downloaded; the app stays offline-capable and the Pages artifact stays small).

## Layout

- **Top left:** brand and run status, then time, tick, season and seed.
- **Top right:** organisms, food and species, with the population line under them.
- **Left column (scrolls, remembers nothing):** World (preset, seed, reset, new seed), Species, Clusters (cluster layout only), Layers, Statistics (collapsed).
- **Right:** the inspector, a glass card, only while an organism is selected.
- **Bottom centre:** the dock: step, start or pause, a segmented speed control and the achieved ticks per second.
- **Narrow screens:** the left column hides behind a Panels button, the inspector becomes a bottom sheet and the dock uses the full width.

## Organisms

Creatures are drawn as soft, translucent cells, not shapes with icons stuck on:

- **Body:** the evolved outline, filled with a radial gradient from the species hue (lighter core, deeper rim), a thin membrane line, and two or three organelles placed from the creature's id. A faint glow sits behind it.
- **Parts grow out of the body:** a tapered **flagellum** that waves (faster when the creature moves faster), a **cilia** fringe beating as a wave, **antennae** that sway, an **eye** with a pupil and an occasional blink, a **mouth** that opens and closes, a **stomach vacuole** whose fill is the creature's energy, **armor** plates, a membrane **halo** and a **mender** cross. Dormant parts are drawn faded and still, so dead weight is visible.
- **Level of detail:** far away a creature is a soft dot and nothing animates. Parts appear when zoomed in, and only creatures on screen animate.
- **Presentation only:** animation reads a wall-clock time and the snapshot. It never feeds back into the engine, so determinism is untouched.
