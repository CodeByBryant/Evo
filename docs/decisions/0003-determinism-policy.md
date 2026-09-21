# 0003: Determinism policy for the simulation engine

Status: **Accepted** (approved by the project owner with the Phase 2 plan, 2026-09-20)

## Problem

Evo's value depends on results being reproducible from a seed and shareable across machines (roadmap: "seeds allow sharing", replays, experiments). The prototype used `Math.random()` everywhere and frame-driven timing (ARC-1, ARC-3). Determinism is easy to lose silently: a stray platform `Math.sin`, an unordered iteration, or an extra random draw changes every later result, and different JS engines are free to differ in the last bits of transcendental functions.

## Decision

The full normative specification is [docs/simulation/determinism.md](../simulation/determinism.md). In summary:

- **Numeric model**: IEEE-754 binary64; only exact operations touch state; NaN/Infinity are invalid (`validate()` rejects, never repairs); -0 is canonicalized to +0 in the hash.
- **Own transcendentals**: `sin`, `cos`, `atan2`, `ln` implemented with `+ - * /` and `sqrt` only, so any engine produces identical results. Platform equivalents are banned in `packages/simulation/src` by ESLint.
- **Randomness**: xoshiro128\*\*, seeded per named stream through FNV-1a (over a fully specified byte encoding) and splitmix32; fixed stream list; all-zero state has a defined fallback; published test vectors.
- **Iteration**: never depends on object enumeration order; stores iterate in ascending `EntityId`; `for...in`, `Object.keys/values/entries` and comparator-less `sort` are banned in the engine.
- **Hashing**: float64 as big-endian IEEE-754 bits, cyrb128-style 128-bit hash, a versioned canonical layout (`HASH_SCHEMA_VERSION`), golden hashes versioned the same way.
- **Identity**: `stateHash()` identifies simulation state, not bounded event-log contents; `eventsEmitted` is hashed to catch divergent event production.
- **Pipeline**: `World.step()` is a flat list of stage calls; a system mutates only what it owns and emits typed events; ordering is controlled exclusively by `World`. Documented in [update-order.md](../simulation/update-order.md) and enforced by `tools/check-dependency-rules.mjs`.

## Alternatives considered

- **Use platform `Math.*` and rely on V8.** Simpler, but Firefox and Safari can differ in the last bits, breaking shared seeds. Rejected by the owner in favor of own math.
- **A different PRNG (mulberry32, sfc32, PCG).** xoshiro128\*\* has a larger state, good statistical quality, uses only 32-bit integer operations available everywhere in JS, and has a published reference vector. Rejected alternatives are smaller-state or need 64-bit arithmetic.
- **Hash `JSON.stringify` of the state.** Rejected: decimal formatting, key order, and -0 handling are all fragile.
- **A single shared random stream.** Rejected: adding one draw in any system would change every later result.

## Consequences

- Extra implementation work up front (trig kernels, hasher) and a small performance cost versus native `Math.*`.
- Changing the hash layout or any RNG derivation byte is a breaking, versioned change: bump the relevant version, regenerate goldens, explain in the PR.
- The engine cannot use convenient built-ins (`Math.hypot`, `**`, object iteration); ESLint explains the alternative.
- Tests and tools outside `packages/simulation/src` are exempt from the bans.

## Rollback plan

Revert the ESLint bans and swap `trig.ts` for `Math.*` calls; determinism then holds only within a single engine, and goldens would need per-engine baselines.
