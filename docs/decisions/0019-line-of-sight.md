# ADR 0019: Line of sight: creatures hide what is behind them

Status: accepted. Builds on [ADR 0016](0016-part-stats-and-attachment.md) ("Directional vision"): an eye sees a cone, and now something in the cone can stand in the way.

## The problem

A creature saw food **straight through another creature** standing in front of it. A test confirmed it: creature 1 faces creature 2, food lies directly behind creature 2 on the same line, and perception reports both the food and the peer. `PerceptionSystem` picks the nearest food or peer inside the range and the cone and never asks whether anything is in the way. With a real field of view that is the next thing that reads as wrong, and it removes a source of competition: a creature stuck behind a crowd cannot see the food the crowd is racing for.

## What changed

- **Another creature's body hides what is behind it.** Each organism is a circle of its body radius (`bodyRadiusOf`). The line from the viewer's position to a candidate is blocked when the closest point of that segment to a circle's centre is nearer than its radius (`spatial/sight.ts`, `segmentHitsCircle`, `+ - * /` and `sqrt` only).
- **The edges, each pinned by a test:** a circle behind the viewer or beyond the target does not block; a target _inside_ a circle is hidden (food under a creature); a circle that already holds the viewer's position does not blind it (bodies overlap freely, they do not push each other apart); the viewer never blocks itself and a peer never blocks itself.
- **Nearest visible, not nearest.** Candidates that pass the range, the cone and the kind's detectability are sorted by distance (ties by id) and the first one that is not hidden is taken, checking at most `perception.maxSightChecks` (6) so a crowded patch costs a bounded amount. Blockers are found through the organism spatial index around the line (its midpoint, half its length plus a 20 unit margin, which is more than the largest possible body radius).
- **What it applies to:** food and the peer sense. **What it does not:** hazards (terrain, not objects), the mating signal and the home sense (not vision), bites (they already need reach and the cone).
- **Config:** `perception.organismsBlockSight` (default `true`) and `perception.maxSightChecks` (default 6). The `classic` preset sets it to `false`: Phase 3 had a transparent world, and the Phase 3 scenario A pin (26 active, 47 born, 21 starved with mutation off) is reproduced exactly with the switch off.
- **State and hash:** none added. It changes what creatures perceive, so goldens regenerate. With the switch off every path is the one it always was, so the equivalence proof is exact.

## Consequences and what it prepares

- A creature in a crowd can lose sight of food, which makes position and timing matter. For peers the effect is small by construction: the nearest peer is nearer than anything that could hide it, so a peer is hidden only by a nearer body that sits slightly off the line.
- The same blocker test is what boulders will use (a circle that blocks sight), with a per-kind `blocksSight`: one rock blocks, a pond does not.
- Cost: one spatial query per checked candidate, capped at six per sense per creature per tick. The probe reports ticks per second against the transparent world.
