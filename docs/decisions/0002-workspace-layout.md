# 0002: Workspace layout and legacy prototype

Status: **Accepted** (approved by the project owner, 2026-09-20)

## Problem

ADR 0001 requires a monorepo with enforced package boundaries. The repository is a single npm app at the root, still deployed to GitHub Pages and packaged with Electron, so the new workspace and the old app cannot both own the root.

## Decision

- The prototype moves to `legacy/prototype` with its own `package.json` and npm lockfile. It is **not** a workspace member and keeps building in CI until it is retired.
- The new workspace uses **pnpm** (via corepack): `apps/*` and `packages/*`, scoped as `@evo/*`.
- Internal packages are consumed from source ("just-in-time": `exports` point at `src/index.ts`); `build` only proves they compile. This avoids build-order coupling between packages.
- Required check names in the Quality workflow stay unchanged across the migration so branch rules do not need to change.
- Line endings are normalized to LF with `.gitattributes` (fixes the CRLF lint noise recorded as BLD-1).

## Alternatives considered

- **Delete the prototype from `main`.** Simplest tree, but nothing would keep the deployed Pages site or Electron build verifiable. `prototype/v0.1` remains the recovery point either way.
- **Make the prototype a workspace package.** Rejected: mixes an Electron/npm toolchain into the pnpm workspace and invites accidental dependencies on legacy code.
- **npm workspaces.** Rejected in favor of the roadmap's pnpm for stricter dependency isolation.

## Consequences

- Moving files is history-preserving (pure renames, no content changes).
- Workflows that referenced the repo root (`deploy-web`, `release`, Dependabot) now point at `legacy/prototype`.
- Contributors need corepack/pnpm for new packages and npm for the legacy app until it is removed.

## Rollback plan

Revert the move commit; `prototype/v0.1` holds the original layout.
