# 0007: Learning and the brain (reinforcement learning during life)

Status: **Accepted** (approved by the project owner with the Phase 5 plan, 2026-10-23)

## Problem

Phase 4 gave every organism a heritable genome that includes brain weights and seven learning genes, but nothing reads them: organisms still behave by a hand-coded forager (`DecisionSystem`: seek the nearest perceived food, else wander). Phase 5 (roadmap, Dec 28 2026 - Jan 24 2027) makes the brain real: organisms observe the world, a small deterministic neural network chooses actions, rewards are recorded, weights change during life, and the inheritance modes decide how much of that learning is passed on.

Three forks were resolved with the project owner before this ADR:

- **Founders get an innate prior.** Founder brains are pre-wired, plus small noise, to approximate the old forager, so the ecology stays stable and selection acts on the brain immediately. `genetics.brain.innatePrior: false` gives random brains for experiments. The old forager stays available as `learning.controller: 'reflex'`.
- **The full roadmap `Action` has five outputs:** thrust, turn, strafe, interact, explore.
- **Actor-critic is in Phase 5**, behind the same `LearningAlgorithm` interface as reward-modulated Hebbian learning.

One interpretation was added to the second fork: the last three outputs are made **effective** rather than produced-and-ignored (dead outputs would be adjusted as pure noise by learning). `strafe` is lateral velocity, `interact > 0` gates consumption, and `explore` scales exploration noise. Under the `reflex` controller they take fixed values (strafe 0, interact 1) so the Phase 4 behavior is reproduced exactly.

## Decision

The mechanism, formulas and weight layout are specified in [docs/learning/brain.md](../learning/brain.md). Summary of the decisions and why:

### Observation and action are fixed-size contracts

`OBSERVATION_SIZE = 23` and `ACTION_SIZE = 5` live in `@evo/contracts` with stable, exported labels. Genome brain dimensions are **derived** from them (`architectureOf` in `GenomeFactory.ts` is the single place), and `genetics.brain.inputSize/outputSize` are removed from config, so config and code can never disagree about the shape of a brain. `hiddenSize` and `memorySize` stay configurable.

`ownHealth` from the roadmap is omitted: there is no health until Phase 6. `survival`, `exploration` and `damage` reward terms are omitted until something gives them meaning; in particular, survival is explicitly **not** rewarded indefinitely (it would teach organisms nothing but staying alive).

### A recurrent network with an activation that needs no `exp`

The determinism policy bans platform `exp`/`tanh`. The activation is **softsign**, `x / (1 + |x|)`, using only `+`, `/` and `abs`. The network is recurrent: a `memory` vector is fed back into the hidden layer and rewritten each tick, which is what gives the brain memory (roadmap 5.1). The critic's value head is an **8th weight block** present in every genome regardless of the learning algorithm, so a genome's shape never depends on which algorithm is running and ablations compare like for like. The default weight count becomes 314 (input 23, hidden 8, memory 4, output 5). Phase 6 (ADR 0009) appended ten observation slots, making the input 33 and the default weight count 394.

### Learning changes a runtime overlay, never the genome

Genomes stay immutable (ADR 0006). Each organism has a `BrainState`: its memory, an `learned` overlay holding the current values of the learnable block (actor output weights and biases, plus the value head), eligibility traces, the previous hidden activations, action and value estimate, the reward settled last tick, a running reward baseline and lifetime telemetry. The genome holds the starting values; the overlay is what learning moves. `BrainState` is simulation state and is hashed (**hash schema v4**), appended after the genome.

Only the output layer and value head learn. This keeps the update a local, inspectable three-factor rule rather than full backpropagation, matches the "reward-modulated Hebbian" the roadmap names, and bounds the cost of a tick. The hidden layer and recurrence are shaped by evolution, which is the point of having both.

### Two learners, one interface

`LearningAlgorithm { decide(context, brain): Action }` (roadmap 5.5): `decide` observes, learns from the previous transition, and acts, so the learning step is part of the algorithm's own contract rather than a separate call that could be skipped or reordered. Both learners share one actor update, `learned += eta * delta * eligibility`, clamped to `+-learning.weightLimit`, with an eligibility trace that correlates exploration noise with hidden activity (node perturbation). They differ only in `delta`:

- **Reward-modulated Hebbian:** `delta = reward - runningBaseline`.
- **Actor-critic:** `delta = reward + gamma * V(next) - V(prev)` (the TD error), which also trains the value head.

Live genes: `learningRate`, `discountFactor`, `eligibilityTraceDecay`, `explorationRate`, `persistence` (how much exploration is kept as an organism ages, roadmap 5.6). `noveltyPreference` and `riskTolerance` stayed **carried but unread** in Phase 5: there was no novelty reward and there were no hazards, and the docs said so plainly rather than inventing a meaning. Phase 6 (ADR 0009) gave them one: `riskTolerance` scales the damage penalty and `noveltyPreference` the exploration reward.

`learning.enabled: false` freezes the overlay but keeps exploration noise, so toggling it isolates the effect of learning from the effect of acting noisily.

### Reward is derived from events, per tick

Reward is computed at the end of the tick from that tick's events and energy change and stored for the next decision to learn from: `feeding` (energy consumed / capacity), `reproduction` (a bonus for a successful attempt, to initiator and partner), and `energyCost` (metabolic cost / capacity, derived exactly as the energy change minus gains plus reproduction cost). Reward weights are config. Because reward lags the decision by one tick, `BrainSystem` has **two entry points** in the pipeline, like `EnvironmentSystem`.

### Pipeline

```text
... perception -> brain.decide -> movement -> interaction -> metabolism -> reproduction -> death -> brain.settle -> metrics
```

`brain.decide` observes, learns from last tick's reward, and writes the intent. `brain.settle` computes this tick's reward. With `learning.controller: 'reflex'` the old `DecisionSystem` runs and both brain stages are skipped. Under the brain controller the `learning` RNG stream (reserved since Phase 1) draws exactly five normals per organism per tick in ascending id, **always**, so draw counts never depend on the learning settings; under `reflex` it is never drawn from.

### Capability is not free, again

A higher learning rate must not be a free lunch, so metabolism gains the deferred `learningCost`: `organisms.learningCost * (learningRate / baseline)` per second while learning is enabled under the brain controller, mirroring the sensor-cost coupling of ADR 0006.

### Inheritance is wired through the existing pure function

At reproduction each parent's effective weights are `inheritedBrainWeights(genome weights, learned overlay, mode, fraction)`, and the recombiner then runs on those effective genomes. Child `BrainState` always starts fresh from its (possibly Lamarckian-seeded) genome. This reuses the Phase 4 code unchanged and leaves the recombiner API as it was.

### Scenario D needs a place for food to be

`resources.region` is an optional rectangle (default `null`: the whole world) restricting where food spawns. With `null`, the `environment` stream draws are identical to Phase 4.

## Alternatives considered

- **Random founder brains.** Honest, but the ecology would almost surely collapse in the first generations while selection discovers foraging; Phase 5 would then be tuning a pathology. Available as `innatePrior: false`.
- **Full backpropagation or a policy-gradient over all weights.** More powerful, but costly per tick, hard to inspect, and unlike the roadmap's reward-modulated rule. The shared three-factor update keeps both learners comparable.
- **`Math.tanh` or a lookup table.** Banned by the determinism policy (platform dependence) or an extra thing to validate; softsign needs neither.
- **Storing learned weights in the genome.** Would break genome immutability and make Baldwinian and Lamarckian inheritance indistinguishable by construction.
- **Rewarding survival time.** Rejected: it has no ceiling and teaches nothing.

## Consequences

- Hash schema bumps to **v4** and goldens are regenerated; the behavior-preserving integration was proven before the default switched to `'brain'`: with `controller: 'reflex'` and mutation off, 21 scenarios (snapshots every 250 ticks, the full event log and the historical records) hashed identically against a pristine Phase 4 worktree. Mutation-on pins moved only because the larger genome draws more founder weights from the `genetics` stream. Permanent reflex-mode golden entries keep that path protected.
- Switching the default controller is a deliberate behavior change; its gates are stated up front: reflex mode still reproduces Phase 4, the innate-prior brain forages within a stated band of the reflex controller, and the population stays in its stability band on several seeds. If a gate fails, the prior and exploration defaults are tuned, not the gate.
- Per-tick cost rises (five normal draws and a roughly 300-multiply forward pass per organism); it is measured and reported.
- Phase 6 inherits a place to put a `health` observation and a `damage` reward term.
