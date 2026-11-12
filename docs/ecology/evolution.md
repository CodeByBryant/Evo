# Evolution observatory

How to read the indicators the app and `evo-sim --observatory` report. See [ADR 0024](../decisions/0024-evolution-observatory.md) for why they exist, how they were checked and what they cannot tell you.

They are **read-only** and **not hashed**: switching `observatory.enabled` off changes no simulation state. A sample is taken every `observatory.sampleEvery` ticks (500, 50 simulated seconds).

| Indicator               | Read it as                                                                                                                    | Low or flat means                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Plans that took hold    | body plans (functional part types, mouth form, size bin) that lived for three samples and reached 2 percent of the population | no new body plan is succeeding      |
| Effective plans         | how many equally common plans the population is worth (1 = one plan)                                                          | one plan dominates                  |
| Response types / spread | how differently the brains would act in the same eight situations                                                             | brains respond alike                |
| Brain drift             | how far the inherited brains are from the innate prior (the founders start near 0.013)                                        | evolution has not rewired the brain |
| Input usage             | mean absolute input weight per group (self, food, peer, hazard, season, mate, home, prey, threat)                             | a group is not wired                |
| Trait change            | the movement of trait means since the last sample, as a share of their ranges                                                 | traits are not moving               |
| Intake shares           | where the energy taken in came from: plants, flesh, carrion                                                                   |                                     |
| Stasis                  | no new plan, trait change under 0.1 percent and brain drift moving under 0.03 percent a sample, for ten samples               | the world has settled (or died)     |

Comparisons mean something only against a control: `tests/probe/evolution.probe.ts` runs a setup over seeds and prints the first half of the run against the second (`EVO_NAME`, `EVO_PRESET`, `EVO_CONFIG`, `EVO_SEEDS`, `EVO_TICKS`; one line and a mean series CSV go to `<tmpdir>/evo-probe/`). Use a frozen world (`genetics.mutationRateScale: 0`, `anatomy.startingBody.groups: []`) as the floor and `rapid-evolution` as the ceiling.
