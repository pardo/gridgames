import type { LineStyle } from '../../hooks/useLineSettings'

export const hue = (i: number, spread: number) => Math.round((i / Math.max(1, spread - 1)) * 320)

export const fireColor = (t: number) => `hsl(${Math.round(t * 48)} 95% ${Math.round(38 + t * 24)}%)`

/** Styles whose colour changes along the path (they keep their palette when solved). */
export const isMulticolor = (s: LineStyle) => s === 'rainbow' || s === 'aurora' || s === 'fire'

/**
 * Colour of the line at step `i`, so cells, numbers and sparks can match it.
 * Null means the style is single-coloured (use the accent).
 */
export function stepColor(s: LineStyle, i: number, pathLen: number, spread: number): string | null {
  if (s === 'rainbow' || s === 'aurora') return `hsl(${hue(i, spread)} 85% 58%)`
  if (s === 'fire') return fireColor(i / Math.max(1, pathLen - 1))
  return null
}
