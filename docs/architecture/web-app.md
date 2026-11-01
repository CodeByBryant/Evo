# The web application

How the browser app is put together. The decisions behind it are in [ADR 0011](../decisions/0011-web-application.md); the rules about which package may import which are in [the dependency diagram](dependency-diagram.md).

Live at https://codebybryant.github.io/Evo/.

## One owner, two rates

```text
World (apps/web: SimulationHost, the only owner)
  step() in time-sliced batches
  snapshot() --------------------------> RenderSnapshot --> PixiRenderer      every animation frame the world moved
  snapshot() + species + inspector ----> ViewState ------> React (@evo/ui)    about 8 times a second
```

- **`SimulationHost`** (`apps/web/src/host/SimulationHost.ts`) holds the only `World`. It implements `SimulationControls` (start, pause, step, reset, new world, speed, preset, select, layers, camera commands), which is everything the interface can ask for. It is plain TypeScript with an injected clock and frame scheduler, so it is tested without a browser.
- **The renderer** gets a `RenderSnapshot` (display data only: positions, rotation, colors, energy ratio, hazards, short-lived event markers) each time the world has moved, and draws it. It reports clicks back as `onSelect`.
- **React** gets a `ViewState` through `useSyncExternalStore`, rebuilt at most every 125 ms. It is a stable object between updates, so components re-render only when something changed. React is never driven per tick or per frame.
- The interface and renderer receive copies. Mutating a snapshot, a frame, the terrain or the view state cannot change the engine (a test checks the state hash).

## Running the engine in the browser

The host advances the world once per animation frame:

1. Elapsed time (clamped to 100 ms) is converted to ticks owed: `speed x 10` ticks per second, where `1x` is real time.
2. It steps until the ticks owed are used up **or** a time budget (10 ms) is spent, whichever comes first. At `Max` only the budget limits it.
3. Any backlog beyond a tenth of a second is dropped, so one slow frame can never snowball into a freeze.
4. If anything stepped it takes one `snapshot()`, builds the render frame, and tells the renderer. If nothing stepped (for example at `1x`, where most 16 ms frames owe less than one tick) it does nothing.

Because the world is only ever advanced with `step()`, the result depends only on the number of ticks, never on how they were sliced into frames. A test runs the host under four different slicings and compares the state hash with a plain `world.run(n)`.

Expensive calls are kept off this path: `stateHash()` and `validate()` (tens of milliseconds at 1,000 organisms) are never called per frame, and the lineage and species queries behind the inspector are cached for a few seconds.

The world is paused at extinction. The app shows an alert with **New world** and **Replay this seed** instead of failing.

## Packages

| Package           | Contents                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@evo/contracts`  | `RenderSnapshot`, `ViewState`, `SimulationControls`, `TerrainSnapshot`, the render layer list                                                                                                                 |
| `@evo/config`     | `PRESETS` (balanced, lush, harsh, rapid-evolution, classic), validated like any configuration                                                                                                                 |
| `@evo/simulation` | Read-only `World.terrain()`, `World.season`, and capacities on organism snapshots (unhashed, so no golden changed)                                                                                            |
| `@evo/renderer`   | Pure: `Camera`, `pickOrganism`, species colors, `buildRenderSnapshot`, `TrailBuffer`, `GestureTracker`. Drawing: `PixiRenderer` (its own entry point, `@evo/renderer/pixi`, loaded with a dynamic `import()`) |
| `@evo/ui`         | Presentational React components and formatting helpers, typed only from contracts                                                                                                                             |
| `apps/web`        | `SimulationHost`, the view-state builders, the URL hash and preferences helpers, the keyboard map, `App` and `Viewport`                                                                                       |

Layers, in drawing order: grid, terrain (regions), hazards, food, shadows, organisms, trails, selection and event markers, debug overlay. Each can be switched on and off from the **View** panel and the choice is remembered in `localStorage` (guarded, so private windows and blocked storage just forget it).

## Using it

- **Keys:** `Space` pause or resume, `.` step, `1`-`5` speeds, `Esc` deselect, `T` trails, `F` follow, `Z` focus, `0` fit. They are ignored while typing in a field and with Ctrl, Alt or Meta held.
- **Pointer:** one pointer drags to pan, two pinch to zoom, the wheel zooms toward the cursor, and a press that barely moves selects the nearest organism (a larger tolerance for touch). Dragging while following stops following.
- **Address:** `#seed=7&preset=balanced` is rewritten whenever a world starts, and read on load. Malformed values are ignored.
- **Inspector** (click an organism): Overview (energy, health, age, stage, mating cooldown), Genome (every gene by group), Brain (chosen action, last reward, what it senses), Lineage (parents, ancestor and descendant genomes, species line), Environment (region, season, migration).
- **Phones:** the panels stack under the viewport and start collapsed; the inspector becomes a bottom sheet.

## Deployment

`apps/web` builds with `base: './'`, so every URL is relative and the same build works at the root, under `/Evo/` on GitHub Pages, and from `file://`. On every push to `main`, `.github/workflows/deploy-web.yml` installs with pnpm, builds `@evo/web`, runs `tools/check-pages-artifact.mjs` and uploads `apps/web/dist`. The same build and check run on pull requests in the non-required `Pages artifact` job. To roll back, revert the commit (or run the workflow on an earlier commit).

## What is verified where

| What                                                                                                                                              | How                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Camera, picking, colors, snapshot mapping, trails, gestures                                                                                       | Unit tests in `packages/renderer/tests` (no GPU needed)                                         |
| Components and formatting                                                                                                                         | Server-rendered tests in `packages/ui/tests`                                                    |
| The host: speeds, budget, pause, step, reset, presets, extinction, selection, no mutation, bounded notifications, determinism under frame slicing | `apps/web/tests/host.test.ts`                                                                   |
| Drawing, real pointer input, layout, console errors                                                                                               | A real Chromium run with Playwright against the built app (not part of CI: Vitest has no WebGL) |
| The deployable artifact                                                                                                                           | `tools/check-pages-artifact.mjs`, in the deploy workflow and a pull-request job                 |

The Chromium run used by this phase loaded the built app under a `/Evo/` sub-path and exercised: boot, pause and step through the real buttons, keyboard shortcuts, clicking an organism on the canvas to select it, every inspector tab, wheel zoom, drag-to-pan (and that a drag does not select), fit, follow, speed, preset and seed changes (with the address kept in step), layer toggles, an extinction and recovery, a phone-sized viewport, and no console errors or warnings.

## Measured limits

Numbers from that run, in a sandbox where Chromium has **no GPU** (software WebGL, which shares the CPU with the simulation), so a real machine should do better:

- Building the scene (positions, tints, pools) took about 0.4 ms at the default population (20 organisms) and between 5 and 11 ms at 500 organisms across three runs (the spread is the shared CPU; the budget for 60 frames a second is 16.7 ms). Layers such as shadows can be switched off to reduce it.
- `100x` achieved about 300-350 ticks per second at the default population (1,000 were requested), so the app shows the achieved rate rather than the requested one.
- 500 organisms in brain mode is expensive for the engine itself (roughly 7 ms a tick), so the app reached only about 13 ticks per second at `5x` there. That is the engine's cost, not the interface's, and it is what a Worker (Phase 9) is for.

## Not here yet

Save, load and replay (Phase 8), experiment controls (Phase 8), a Web Worker for the engine (Phase 9), a minimap, sensor-ray and particle layers, a bottom event timeline, region navigation, follow-lineage and focus-species camera modes, species trait distributions, and a desktop build of this app. The prototype's desktop installers are still what the Releases page offers.
