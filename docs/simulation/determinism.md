# Determinism specification

Normative spec for the simulation engine (`@evo/simulation`). Anything an independent implementation must reproduce bit-for-bit is defined here. Rationale and alternatives are in [ADR 0003](../decisions/0003-determinism-policy.md). The update pipeline is in [update-order.md](update-order.md).

**Guarantee.** For the same `seed`, the same `WorldConfig`, and the same sequence of API calls, every engine (any JS runtime, any OS) produces identical simulation state at every tick, and therefore an identical `stateHash()`.

## 1. Numeric model

- All simulation numbers are IEEE-754 **binary64** (JS `number`).
- Only these operations may touch simulation state: `+ - * /`, `Math.sqrt` (correctly rounded by IEEE-754), comparisons, `Math.abs/floor/ceil/min/max/trunc/sign`, `Math.imul`, and bitwise operators on 32-bit integers. Transcendental functions (`sin`, `cos`, `atan2`, `ln`) come from the engine's own `math/trig.ts`, which uses only the operations above. `Math.sin`, `Math.pow`, `**`, `Math.hypot`, etc. are forbidden because their results are implementation-defined.
- **NaN and ±Infinity are invalid simulation values.** `world.validate()` reports them as violations; it never normalizes, clamps, or repairs. The hasher throws when given a non-finite number (fail loud, never hash garbage).
- **-0 is canonicalized to +0 before hashing** (`x === 0 ? 0 : x`), because the engine treats them as equal. `validate()` accepts -0.
- Integers that are counters or ids are stored as JS numbers and must be safe integers.

## 2. Seed

`seed` must be an integer in `[0, 2^32 - 1]`. `World.create` and config validation reject anything else.

## 3. Random streams

A single master seed yields independent named streams. The stream names form a fixed, ordered constant:

```text
world, genetics, reproduction, environment, learning, events, terrain
```

Nothing may iterate a stream registry by object key; code always uses this array or a named field. Adding a draw in one stream never changes another.

### 3.1 Deriving a stream's initial state

1. Build the input bytes: ASCII `"evo-rng-v1"`, `0x00`, the seed as 4 bytes **big-endian**, `0x00`, then the **UTF-8** bytes of the stream name.
2. `s` = **FNV-1a 32-bit** over the bytes (offset basis `0x811c9dc5`, prime `0x01000193`, multiply with `Math.imul`, result as uint32).
3. Expand with **splitmix32** starting from state `s`; take four outputs `w0..w3`:

   ```text
   state = (state + 0x9e3779b9) | 0
   z = state
   z = imul(z ^ (z >>> 16), 0x85ebca6b)
   z = imul(z ^ (z >>> 13), 0xc2b2ae35)
   out = (z ^ (z >>> 16)) >>> 0
   ```

4. The xoshiro128\*\* state is `[w0, w1, w2, w3]`. An all-zero state is invalid for xoshiro; if all four words are zero, the state becomes the fixed constant `[0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x71374491]`.

### 3.2 Generator and derived draws

**xoshiro128\*\*** (uint32 arithmetic):

```text
result = imul(rotl(imul(s1, 5), 7), 9) >>> 0
t = s1 << 9
s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t; s3 = rotl(s3, 11)
```

- `nextUint32()` returns `result`.
- `float()` in `[0, 1)`: `hi = nextUint32() >>> 5`, then `lo = nextUint32() >>> 6` (in that order); result `(hi * 67108864 + lo) / 9007199254740992`.
- `integer(min, max)` inclusive, both safe integers, `range = max - min + 1 <= 2^32`. `limit = floor(2^32 / range) * range`. Draw `u = nextUint32()` until `u < limit`; result `min + (u % range)`. (Rejection sampling; no modulo bias.)
- `boolean(p = 0.5)`: `float() < p`.
- `choose(items)`: `items[integer(0, items.length - 1)]`; throws on an empty list.
- `normal(mean = 0, sd = 1)`: Marsaglia polar. If a spare exists, return `mean + sd * spare` and clear it. Otherwise loop: `u = 2 * float() - 1`, `v = 2 * float() - 1`, `q = u*u + v*v`; reject if `q >= 1` or `q === 0`; `m = sqrt(-2 * ln(q) / q)` using the engine's `ln`; store `spare = v * m`; return `mean + sd * (u * m)`. The raw (unscaled) spare is part of the stream state.
- Every stream exposes `getState()` / `setState()` (four words, spare flag, spare value) for saves.

## 4. Time

`SimulationClock { tick, time, deltaTime }`. `deltaTime` is the fixed config `timestep`; `tick` increases by exactly 1 per step; `time = tick * deltaTime` is computed by **multiplication, never accumulated**. No wall-clock source is read anywhere in the engine.

## 5. Iteration order

- **No system, hash, snapshot, or event may depend on JS object or property enumeration order.**
- Entity stores expose deterministic iteration directly: ascending `EntityId`. Ids come from one monotonic counter and are never reused, so insertion order equals id order; `validate()` checks it. `Map`/`Set` are allowed only inside such stores.
- ESLint (scope `packages/simulation/src`) bans `for...in`, `Object.keys/values/entries`, and `Array.prototype.sort` without a comparator (default sort is lexicographic, not numeric).

## 6. Deterministic math

`math/trig.ts` provides `sin`, `cos`, `atan2`, and `ln` built only from IEEE-exact operations (fdlibm-style kernels), with a documented input domain and accuracy tests (target: within about `1e-12` of the platform `Math.*` on the tested domain). ESLint bans the platform equivalents in `packages/simulation/src`: `Math.sin/cos/tan/asin/acos/atan/atan2/log/log2/log10/exp/pow/hypot/cbrt/sinh/cosh/tanh`, `Math.random`, `Date.now`, `performance.now`, `new Date()`, and the `**` operator.

## 7. State hash

`stateHash()` returns a 32-character lowercase hex string (128 bits).

### 7.1 Byte encoding

| Writer         | Bytes                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `writeUint8`   | 1 byte                                                                                                                          |
| `writeUint32`  | 4 bytes, big-endian                                                                                                             |
| `writeFloat64` | 8 bytes: exact IEEE-754 bits, **big-endian** (`DataView.setFloat64(o, x, false)`), -0 canonicalized to +0, throws if non-finite |
| `writeString`  | `writeUint32(byteLength)` then the UTF-8 bytes                                                                                  |

Never decimal strings, `JSON.stringify`, or `toFixed`.

### 7.2 Hash function

**cyrb128-style**, 4 x 32-bit lanes, fed one byte `k` at a time:

```text
init: h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
per byte k:
  h1 = h2 ^ imul(h1 ^ k, 597399067)
  h2 = h3 ^ imul(h2 ^ k, 2869860233)
  h3 = h4 ^ imul(h3 ^ k, 951274213)
  h4 = h1 ^ imul(h4 ^ k, 2716044179)
finish:
  h1 = imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1
output: hex(h1) hex(h2) hex(h3) hex(h4), each as 8 lowercase hex digits (uint32)
```

### 7.3 Canonical stream, schema versions

The stream is versioned. It begins with the four ASCII bytes `EVOH`, then `writeUint32(HASH_SCHEMA_VERSION)`. Any change to the field list, order, or encoding requires bumping `HASH_SCHEMA_VERSION` and regenerating the golden hashes with a rationale in the PR. Old versions stay documented here rather than being edited in place, so a reader can tell what a golden entry recorded under an older version actually hashed.

#### Version 1 (Phase 2; superseded by version 2 in Phase 3)

| Order | Section    | Contents (in this order)                                                                                                                              |
| ----- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | header     | `"EVOH"`, schema version (u32)                                                                                                                        |
| 2     | seed       | `seed` (u32)                                                                                                                                          |
| 3     | clock      | `tick` (f64), `time` (f64), `deltaTime` (f64)                                                                                                         |
| 4     | ids        | `nextEntityId` (u32)                                                                                                                                  |
| 5     | rng        | for each stream in the fixed order of section 3: 4 state words (u32 each), spare flag (u8), spare value (f64, `0` when absent)                        |
| 6     | organisms  | count (u32), then per organism in ascending id: `id` (u32), `x`, `y`, `vx`, `vy`, `heading`, `age`, `energy` (all f64)                                |
| 7     | resources  | count (u32), then per resource in ascending id: `id` (u32), `x`, `y`, `remaining` (f64)                                                               |
| 8     | metrics    | `organismsBorn`, `deathsByStarvation`, `deathsByAge`, `resourcesSpawned`, `resourcesConsumed` (u32 each), `energyConsumed`, `energyWasted` (f64 each) |
| 9     | extinction | present flag (u8); when present, `extinctionTick` (f64), otherwise `0` (f64)                                                                          |
| 10    | events     | `eventsEmitted` (f64)                                                                                                                                 |

#### Version 2 (Phase 3; superseded by version 3 in Phase 4)

Sections 1-5 and 9-10 are unchanged from version 1. Sections 6 and 8 append new fields at the end (never inserted or reordered), per ADR 0005:

| Order | Section   | Contents (in this order)                                                                                                                                                                                                                               |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6     | organisms | count (u32), then per organism in ascending id: `id` (u32), `x`, `y`, `vx`, `vy`, `heading`, `age`, `energy`, `birthTick`, `lastTurnMagnitude`, `reproductionCooldownRemaining` (all f64), then `parentIds` (`writeUint32(count)` then each id as u32) |
| 8     | metrics   | `organismsBorn`, `deathsByStarvation`, `deathsByAge`, `resourcesSpawned`, `resourcesConsumed`, `reproductionAttempts`, `reproductionSuccesses`, `reproductionFailures` (u32 each), `energyConsumed`, `energyWasted` (f64 each)                         |

#### Version 3 (Phase 4; superseded by version 4 in Phase 5)

Introduced in Phase 4 when organisms started carrying genomes. Sections 1-3, 5 and 7-10 are unchanged from version 2. Sections 4 and 6 append new fields at the end (never inserted or reordered), per ADR 0006:

| Order | Section   | Contents (in this order)                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4     | ids       | `nextEntityId` (u32), then `nextGenomeId` (u32)                                                                                                                                                                                                                                                                                                                                                                            |
| 6     | organisms | count (u32), then per organism in ascending id: every version 2 field, then the genome: `genomeId` (u32); `parentGenomeIds` as count (u32) then each id (u32); every scalar gene in the fixed `GENE_SPECS` order (f64 each; integers and booleans are written as their numeric value); the brain architecture `inputSize`, `hiddenSize`, `memorySize`, `outputSize` (u32 each); the weight count (u32); every weight (f64) |

#### Version 4 (Phase 5; superseded by version 5 in Phase 6)

Introduced in Phase 5 when organisms started carrying a runtime `BrainState` (ADR 0007). Everything in version 3 is unchanged except that the brain architecture in section 6 now has the derived input size 23 and output size 5 and the weight count includes the value-head block (314 by default). Section 6 appends, after the weights of each organism's genome (never inserted):

| Order | Section   | Appended per organism (in this order)                                                                                                                                                                                                                                                                                                                               |
| ----- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6     | organisms | brain present flag (u8); when present: `memory`, `learned`, `eligibility`, `prevHidden`, `prevAction` (each: count u32, then each value f64); `prevValue`, reward `feeding`, `reproduction`, `energyCost`, `total`, `rewardBaseline`, `timeSinceFood`, `energyAtDecision` (f64 each); `decisions` (u32); `rewardTotal` (f64); `updates` (u32); `weightChange` (f64) |

The inspection caches `lastObservation` and `lastOutput` are not hashed: nothing reads them to decide a later tick. Under `learning.controller: 'reflex'` the present flag is 0 and the `learning` stream never advances; under `'brain'` it advances by exactly five normals per organism per tick. The stream's state words are hashed in section 5 (it has been one of the named streams since version 1).

#### Version 5 (current, Phase 6+)

Introduced in Phase 6 with health, resource kinds, hazards and the larger observation (ADR 0009). The header carries the new version, so **every** hash differs from version 4 even for a world whose behavior is unchanged; behavior equivalence is shown by comparing snapshots, events and records against the previous commit instead (docs/ecology/ecology.md). Everything in version 4 is unchanged except: the stream list in section 5 now has seven names (`terrain` is appended last, so its four state words and spare follow `events`), and the brain architecture input size is 33 (weight count 394 by default; Phase 7 made it 37 and 426, ADR 0010, which does not change the schema version because the hash covers genome weights as they are). New fields are appended, never inserted:

| Order | Section    | Appended (in this order)                                                                                                                                                                                                                                                          |
| ----- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6     | organisms  | after the organism's brain state: `health` (f64). Inside the brain state: reward `damage` and `exploration` (f64 each, between `energyCost` and `total`), and after `weightChange` the 64 bytes of the `visited` novelty grid (u8 each)                                           |
| 7     | resources  | after each resource's `remaining`: `kind` (u8)                                                                                                                                                                                                                                    |
| 8     | metrics    | after `energyWasted`: `deathsByDamage` (u32), `damageTaken` (f64)                                                                                                                                                                                                                 |
| 11    | hazards    | after `eventsEmitted`: the hazard count (u32), the next hazard id (u32), then per hazard in ascending id: `id` (u32), kind (u8: 0 damage area, 1 storm), `x`, `y`, `radius`, `damagePerSecond` (f64 each), an expiry-present flag (u8) and `expiresAtTick` (f64, `0` when absent) |
| 12    | remainders | the resource spawn remainder and the storm remainder (f64 each). Both were already simulation state (they decide future spawns); version 4 and earlier did not hash the first, which only mattered for resuming from a save                                                       |

The region map is generated once from the `terrain` stream and never changes, the seasons are a pure function of the clock, and the `MigrationTracker` is a derived record, so none of them is hashed (the `terrain` stream's state is). The `SpeciesRegistry` (ADR 0008) is likewise derived and unhashed.

The `LineageStore` and `HistoryStore` are derived records of what happened, not simulation state, and are **not** hashed (they cannot influence any later tick). The `genetics` stream's four state words are already hashed in section 5 because it has been one of the named streams since version 1.

`WorldConfig` is **not** part of the hash; golden tests pin their config explicitly. Fields for later phases are appended as new sections or new fields with a version bump.

## 8. State identity versus the event log

`stateHash()` identifies **simulation state**, not the contents of the (bounded) event log. `eventsEmitted`, a monotonic counter, is hashed so divergent event production is still caught, without making log retention or dropped-event counts part of simulation identity.

## 9. Golden hashes

Golden files live in `packages/simulation/tests/golden/` and record `{ hashSchemaVersion, engineVersion, entries }`, where each entry pins a seed, a config, a tick count, and the expected hash. A test first compares the golden's `hashSchemaVersion` with the current constant, so a layout change yields an explicit "bump the version and regenerate" message instead of an opaque hash mismatch. Regenerating goldens is a deliberate act in its own commit with the reason in the PR (the PR template's **Changes determinism** box).

## 10. Test vectors

These are computed from the spec above with a reference script and must be reproduced by the engine's tests (added with the RNG in the foundations PR). Values are lowercase hex unless noted.

**xoshiro128\*\* reference** (state `[1, 2, 3, 4]`, decimal): `11520, 0, 5927040, 70819200, 2031721883`.

**splitmix32** from state `0`: `92ca2f0e, 3cd6e3f3, 1b147dcc, 4c081dbf`.

**FNV-1a 32**: empty input `811c9dc5`; `"a"` `e40c292c`.

**Stream derivation** (`s` is the FNV-1a result; words are the splitmix32 outputs; then the first five `nextUint32()` values):

| seed       | stream        | `s`        | state words                           | first five outputs                             |
| ---------- | ------------- | ---------- | ------------------------------------- | ---------------------------------------------- |
| 0          | `world`       | `efd9722d` | `8b62ade1 bf255130 c5944491 34017452` | `c7a2bb45 1bb1a33c 86d23f16 8f092bc7 40d090b8` |
| 12345      | `world`       | `addaf902` | `b5db87a8 d0a8d56a ef5000d3 ceee5ea3` | `d6c1d151 1ab681a1 faa57b3a 9683ec97 7716721f` |
| 12345      | `environment` | `6f3eec1b` | `492c4d1e 8dc897d6 de2ce6ed f409a79d` | `21585272 994942d2 e732875e 8f0ba0d6 de7d2e4a` |
| 4294967295 | `events`      | `db27b2e6` | `22508baa 02d8d2a4 f08f4592 4f1fdf14` | `0e836a3f a003b648 9386b468 a8d03560 10ea8822` |
| 0          | `terrain`     | `1422fca8` | `408be392 28a2f4a9 ffc296b7 c78f641a` | `5280de0d 32e2d253 e744779f e579bdc2 947655ee` |

`s` for every stream at seed `12345`: `world addaf902`, `genetics 7414af4a`, `reproduction 69d29d14`, `environment 6f3eec1b`, `learning f025d548`, `events ba7b610b`, `terrain c1662d8f`.

**`float()`**, seed `12345`, stream `world`, first three: `0.8388949193384299, 0.979087543397773, 0.4651862415849056`.

**All-zero fallback**: with the fallback constant as state, the first three outputs are `92dcf72a, 00544cb2, 3c7807cc`.

**Hash** (bytes exactly as written by the writers in 7.1):

| Input                                                                              | `stateHash`-style output           |
| ---------------------------------------------------------------------------------- | ---------------------------------- |
| no bytes                                                                           | `027ae52ecfc796215593990d4b41437c` |
| header only: `"EVOH"`, `writeUint32(5)`                                            | `6aaa5fb5c2783e3fda99e31ec2a6d1ee` |
| header, `writeUint32(7)`, `writeFloat64(-0)`, `writeFloat64(0.5)`, `writeUint8(1)` | `e3fef3c99039366808f5456325b9750f` |
| same as above with `writeFloat64(+0)` instead of `-0` (proves canonicalization)    | `e3fef3c99039366808f5456325b9750f` |

**`normal()`** (depends on the engine's `ln`; values are exact binary64 results, shown in shortest round-trip form):

- Seed `12345`, stream `world`, `normal()` six times: `-0.08395824436766462, 0.9547267480700918, 0.45671744440420514, -0.09525980130307461, -0.8689923299360515, 1.5297792797712502`. The second value of each pair is the cached spare.
- Seed `0`, stream `environment`, `normal(10, 2)` four times: `11.022975575089307, 10.285749822714616, 9.212597100828681, 9.657366487438306`.

**Deterministic math accuracy.** `sin`, `cos`, `atan2` and `ln` are tested against the platform functions: within `1e-15` absolute for `sin`/`cos` over `|x| <= 1,000,000` (including neighborhoods of multiples of pi/2), within `1e-15` for `atan2`, and within `2e-16` relative for `ln` over `1e-300..1e300`. Inputs outside each function's documented domain throw `RangeError`. The vectors above were also reproduced with a `Math.log` reference and agree exactly.

## 11. Enforcement summary

| Rule                                                                | Enforced by                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------- |
| No platform transcendentals, `Math.random`, wall clock, `**`        | ESLint, `packages/simulation/src`                    |
| No `for...in`, `Object.keys/values/entries`, comparator-less `sort` | ESLint, `packages/simulation/src`                    |
| No DOM/Node/browser types                                           | `tsconfig` (`lib: ES2022`, `types: []`)              |
| Systems do not import each other or `world/`                        | `tools/check-dependency-rules.mjs`                   |
| Finite values, id order, non-negative age                           | `world.validate()`                                   |
| Bit-exact reproducibility                                           | Golden hashes, ubuntu and windows Determinism CI job |
