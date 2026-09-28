/**
 * What the shared path board needs to know about a game: the grid, whether
 * the line may move diagonally, where it starts, and whether it may grow onto
 * a given cell. Everything game-specific (walls, blocked cells, numbers,
 * where the line ends) lives behind `canExtend`.
 */
export interface PathRules {
  size: number
  /** The line may step to the 8 surrounding cells, not just the 4 orthogonal ones. */
  diagonals: boolean
  /** Cell every line starts on. */
  start: number
  /**
   * May `line` (never empty) grow onto `next`, a grid neighbour of its head
   * not already on the line?
   */
  canExtend: (line: readonly number[], next: number) => boolean
}

/**
 * Grid neighbours of `c`, in a fixed order: up, down, left, right, then the
 * diagonals when allowed. Only bounds are checked, not the game's rules.
 */
export function gridNeighbours(n: number, diagonals: boolean, c: number): number[] {
  const r = Math.floor(c / n)
  const col = c % n
  const out: number[] = []
  if (r > 0) out.push(c - n)
  if (r < n - 1) out.push(c + n)
  if (col > 0) out.push(c - 1)
  if (col < n - 1) out.push(c + 1)
  if (diagonals) {
    if (r > 0 && col > 0) out.push(c - n - 1)
    if (r > 0 && col < n - 1) out.push(c - n + 1)
    if (r < n - 1 && col > 0) out.push(c + n - 1)
    if (r < n - 1 && col < n - 1) out.push(c + n + 1)
  }
  return out
}

/** Fewest moves between two cells on an empty grid: Manhattan, or Chebyshev with diagonals. */
export function gridDistance(n: number, diagonals: boolean, a: number, b: number): number {
  const dr = Math.abs(Math.floor(a / n) - Math.floor(b / n))
  const dc = Math.abs((a % n) - (b % n))
  return diagonals ? Math.max(dr, dc) : dr + dc
}
