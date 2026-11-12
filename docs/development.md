# Development Guide

This guide covers setting up a development environment and contributing to Evo.

Evo is being rebuilt as a pnpm workspace around a headless simulation engine (see [ADR 0001](decisions/0001-separate-simulation-engine.md) and [ADR 0002](decisions/0002-workspace-layout.md)). The original app is archived in `legacy/prototype`.

## Workspace Setup (new engine)

### Prerequisites

- **Node.js** v22 or later
- **pnpm**, via corepack: `corepack enable` (the version is pinned in `package.json`)

### Commands

Run from the repository root:

| Command                               | Description                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm install`                        | Install all workspace dependencies                                                     |
| `pnpm check`                          | Typecheck, lint (including dependency rules), and test                                 |
| `pnpm build`                          | Compile-check every package and build the web app                                      |
| `pnpm typecheck`                      | TypeScript checks for every package                                                    |
| `pnpm lint`                           | Dependency-rule check plus ESLint                                                      |
| `pnpm test`                           | Tool tests plus every package's Vitest suite                                           |
| `pnpm format`                         | Format with Prettier (`pnpm format:check` verifies without writing)                    |
| `pnpm lint:deps`                      | Only the workspace dependency-rule check                                               |
| `pnpm test:determinism`               | The slow suite: 100,000-tick runs and pinned state hashes (CI runs it in shards)       |
| `pnpm --filter @evo/simulation probe` | A measurement, not a test: runs presets over many seeds and writes a table (see below) |
| `pnpm --filter @evo/web dev`          | The web app with hot reload (`preview` serves a build)                                 |

### The web app

`pnpm --filter @evo/web dev` starts the application; `pnpm --filter @evo/web build` produces `apps/web/dist`, which is what GitHub Pages serves (see [the web application](architecture/web-app.md)). Open it with `?debug` in the address to expose `window.__evo` (the host and renderer) for experiments; real-browser checks are run with Playwright against `vite preview`.

### Layout and rules

Packages live in `packages/*` (`contracts`, `config`, `simulation`, `renderer`, `ui`) and `apps/*` (`web`, `desktop`, `simulator-cli`). Allowed dependencies are documented in [the dependency diagram](architecture/dependency-diagram.md) and enforced in CI. The simulation package must stay headless and deterministic: no React, DOM, Electron, `Math.random()`, or wall-clock time.

## Legacy Prototype Setup

The commands below apply to the archived prototype. Run them from `legacy/prototype`.

### Prerequisites

- **Node.js** v18 or later ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))
- **VS Code** (recommended) with extensions:
  - ESLint
  - Prettier
  - TypeScript and JavaScript Language Features

### Getting Started

1. **Fork the repository** on GitHub

2. **Clone your fork**

   ```bash
   git clone https://github.com/YOUR_USERNAME/Evo.git
   cd Evo
   ```

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Start development server**

   Web version (recommended for development):

   ```bash
   npm run dev:web
   ```

   Desktop version:

   ```bash
   npm run dev
   ```

## Available Scripts

| Script                | Description                      |
| --------------------- | -------------------------------- |
| `npm run dev:web`     | Start web development server     |
| `npm run dev`         | Start Electron development app   |
| `npm run build:web`   | Build web version for production |
| `npm run build`       | Build Electron app               |
| `npm run build:win`   | Build for Windows                |
| `npm run build:mac`   | Build for macOS                  |
| `npm run build:linux` | Build for Linux                  |
| `npm run lint`        | Run ESLint                       |
| `npm run format`      | Format code with Prettier        |
| `npm run typecheck`   | Run TypeScript type checking     |

## Project Structure

```
src/
├── main/               # Electron main process
├── preload/            # Electron preload scripts
└── renderer/           # React application
    ├── App.tsx         # Root component
    ├── components/     # UI components
    │   ├── SimulationCanvasNew.tsx  # Main canvas
    │   ├── Sidebar.tsx              # Control sidebar
    │   ├── DNAPanel.tsx             # Agent info panel
    │   └── ...
    ├── core/           # Simulation logic
    │   ├── Agent.ts    # Agent class
    │   ├── NeuralNetwork.ts  # Neural network
    │   ├── EvolutionManager.ts  # Evolution logic
    │   └── utilities/  # Helpers
    ├── hooks/          # Custom React hooks
    ├── types/          # TypeScript types
    └── assets/         # CSS and static assets
```

## Code Style

### TypeScript

- Use strict TypeScript with proper typing
- Avoid `any` types when possible
- Use interfaces for object shapes

### React

- Use functional components with hooks
- Keep components small and focused
- Use `useCallback` and `useMemo` appropriately

### Formatting

- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Run `npm run format` before committing

### Linting

- ESLint is configured for the project
- Run `npm run lint` to check for issues
- All lint errors must be resolved before merging

## Making Changes

### Workflow

1. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, well-documented code
   - Follow existing patterns in the codebase

3. **Test your changes**
   - Run the development server
   - Test in both web and Electron modes if applicable
   - Check for console errors

4. **Lint and format**

   ```bash
   npm run lint
   npm run format
   npm run typecheck
   ```

5. **Commit your changes**

   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

6. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then open a Pull Request on GitHub.

### Commit Message Format

Follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `perf:` Performance improvements
- `test:` Adding tests
- `chore:` Maintenance tasks

## Architecture Decisions

### Why React?

- Component-based architecture for UI
- Rich ecosystem and tooling
- TypeScript support

### Why Canvas?

- High performance for many moving objects
- Direct control over rendering
- Efficient for 2D simulations

### Why Electron?

- Cross-platform desktop support
- Native OS integration
- File system access for saves

## Common Tasks

### Adding a New Component

1. Create file in `src/renderer/components/`
2. Export from component file
3. Import and use in parent component

Example:

```typescript
// src/renderer/components/MyComponent.tsx
import React from 'react'

interface MyComponentProps {
  value: string;
}

export const MyComponent: React.FC<MyComponentProps> = ({ value }) => {
  return <div>{value}</div>
}
```

### Adding a New Configuration Option

1. Update type in `src/renderer/types/simulation.ts`
2. Add default value in `src/renderer/core/utilities/AgentConfig.json`
3. Add UI control in sidebar
4. Use value in simulation logic

### Modifying Agent Behavior

1. Edit `src/renderer/core/Agent.ts`
2. Update neural network inputs/outputs if needed
3. Test extensively - small changes can have big effects!

### Adding Evolution Features

1. Edit `src/renderer/core/EvolutionManager.ts`
2. Update types if adding new config options
3. Add UI controls if user-configurable

## Debugging

### Browser DevTools

- Use React DevTools for component inspection
- Console logs appear in browser console
- Network tab for any API calls

### Electron DevTools

- DevTools automatically open in development
- Main process logs appear in terminal
- Use `console.log` for debugging

### Common Issues

**TypeScript errors:**

- Run `npm run typecheck` for details
- Check import statements
- Verify type definitions

**Simulation bugs:**

- Add console.log in update loop
- Reduce speed to observe behavior
- Check for NaN values in calculations

## Building Releases

### Web Release

```bash
pnpm --filter @evo/web build
node tools/check-pages-artifact.mjs apps/web/dist
# Output in apps/web/dist; pushed to main, it is deployed by .github/workflows/deploy-web.yml
```

### Desktop Release (archived prototype)

The desktop installers are still built from the archived prototype. Run these from `legacy/prototype`:

```bash
# All platforms
npm run build

# Specific platform
npm run build:win
npm run build:mac
npm run build:linux
# Output in ./release/
```

## What CI runs, and how it is kept fast

The Quality workflow (`.github/workflows/quality.yml`) starts with a `Changed paths` job that reads the files a pull request touches (`tools/ci-scope.mjs`, with its own tests) and decides what the slow jobs need:

| Change touches                                                                                       | Runs                                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| only `docs/` or Markdown                                                                             | format, lint, typecheck, the package tests and the build; not the simulation suites                                   |
| the interface (`packages/ui`, `packages/renderer`, `apps/web`)                                       | the above plus the Pages artifact; not the simulation suites                                                          |
| `packages/simulation`, `config` or `contracts`, the lockfile, `tools/`, root config or the workflows | everything: the simulation unit tests in three shards and the determinism suite in three shards on Ubuntu and Windows |
| anything it cannot read (a push to `main`, a failed diff)                                            | everything                                                                                                            |

A skipped job is a passing check. The `Unit and integration tests` check is an aggregate of the test jobs, so it keeps the name it always had and fails if anything that had to run failed.

The determinism suite is cut into files of at most about two minutes each (a file runs its tests one after another, so a long file is what limits a shard) and the workflow names the files of each shard. `tools/determinism-shards.test.mjs` fails if a test file is in no shard or in two, so a new file has to be added to the workflow. Tests that would build an identical world share it, and "one tick at a time" runs are compared with a `run()` world at the same tick over a shorter stretch than the full run; every assertion is kept. Locally `pnpm test:determinism` still runs every file, in parallel across your cores.

## Measuring ecology (the preset probe)

Tuning food, births and deaths is done from measurements. `packages/simulation/tests/probe/presets.probe.ts` runs each preset over several seeds and writes a table and a JSON file with, per preset: worlds that went extinct, population mean and range, the share of deaths that were starvation (against age and damage), the food stock against its cap, the share of food energy wasted (eaten beyond an organism's capacity), and, in cluster worlds, how many clusters ended empty.

```bash
# one preset per process uses several cores; settings are environment variables
PROBE_PRESETS=balanced,lush PROBE_SEEDS=8 PROBE_TICKS=20000 PROBE_OUT=/tmp/probe \
  pnpm --filter @evo/simulation probe
cat /tmp/probe.md
```

The probe steps tick by tick and also reports **how creatures die**: deaths by cause and life stage (juvenile is younger than `organisms.maturityAge`), the median age at death, births per mature creature per second (compare with `1 / cooldown`, the most one can do), and the **evolved** `cooldown`, `minEnergy`, `offspringInvestment` and `maxAge` among the living, sampled every 2,500 ticks, so a tuning that evolution would undo shows up as drift. It also reports ticks per second.

Use at least 20,000 ticks: a creature's lifespan is 6,000 ticks, so shorter runs report almost every death as starvation. The probe is never part of `pnpm test`, the determinism suite or CI.

Three smaller probes in `packages/simulation/tests/probe/` answer one question each and are run directly (`pnpm exec vitest run --config vitest.probe.config.ts tests/probe/<file>` from `packages/simulation`; the `probe` script ignores a file argument and runs them all): `step-profile.probe.ts` (where a tick's time goes, per system), `species.probe.ts` (how many species a world ends with under a set of distance weights and thresholds), and `parts.probe.ts` (which of the 16 part types living bodies carry, with and without open type mutation). Each writes its report to `<tmpdir>/evo-probe/`.

## Getting Help

- **Questions**: Open a GitHub Discussion
- **Bugs**: Open a GitHub Issue
- **Features**: Open a GitHub Issue with proposal

## License

All contributions are subject to the MIT License. See [LICENSE](../LICENSE) for details.

### The food probe

`packages/simulation/tests/probe/food.probe.ts` measures a food setup (ADR 0021): worlds that died out, population (mean and lowest), the starved share of deaths, births per creature-minute, food and plants on the field, how clumped the food is (coefficient of variation per 50 x 50 cell), the **idle-spin** and **lost-spin** shares (creatures that barely moved but turned a lot over 20 ticks, and the same with nothing to eat within sensing range), how many part types and part lists the living carried, and ticks per second. Name a preset with `FOOD_PRESET=balanced`, or pass JSON overrides in `FOOD_CONFIG` with a label in `FOOD_NAME`; `FOOD_SEEDS` (default 1 to 8) and `FOOD_TICKS` (default 30,000) set the size. One line is written to `<tmpdir>/evo-probe/food-<name>.txt`. Run it directly, since the package `probe` script ignores a file filter: `pnpm exec vitest run --config vitest.probe.config.ts tests/probe/food.probe.ts` from `packages/simulation`. `starts.probe.ts` does the same for the starting bodies of ADR 0020. `predation.probe.ts` (ADR 0023) reports, over seeds, whether carnivory arises (jaw bodies alive, seeds where a jaw ever lived), bites on creatures, kills, the predation share of deaths, carcasses left and eaten and the usual population and part columns; it also reports whether a jaw lineage is **alive at the end** (worlds and mean count) and writes one line per seed (base body, jaws at the end, population, bites, kills, species) to `<tmpdir>/evo-probe/predation-seeds-<name>.txt`. `PRED_OFF=1` is the control, `PRED_HUNTERS=1` starts every world as hunters (the mechanism, not the evolution), `PRED_GROUPS` takes the founder groups as JSON (`[]` for none; the default hunter group otherwise), `PRED_CONFIG` takes JSON overrides, `PRED_SEEDS` and `PRED_TICKS` set the size. `obstacles.probe.ts` (ADR 0022) has the same columns plus the number of obstacle circles, the share of the field they cover and the **pinned** share (creatures held within a body-length of a rock's edge for a whole 20-tick window while barely moving); it takes `OBS_NAME`, `OBS_CONFIG`, `OBS_PRESET`, `OBS_SEEDS` and `OBS_TICKS` like the food probe, and `OBS_OFF=1` switches obstacles off for the control run.
