/** 
 * @author By Bryant Ejorh - CodeByBryant
 * 
 * MIT License 2024
 * 
 * @fileoverview Utilities for EvoSquares

*/

export type Point = { x: number; y: number }

/**
 * Lightens a given hexadecimal color by a specified percentage.
 *
 * This function takes a hex color code (e.g., "#FF5733") and lightens it by the
 * provided percentage. It increases the RGB values proportionally and caps them
 * at 255 to prevent overflow. This is commonly used for generating lighter
 * shades of colors for UI effects or highlighting elements.
 *
 * @param {string} hex - The hex color code to be lightened. It can be in the
 *                        format of "#RRGGBB" or "RRGGBB" (without the "#").
 * @param {number} percentage - The percentage by which to lighten the color.
 *                               This value should be a positive number (e.g., 0.1
 *                               for 10%, 0.5 for 50%).
 *                               The larger the value, the lighter the color.
 *
 * @returns {string} The new hex color code representing the lightened color.
 *                   The output will be in the format of "#RRGGBB".
 *
 * @example
 * const originalColor = "#FF5733"; // A shade of red
 * const lightenedColor = lightenHexColor(originalColor, 0.2); // Lighten by 20%
 * console.log(lightenedColor); // Output: A lighter shade of red, e.g., "#FF8A66"
 */

export const lightenHexColor = (hex: string, percentage: number): string => {
  // Remove the '#' if it exists
  hex = hex.replace('#', '')

  // Convert hex to RGB
  let r: number = parseInt(hex.substring(0, 2), 16)
  let g: number = parseInt(hex.substring(2, 4), 16)
  let b: number = parseInt(hex.substring(4, 6), 16)

  // Increase the RGB values by the percentage (15%)
  r = Math.min(255, Math.round(r * (1 + percentage)))
  g = Math.min(255, Math.round(g * (1 + percentage)))
  b = Math.min(255, Math.round(b * (1 + percentage)))

  // Convert RGB back to hex
  const newHex: string =
    '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()

  return newHex
}
