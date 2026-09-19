# 0001: Separate the simulation engine from the application

Status: **Accepted** (approved by the project owner, 2026-09-19)

## Problem

In prototype v0.1 the simulation, genetics, brain, and rendering are entangled (`Agent` owns all four), React receives live simulation objects, randomness is `Math.random()`, and timing is frame-driven. None of this can be tested headlessly, reproduced from a seed, or saved faithfully. See `docs/archive/bug-inventory.md` (ARC-1..6, UI-1, REN-1, PER-1..2).

## Proposed solution

Rebuild Evo as a pnpm monorepo where the engine is the foundation, following `.dev/roadmap.md`:

```text
contracts  (no internal deps)
config     -> contracts
simulation -> contracts + config     (no React/Vite/Electron/DOM/Canvas/localStorage)
renderer   -> contracts
ui         -> contracts
web        -> simulation + renderer + ui
desktop    -> web
cli        -> simulation + config + experiment
```

- Deterministic, seed-based, fixed-timestep engine with separate random streams per system.
- UI and renderer consume immutable snapshots and events; they never mutate simulation state.
- No global generations and no silent recovery from extinction.
- Fixed-topology brains first; no ECS framework; keep Vite and Electron for now.
- Work happens on `rewrite/simulation-engine` through small PRs into `main` (see `.dev/repo-discipline.md`, "first five pull requests").

## Alternatives considered

- **Refactor the prototype in place.** Rejected: the coupling (ARC-2, UI-1) touches every file, and there is no test harness to protect behavior during the change.
- **Tauri now.** Rejected: adds an unrelated unknown during the core rewrite.
- **Adopt an ECS library.** Rejected for now: extra abstraction before the data model is proven.

## Consequences

- Simulation: behavior will differ from the prototype (fresh brains and silent respawn are removed deliberately).
- Determinism: enforced by tests and lint rules from Phase 1.
- Persistence: the prototype's save format is not migrated; old saves are unsupported.
- Performance: not a goal until Phase 9; the design leaves room for a spatial index.

## Testing strategy

Determinism (same seed, same state hash), invariants, extinction, and inheritance tests gate `main` from the deterministic-kernel PR onward.

## Rollback plan

`prototype/v0.1` is the recovery point; `main` remains buildable throughout.
