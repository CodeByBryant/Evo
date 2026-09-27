/**
 * Intentional no-op. The reproduction stage exists in the pipeline so its position is fixed
 * (docs/simulation/update-order.md) before Phase 3 gives it behavior: local, continuous
 * reproduction with no global generations. Nothing in Phase 2 creates an organism after
 * `World.create`.
 */
export class ReproductionSystem {
  update(): void {
    // Reserved for Phase 3.
  }
}
