# ADR 0020: Starting bodies: every world does not start the same

Status: accepted. Follows [ADR 0012](0012-anatomy.md) (the founder plan), [ADR 0016](0016-part-stats-and-attachment.md) (stats, the 135 degree eye) and the species and mutation work that made bodies matter ([ADR 0008](0008-species.md) addendum, [ADR 0016](0016-part-stats-and-attachment.md) addendum "every part type is reachable").

## The problem

Every world started with the same seven-part body. The owner called that founder bad and asked for two things: a body fitted to the world as it is now (a 135 degree eye, bites, line of sight), and worlds that do not all begin alike. The real goal is **evolution that leads to a variety of parts**, and the founder is only where it starts.

## Decision

1. **The founder plan stays the reference.** `anatomy.founder` is still what every capability is measured against (a factor of 1), so every tuned number and statistical gate keeps its meaning, and `classic` still starts with it. Diet efficiency was already absolute, so a body with another mouth needs no recalibration.
2. **Named starting bodies.** `anatomy.starters` holds hand-designed archetypes in the same shape as the founder. `anatomy.startingBody.mode` is `reference` (the founder plan, as before) or `archetypes`. In `archetypes` mode a world draws one starter with **one draw from the `genetics` stream at the start of the founding step, always**: forcing `startingBody.archetype` takes the same draw, so a forced world and a drawn world that picked the same body have the same streams. Every founder of the world gets that body; species start as one and diverge by evolution. The cluster layout builds on it (its founders still vary in outline and scalar genes).
3. **The world says which it drew** (`World.startingBodyName`, shown as "Started as" in the left rail). Not hashed; no hash or genome version changes (only the founder body vector differs).
4. **Five archetypes**, each fully developed within the budget of 6 and with every part working (tested): _grazer_ (sprout mouth, roomy stomach: grass and fruit), _nectar sipper_ (proboscis, sniffer tuned to nectar, no side thrusters), _fungus scraper_ (radula, filtering intestine), _scout_ (eye on an eyestalk with a narrow 78 degree view reaching 2.75 times as far, three long tails), _tank_ (armour, fat reserve, two strong tails). Each also has its own outline, pattern and accent so the first screen differs.
5. **Defaults.** Presets that evolve bodies use `archetypes`; `classic` and `fixed-bodies` stay on `reference` (`fixed-bodies` runs with anatomy off, where every body reads as the reference, so an archetype would only be paint).

## Measured

Default world (`balanced`), 16 seeds x 30,000 ticks per start, each archetype forced so every seed meets it (`tests/probe/starts.probe.ts`):

| start                    | extinct | mean pop | lowest | starved | part types at end | part types ever | part lists | ticks/s |
| ------------------------ | ------- | -------- | ------ | ------- | ----------------- | --------------- | ---------- | ------- |
| reference (founder plan) | 0       | 57.1     | 39     | 52%     | 11.6 / 16         | 15.7            | 24.4       | 832     |
| grazer                   | 0       | 61.0     | 38     | 55%     | 11.6              | 15.6            | 26.1       | 750     |
| nectar sipper            | 0       | 51.2     | 32     | 50%     | 10.8              | 15.5            | 20.1       | 1000    |
| fungus scraper           | 0       | 55.1     | 32     | 52%     | 11.9              | 15.8            | 27.1       | 905     |
| scout                    | 0       | 44.5     | 21     | 54%     | 10.9              | 15.4            | 24.4       | 1027    |
| tank                     | 0       | 57.3     | 36     | 54%     | 11.3              | 15.6            | 23.0       | 928     |

**Viability bar, set before measuring:** no extinct world in 16 seeds, mean population within 35 percent of the reference, starved share between 35 and 80 percent. All five pass (the scout is lowest, 22 percent under the reference, and the nectar sipper 10 percent under). Ticks per second differ by run load (four probes ran at once), not by body.

**Findings, stated plainly:**

- **Starting variety did not raise part variety.** Part types carried at the end (10.8 to 11.9 of 16), ever seen (15.4 to 15.8) and distinct part lists (20 to 27) are the same for every start, the founder plan included. The variety of parts comes from the mutation reach of the previous change, and it is already high from any start. What starting bodies change is **what each world looks like and eats at the start and which lineages it begins with**, not how many part types evolution eventually reaches.
- **The species metric barely sees a grazer.** The plan distance between the founder and the grazer is 0.007 (weighted by the body weight 0.5; the species threshold is 0.12), because a part both bodies have counts only by how much its stats differ and the sprout mouth is one stat of six; but the grazer digests grass 30 percent better and fungus 40 percent worse. The other pairs sit at 0.07 to 0.21. Species split by body plan, not by what the body does, and this is a known limit of that metric rather than something this change fixes.

## Consequences

- The default config now resolves to the founder plan (`reference`) until a preset opts in, which keeps every earlier pinned number exact: all 24 golden tests (22 entries and 2 meta checks) reproduce unchanged with the mechanism in place (the switch-off proof).
- Worlds from different seeds are less comparable by design. `startingBody.archetype` forces one for comparisons, and a later settings editor and the URL hash can carry it.
- Not done here: a different archetype per cluster, a mixed population within one world, and making the species metric weigh what a body can do.
