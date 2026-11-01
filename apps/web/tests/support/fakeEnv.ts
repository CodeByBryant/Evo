import type { HostEnvironment } from '../../src/host/SimulationHost'

/**
 * A manual clock and frame scheduler. Every `now()` call advances time a little, standing in for
 * the cost of stepping, so the host's per-frame budget behaves like it does in a browser.
 */
export class FakeEnv implements HostEnvironment {
  time = 0
  private callbacks = new Map<number, () => void>()
  private nextHandle = 1
  seeds: number[] = []

  constructor(private readonly costPerNowMs = 0.02) {}

  now(): number {
    this.time += this.costPerNowMs
    return this.time
  }

  requestFrame(callback: () => void): number {
    const handle = this.nextHandle++
    this.callbacks.set(handle, callback)
    return handle
  }

  cancelFrame(handle: number): void {
    this.callbacks.delete(handle)
  }

  randomSeed(): number {
    return this.seeds.shift() ?? 777
  }

  get pendingFrames(): number {
    return this.callbacks.size
  }

  /** Lets `ms` of time pass and runs the frame callbacks that were waiting. */
  frame(ms = 16): void {
    this.time += ms
    const waiting = [...this.callbacks.entries()]
    this.callbacks.clear()
    for (const [, callback] of waiting) callback()
  }

  /** Runs frames until `done()` or `maxFrames`. */
  runUntil(done: () => boolean, ms = 16, maxFrames = 100_000): number {
    let frames = 0
    while (!done() && frames < maxFrames && this.pendingFrames > 0) {
      this.frame(ms)
      frames++
    }
    return frames
  }
}
