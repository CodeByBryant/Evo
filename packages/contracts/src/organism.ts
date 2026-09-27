/**
 * An organism's life stage, derived purely from its age against `OrganismConfig.maturityAge` and
 * `senescenceAge` - never stored, always recomputed (docs/simulation/update-order.md, "Life
 * stages"). Juveniles cannot reproduce; senescent organisms can.
 */
export type LifeStage = 'juvenile' | 'mature' | 'senescent'
