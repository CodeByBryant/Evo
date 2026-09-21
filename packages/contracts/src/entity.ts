/**
 * Identifies an organism or resource.
 *
 * Ids come from a single monotonic counter per world and are never reused, so ascending id order
 * is also creation order. Deterministic iteration everywhere in the engine relies on this.
 */
export type EntityId = number
