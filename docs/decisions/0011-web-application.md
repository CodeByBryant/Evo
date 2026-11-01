# 0011: The web application (renderer, UI, host, deployment)

Status: **Accepted** (approved by the project owner with the Phase 7 plan, 2026-11-01)

## Problem

Through Phase 6 the engine has no front end. `apps/web` prints a placeholder, `packages/renderer` and `packages/ui` are empty, and the public site (https://codebybryant.github.io/Evo/) still deploys the archived v0.1 prototype from `legacy/prototype`. Roadmap Phase 7 asks for a professional viewer and controller on top of the deterministic engine **without putting simulation logic back into React**: start, pause, reset and inspect a world, select organisms, move a camera, see species and lineage data, never mutate simulation entities from the UI, and never re-render React once per tick.

Owner decisions taken before this ADR:

- **PixiJS v8 behind a renderer interface** for the viewport. The roadmap's own order is a Pixi prototype first and a custom canvas only if Pixi gives no advantage.
- **The new app replaces the prototype at `/Evo/`** on GitHub Pages. The prototype stays in the repository and in CI, but is no longer deployed.
- **Mate seeking lands first** (ADR 0010), so a long-running browser world is not routinely ending in extinction.

## Decision

### Data flows one way, at two different rates

```text
World (apps/web: SimulationHost, the only owner)
  step() in time-sliced batches
  snapshot()  ----------------------->  RenderSnapshot  ->  Renderer (packages/renderer, Pixi)   every animation frame
  snapshot() + species + inspector --->  ViewState       ->  React (packages/ui)                  about 8 times a second
```

- `SimulationHost` (in `apps/web`, the only package allowed to import both the engine and the UI packages) owns the `World`. It exposes **commands** (start, pause, step, reset, speed, seed, preset, select) and publishes **read-only state**. Nothing else holds a `World`.
- The renderer and the UI receive plain data (`RenderSnapshot`, `ViewState`) typed in `@evo/contracts`, so `packages/renderer` and `packages/ui` keep their rule of depending on contracts only. They never see the engine.
- The renderer reads the latest frame every animation frame, independent of how many ticks ran. React is fed a derived `ViewState` at a fixed low rate through `useSyncExternalStore`, never per tick. At 100x speed the engine runs about a thousand ticks a second while React updates about eight.
- Expensive calls (`stateHash`, `validate`) are never on the per-frame path (about 40-55 ms at 1,000 organisms). Per-organism inspector data (`genomeOf`, `brainOf`, `lineage`, `migrationOf`) is fetched on demand for the selected organism only. Terrain is fetched once per created world.

### The engine stays on the main thread, behind an interface

Measured on the development machine (relative numbers): the brain controller costs about 0.32 ms per tick at the default population (about 3,100 ticks a second) and 12-16 ms per tick at 1,000 organisms; `snapshot()` costs 0.03 ms at 20 organisms and 0.2-0.4 ms at 1,000. Real time is 10 ticks a second, so 1x costs a few milliseconds a second, and 100x costs about a third of a core at the default population. That is fine on the main thread **if the host time-slices** (a budget of about 8 ms of stepping per animation frame, with the accumulator clamped so a slow frame cannot snowball). The UI shows the achieved ticks per second instead of pretending to reach a requested speed. A Web Worker is Phase 9 work (the roadmap says so); because the host is the only owner of the world and everything else sees snapshots, moving it into a worker later changes the host, not the renderer or the UI.

### Contracts and engine additions

- `@evo/contracts` gains `RenderSnapshot` (roadmap 7.2: tick, time, organisms, resources, terrain, effects, selection), the view-model types the UI renders (`ViewState`, species rows, inspector data) and `SimulationControls` (the commands the UI may call).
- `OrganismSnapshot` gains `maxEnergy`, `maxHealth` and `maxAge`, so a presentation layer can draw ratios without reaching into genomes. These are derived values; nothing hashed changes.
- `World.terrain()` returns a read-only copy of the region map (grid size, per-cell region index and type, Voronoi points) and `World.season` the current season, so the renderer can draw regions without the engine exposing its private `RegionMap`. Neither is hashed, neither draws randomness, and **no golden hash changes** (this is the gate for that commit).
- `@evo/config` gains `PRESETS`: named `WorldConfigOverrides` (balanced, lush, harsh, rapid evolution, classic) that the host applies. Every preset is validated by a test.

### The renderer

- `Renderer` is an interface in `packages/renderer`; `PixiRenderer` is its implementation and the only file that imports `pixi.js` (loaded with a dynamic import so unit tests never load WebGL). A lint-level rule in `tools/check-dependency-rules.mjs` forbids `pixi.js` anywhere but `packages/renderer` and `react` anywhere but `ui`, `web` and `desktop`.
- Everything that is logic rather than drawing is pure and unit-tested without a GPU: the `Camera` (pan, zoom toward the cursor, clamp, focus, follow, fit), picking (`pickOrganism`), species colors (a golden-angle hue per species id, stable across runs), the mapping from `WorldSnapshot` to `RenderSnapshot`, and the trail buffer.
- Layers are independently switchable and ordered as in roadmap 7.4: background grid, terrain, hazards, resources, shadows, organisms, trails, selection, debug overlay. Sprites are pooled; nothing is allocated per organism per frame beyond the snapshot itself.
- Input uses Pointer Events (mouse, pen and touch): drag to pan, wheel and pinch to zoom, click to select.

### Deployment

- `apps/web` builds with `base: './'`, so the same artifact works under `/Evo/` on Pages and from `file://` in the Electron shell later. This also avoids the prototype's bug of absolute `/assets/...` URLs in its manifest.
- `deploy-web.yml` is rewritten for pnpm and Node 22 and uploads `apps/web/dist`. Required check names in `quality.yml` are unchanged. A non-required `Pages artifact` job runs the same build in every pull request and checks that the output exists and uses relative URLs, because the deploy workflow itself can only run on `main`.
- Rollback is a revert commit (or `workflow_dispatch` on a previous commit). Nothing about the site's URL or settings changes.

## Alternatives considered

- **A custom Canvas2D renderer.** No new dependency and trivially testable, but trails, particles, thousands of organisms and mobile all hit a CPU ceiling and would force a rewrite. The renderer interface keeps this possible as a fallback.
- **Run the engine in a Web Worker now.** Removes the time-slicing but needs a packed snapshot format (structured clone costs about 4.5 ms at 1,000 organisms), a command protocol and cross-thread tests, and the roadmap schedules it for Phase 9. Deferred, and the design above does not preclude it.
- **React drives the renderer from state.** Re-rendering React per frame (or per tick) is exactly what the exit criteria forbid. The renderer is driven imperatively by the host's frame callback.
- **A runtime store library.** `useSyncExternalStore` over a small observable is enough for one store and adds no dependency.
- **Keep the prototype deployed beside the new app.** Costs a more complex workflow and patched asset paths for an app the owner chose to retire from the public site.

## Consequences

- The public site changes when this merges. The prototype is still buildable (its CI job stays) and reachable from the repository.
- `pnpm-lock.yaml` changes (`pixi.js`; React and its types for `packages/ui`). CI installs with `--frozen-lockfile`, so the lockfile is committed with the code that needs it.
- Pixi cannot run in Vitest (no WebGL), so the drawing code is verified by a local browser run (Playwright with the pre-installed Chromium) and the PR says so; all logic is pure and unit-tested.
- Save and load, replay and experiment controls are **not** in this phase (Phase 8), and neither are the Worker (Phase 9) or GPU tuning (only after profiling). Species trait-distribution charts, region navigation, a minimap, sensor-ray and particle layers and the bottom event timeline are cut first if the phase overruns; the PR body lists what was cut.
