/**
 * The three arrangements of the docked interface (docs/architecture/interface-design.md):
 * `wide` and `laptop` are the same grid at two sizes (top bar, left rail, world, bottom strip, right
 * rail); `phone` is one column, with the rails as sheets. The stylesheet's media queries use the
 * same two widths, and `tools/layout-breakpoints.test.mjs` holds them together.
 */
export type LayoutKind = 'wide' | 'laptop' | 'phone'

/** The widest window that still gets the phone arrangement, in CSS pixels. */
export const PHONE_MAX_WIDTH = 800
/** The widest window that still gets the laptop sizes; anything wider is `wide`. */
export const LAPTOP_MAX_WIDTH = 1279

/** The arrangement for a window `width` CSS pixels wide (a width that is not a number is a phone: the safest). */
export function layoutFor(width: number): LayoutKind {
  if (!(width > PHONE_MAX_WIDTH)) return 'phone'
  return width > LAPTOP_MAX_WIDTH ? 'wide' : 'laptop'
}
