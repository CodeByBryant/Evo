/** A point or direction in 2D world space. */
export interface Vec2 {
  x: number
  y: number
}

/** An axis-aligned rectangle; `x`/`y` is the top-left corner. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A circle described by its center and radius. */
export interface Circle {
  center: Vec2
  radius: number
}
