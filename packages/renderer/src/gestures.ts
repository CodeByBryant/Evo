/** What a stream of pointer events means for the camera and for selection. */
export type GestureAction =
  | { readonly type: 'pan'; readonly dx: number; readonly dy: number }
  | { readonly type: 'zoom'; readonly factor: number; readonly x: number; readonly y: number }
  | { readonly type: 'click'; readonly x: number; readonly y: number; readonly touch: boolean }

interface Tracked {
  x: number
  y: number
  startX: number
  startY: number
  touch: boolean
}

/**
 * Turns pointer events (mouse, pen, touch) into camera actions: one pointer drags to pan, two
 * pinch to zoom (and pan with their midpoint), the wheel zooms, and a press-release that barely
 * moved is a click. Pure state machine over plain numbers, so it is tested without a DOM.
 */
export class GestureTracker {
  private readonly pointers = new Map<number, Tracked>()
  /** True once a press has moved past the click tolerance; then release is not a click. */
  private dragged = false
  /** Distance between the two pointers at the last event of a pinch. */
  private pinchDistance = 0

  constructor(
    /** How far (px) a press may move and still count as a click. */
    private readonly clickTolerance = 5,
    /** Wheel delta to zoom: `factor = exp(-delta * wheelSensitivity)`. */
    private readonly wheelSensitivity = 0.0015
  ) {}

  pointerDown(id: number, x: number, y: number, touch = false): void {
    this.pointers.set(id, { x, y, startX: x, startY: y, touch })
    if (this.pointers.size === 1) this.dragged = false
    if (this.pointers.size === 2) {
      this.dragged = true
      this.pinchDistance = this.currentPinchDistance()
    }
  }

  pointerMove(id: number, x: number, y: number): GestureAction[] {
    const tracked = this.pointers.get(id)
    if (tracked === undefined) return []
    const dx = x - tracked.x
    const dy = y - tracked.y
    tracked.x = x
    tracked.y = y

    if (this.pointers.size >= 2) {
      const distance = this.currentPinchDistance()
      const out: GestureAction[] = []
      if (this.pinchDistance > 0 && distance > 0) {
        const mid = this.midpoint()
        out.push({ type: 'zoom', factor: distance / this.pinchDistance, x: mid.x, y: mid.y })
        // The midpoint moves with each pointer; half of this pointer's move is the midpoint's.
        out.push({ type: 'pan', dx: dx / 2, dy: dy / 2 })
      }
      this.pinchDistance = distance
      return out
    }

    if (!this.dragged) {
      const movedX = x - tracked.startX
      const movedY = y - tracked.startY
      if (movedX * movedX + movedY * movedY <= this.clickTolerance * this.clickTolerance) return []
      this.dragged = true
    }
    return [{ type: 'pan', dx, dy }]
  }

  pointerUp(id: number, x: number, y: number): GestureAction[] {
    const tracked = this.pointers.get(id)
    this.pointers.delete(id)
    if (tracked === undefined) return []
    if (this.pointers.size === 0 && !this.dragged) {
      return [{ type: 'click', x, y, touch: tracked.touch }]
    }
    if (this.pointers.size === 1) this.pinchDistance = 0
    return []
  }

  pointerCancel(id: number): void {
    this.pointers.delete(id)
    this.pinchDistance = 0
  }

  wheel(deltaY: number, x: number, y: number): GestureAction[] {
    if (deltaY === 0) return []
    return [{ type: 'zoom', factor: Math.exp(-deltaY * this.wheelSensitivity), x, y }]
  }

  private currentPinchDistance(): number {
    const [a, b] = [...this.pointers.values()]
    if (a === undefined || b === undefined) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private midpoint(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()]
    if (a === undefined || b === undefined) return { x: 0, y: 0 }
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
}
