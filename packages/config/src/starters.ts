import type { FounderPart, PartType, StartingBody } from '@evo/contracts'
import { OUTLINE_MAX_POINTS } from '@evo/contracts'

/**
 * The bodies a world can start with (ADR 0020). Each is a plan like the founder's (`founder` in
 * `anatomy.ts`) and fits the structural budget so it develops completely. The founder stays the
 * reference every capability is measured against; these are places to start from, designed to
 * differ in what they eat and how they move and see, so worlds do not all begin the same.
 *
 * Orientations are relative to the outline's outward direction at each anchor and were computed
 * from the developed body (`tests/probe/starts.probe.ts` prints the check): tails push forward,
 * eyes look along the heading. The five were probed for viability before they shipped (ADR 0020
 * "Measured").
 */
const MID = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]

/** One part: slot order is list order; `parent` is 0 (the body) or the 1-based number of an earlier part. */
function part(
  type: PartType,
  size: number,
  angle: number,
  offset: number,
  orientation: number,
  parent = 0,
  stats: number[] = MID
): FounderPart {
  return { type, parent, size, angle, offset, orientation, integrity: 1, stats }
}

/** An 8-point outline from its front half (the back half mirrors it, left to right). */
function outline(half: number[]): StartingBody['outline'] {
  return {
    count: 8,
    radii: [
      ...half,
      ...[...half].reverse(),
      ...new Array<number>(OUTLINE_MAX_POINTS - 8).fill(0.8)
    ],
    angles: new Array<number>(OUTLINE_MAX_POINTS).fill(0.5)
  }
}

export const DEFAULT_STARTERS: StartingBody[] = [
  {
    name: 'grazer',
    description:
      'A sprout mouth and a roomy stomach: built for grass and fruit, the commonest food.',
    parts: [
      part('flagellum', 0.6, 2.6, 0.8, 0.8999, 0),
      part('flagellum', 0.6, 3.6832, 0.8, 5.3833, 0),
      part('cilia', 0.4, 1.5708, 1, 6.1576, 0),
      part('cilia', 0.4, 4.7124, 1, 0.1256, 0),
      part('eye', 0.5, 0.5, 0.8, 5.4147, 0, [0.5, 0.5, 0.3211, 0.5, 0.5, 0.5]),
      part('mouth', 0.6, 0, 1, 0, 0, [0.5, 0.65, 0.1, 0.5, 0.5, 0.5]),
      part('stomach', 0.7, 3.1416, 0.2, 0, 0, [0.75, 0.5, 0.5, 0.5, 0.5, 0.5])
    ],
    look: { pattern: 1, accentHue: 0.3 },
    outline: outline([0.9, 0.84, 0.8, 0.88])
  },
  {
    name: 'nectar-sipper',
    description:
      'A long proboscis and a nose tuned to nectar: finds scarce, rich food by smell, with no side thrusters.',
    parts: [
      part('flagellum', 0.6, 2.6, 0.8, 1.0129, 0),
      part('flagellum', 0.6, 3.6832, 0.8, 5.2703, 0),
      part('eye', 0.5, 0.5, 0.8, 5.23, 0, [0.5, 0.5, 0.3211, 0.5, 0.5, 0.5]),
      part('mouth', 0.5, 0, 1, 0, 0, [0.7, 0.5, 0.3, 0.6, 0.5, 0.5]),
      part('sniffer', 0.4, 0.9, 1, 5.23, 0, [0.6, 0.6, 0.875, 0.5, 0.5, 0.5]),
      part('stomach', 0.4, 3.1416, 0.2, 0, 0, [0.4, 0.5, 0.5, 0.5, 0.5, 0.5])
    ],
    look: { pattern: 2, accentHue: 0.85 },
    outline: outline([0.98, 0.78, 0.66, 0.8])
  },
  {
    name: 'fungus-scraper',
    description:
      'A rasping radula and a filtering intestine: eats the toxic fungus the others avoid.',
    parts: [
      part('flagellum', 0.6, 2.6, 0.8, 0.728, 0),
      part('flagellum', 0.6, 3.6832, 0.8, 5.5552, 0),
      part('cilia', 0.4, 1.5708, 1, 6.1576, 0),
      part('cilia', 0.4, 4.7124, 1, 0.1256, 0),
      part('eye', 0.5, 0.5, 0.8, 5.5526, 0, [0.5, 0.5, 0.3211, 0.5, 0.5, 0.5]),
      part('mouth', 0.5, 0, 1, 0, 0, [0.5, 0.5, 0.7, 0.5, 0.5, 0.5]),
      part('intestine', 0.5, 2.5133, 0.4, 0, 0, [0.6, 0.6, 0.85, 0.5, 0.5, 0.5]),
      part('stomach', 0.5, 3.1416, 0.2, 0, 0)
    ],
    look: { pattern: 3, accentHue: 0.6 },
    outline: outline([0.86, 0.9, 0.86, 0.82])
  },
  {
    name: 'scout',
    description:
      'An eye on a stalk with a narrow, far-reaching view and three long tails: fast and sharp-sighted, with little in reserve.',
    parts: [
      part('flagellum', 0.5, 2.6, 0.8, 0.9637, 0, [0.75, 0.5, 0.55, 0.5, 0.5, 0.5]),
      part('flagellum', 0.5, 3.6832, 0.8, 5.3195, 0, [0.75, 0.5, 0.55, 0.5, 0.5, 0.5]),
      part('flagellum', 0.5, 3.1416, 0.8, 0, 0, [0.75, 0.5, 0.55, 0.5, 0.5, 0.5]),
      part('eyestalk', 0.4, 0.5, 1, 5.1516, 0, [0.7, 0.5, 0.5, 0.5, 0.5, 0.5]),
      part('eye', 0.5, 0, 1, 0, 4, [0.7, 0.6, 0.15, 0.5, 0.5, 0.5]),
      part('mouth', 0.5, 0, 1, 0, 0),
      part('stomach', 0.4, 2.1991, 0.2, 0, 0, [0.4, 0.5, 0.5, 0.5, 0.5, 0.5])
    ],
    look: { pattern: 0, accentHue: 0.05 },
    outline: outline([1, 0.74, 0.62, 0.72])
  },
  {
    name: 'tank',
    description:
      'Armour plating and a fat reserve behind two strong tails: slow, tough, and hard to starve or hurt.',
    parts: [
      part('flagellum', 0.6, 2.6, 0.8, 0.7854, 0, [0.5, 0.5, 0.75, 0.5, 0.5, 0.5]),
      part('flagellum', 0.6, 3.6832, 0.8, 5.4978, 0, [0.5, 0.5, 0.75, 0.5, 0.5, 0.5]),
      part('armor', 0.8, 1.5708, 1, 0, 0, [0.6, 0.6, 0.6, 0.5, 0.5, 0.5]),
      part('lipid', 0.6, 3.1416, 0.3, 0, 0, [0.6, 0.5, 0.5, 0.5, 0.5, 0.5]),
      part('eye', 0.5, 0.5, 0.8, 5.4978, 0, [0.5, 0.5, 0.45, 0.5, 0.5, 0.5]),
      part('mouth', 0.5, 0, 1, 0, 0),
      part('stomach', 0.5, 2.6704, 0.2, 0, 0)
    ],
    look: { pattern: 1, accentHue: 0.55 },
    outline: outline([0.92, 0.92, 0.9, 0.9])
  }
]
