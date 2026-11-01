<div align="center">

# 🧬 Evo

**A deterministic artificial-life simulation. Organisms with genomes, brains and species, in an ecosystem that is the same every time you run it.**

[![Quality](https://github.com/CodeByBryant/Evo/actions/workflows/quality.yml/badge.svg)](https://github.com/CodeByBryant/Evo/actions/workflows/quality.yml)
[![Deploy](https://github.com/CodeByBryant/Evo/actions/workflows/deploy-web.yml/badge.svg)](https://github.com/CodeByBryant/Evo/actions/workflows/deploy-web.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)

[**🎮 Play Online**](https://codebybryant.github.io/Evo/) • [**📖 Documentation**](./docs/README.md) • [**🗺️ Architecture decisions**](./docs/decisions/)

</div>

---

## What it is

Evo runs a small world of organisms that eat, age, mate, evolve and die. Everything that happens is a pure function of the **seed** and the **configuration**: the same seed gives the same world on any machine, tick for tick, which is checked by hashing the whole simulation state against pinned values in CI.

- **Genomes.** Every organism carries a genome (body, senses, metabolism, behaviour, reproduction, learning, and the weights of a small neural network). Children are made by recombination and mutation of two parents.
- **Brains that learn.** Each organism senses its surroundings and chooses what to do with a small recurrent network. It learns during its life with reward-driven updates, and what it learns can be passed on or not (Baldwinian, partial or Lamarckian inheritance).
- **Species.** Species are defined by genetic distance, can split, and stay queryable after they go extinct.
- **An ecosystem.** Several kinds of food, regions with different terrain, seasons, hazards and storms, health and damage, and migration between regions.
- **Mate seeking.** Organisms that are ready to reproduce can sense each other over a mating signal, which keeps small populations from drifting apart.

The engine is headless. The browser app is a viewer and controller on top of it: it never changes the simulation except through the same start, pause, reset and seed controls a person has.

## Try it

**[codebybryant.github.io/Evo](https://codebybryant.github.io/Evo/)** runs the simulation in your browser. Nothing is installed or uploaded.

| What                | How                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------ |
| Start, pause, step  | Buttons, or `Space` and `.`                                                          |
| Speed               | `1×` is real time (10 ticks a second); `Max` runs as fast as the frame budget allows |
| Look around         | Drag to pan, mouse wheel or pinch to zoom, `0` to fit the world                      |
| Inspect an organism | Click it: energy, health, genome, what its brain senses and chooses, lineage, region |
| Follow it           | `F`, or `Z` to focus once                                                            |
| Share a world       | The address keeps the seed and preset (`#seed=7&preset=balanced`); send the link     |
| Presets             | Balanced, Lush, Harsh, Rapid evolution, and Classic (no regions, seasons or hazards) |

Worlds can end. If every organism dies, the app says so and offers a new world or a replay of the same seed.

## Develop

Requirements: Node.js 22 or later and [pnpm](https://pnpm.io/) 10.

```bash
git clone https://github.com/CodeByBryant/Evo.git
cd Evo
pnpm install
pnpm --filter @evo/web dev     # the web app, with hot reload
```

The repository is a pnpm workspace:

| Package                              | What it is                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `packages/contracts`                 | Types and constants shared by everything (no logic)                                 |
| `packages/config`                    | Defaults, validation and presets                                                    |
| `packages/simulation`                | The deterministic engine; no DOM, no React, no randomness except the seeded streams |
| `packages/renderer`                  | PixiJS drawing, camera, picking and gestures                                        |
| `packages/ui`                        | React components for the controls and inspector                                     |
| `apps/web`                           | The application: the host that owns the world, plus the page                        |
| `apps/desktop`, `apps/simulator-cli` | Placeholders for the desktop shell and a command-line runner                        |

Dependencies between packages are enforced, not just documented: `pnpm lint` fails if the engine imports React, if the renderer imports the engine, and so on.

```bash
pnpm check             # typecheck, lint (with dependency rules) and tests
pnpm build             # build every package, including the web app
pnpm test:determinism  # the slow suite: 100,000-tick runs and pinned state hashes
pnpm format            # Prettier
```

See [docs/development.md](./docs/development.md) and [docs/architecture/web-app.md](./docs/architecture/web-app.md).

## Deployment

Every push to `main` builds `apps/web` and publishes it to GitHub Pages ([`deploy-web.yml`](./.github/workflows/deploy-web.yml)). Pull requests build the same artifact and check that it can be served from a sub-path (relative URLs, nothing missing) before it can reach `main`.

## The archived prototype

The original v0.1 app (a generational neural-network sandbox) is kept in [`legacy/prototype`](./legacy/prototype) so nothing is lost. It is no longer deployed and is not part of the new engine. Its desktop installers are still what the [Releases](https://github.com/CodeByBryant/Evo/releases) page offers; a desktop build of the new app is future work.

## Contributing

Bug reports, ideas and pull requests are welcome; see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).

<div align="center">

Developed by **Bryant Ejorh** ([@CodeByBryant](https://github.com/CodeByBryant)) · [Portfolio](https://codebybryant.github.io/Portfolio/)

</div>
