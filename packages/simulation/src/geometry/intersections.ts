import type { Circle, Rect, Vec2 } from '@evo/contracts'
import { clamp } from '../math/scalar'

/** True when `point` lies inside or on the edge of `rect`. */
export function rectContainsPoint(rect: Readonly<Rect>, point: Readonly<Vec2>): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/** Moves `point` to the nearest position inside `rect`. */
export function clampToRect(point: Readonly<Vec2>, rect: Readonly<Rect>): Vec2 {
  return {
    x: clamp(point.x, rect.x, rect.x + rect.width),
    y: clamp(point.y, rect.y, rect.y + rect.height)
  }
}

/** True when `point` lies inside or on the edge of `circle`. */
export function circleContainsPoint(circle: Readonly<Circle>, point: Readonly<Vec2>): boolean {
  const dx = point.x - circle.center.x
  const dy = point.y - circle.center.y
  return dx * dx + dy * dy <= circle.radius * circle.radius
}

/** True when the circles overlap or touch. Compares squared distances, so no square root. */
export function circlesIntersect(a: Readonly<Circle>, b: Readonly<Circle>): boolean {
  const dx = a.center.x - b.center.x
  const dy = a.center.y - b.center.y
  const radii = a.radius + b.radius
  return dx * dx + dy * dy <= radii * radii
}

/** True when the circle overlaps or touches the rectangle. */
export function circleIntersectsRect(circle: Readonly<Circle>, rect: Readonly<Rect>): boolean {
  const nearest = clampToRect(circle.center, rect)
  return circleContainsPoint(circle, nearest)
}
