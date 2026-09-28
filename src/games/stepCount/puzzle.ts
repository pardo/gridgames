import type { PathRules } from '../shared/path/rules'

/**
 * Step Count: draw one line from 1 that fills every open cell, where a cell
 * showing k must be the k-th cell of the line. Depending on the variant the
 * line may also move diagonally, and may or may not cross itself.
 */
export interface SCPuzzle {
  size: number
  /** The line may step to the 8 surrounding cells. */
  diagonals: boolean
  /** Two diagonal moves may cross in an X (only with diagonals). */
  crossings: boolean
  /** Per cell: true if the cell is disabled. */
  blocked: boolean[]
  /** Per cell: wall between this cell and the one to its right. */
  wallRight: boolean[]
  /** Per cell: wall between this cell and the one below it. */
  wallDown: boolean[]
  /** Per cell: the step number shown on it (1-based), 0 when blank. */
  clues: number[]
}

export function openCellCount(p: SCPuzzle): number {
  return p.blocked.reduce((sum, b) => sum + (b ? 0 : 1), 0)
}

/** Cell index of every shown step (index k holds the cell for step k), -1 where hidden. */
export function cellOfStep(p: SCPuzzle): number[] {
  const at = new Array<number>(openCellCount(p) + 1).fill(-1)
  p.clues.forEach((k, c) => {
    if (k) at[k] = c
  })
  return at
}

function wallBetween(p: SCPuzzle, a: number, b: number): boolean {
  const n = p.size
  if (b === a + 1) return p.wallRight[a]
  if (b === a - 1) return p.wallRight[b]
  if (b === a + n) return p.wallDown[a]
  return p.wallDown[b]
}

/**
 * One move from a to b, ignoring the rest of the line. Orthogonal moves stop
 * at walls. A diagonal move passes through the corner the two cells share, and
 * is shut when two or more of the four walls meeting at that corner are up.
 */
export function canStep(p: SCPuzzle, a: number, b: number): boolean {
  const n = p.size
  if (p.blocked[a] || p.blocked[b]) return false
  const ar = Math.floor(a / n)
  const ac = a % n
  const br = Math.floor(b / n)
  const bc = b % n
  const dr = Math.abs(ar - br)
  const dc = Math.abs(ac - bc)
  if (dr + dc === 1) return !wallBetween(p, a, b)
  if (dr !== 1 || dc !== 1 || !p.diagonals) return false
  // The other two cells of the 2x2 square: beside a, and above/below a.
  const side = ar * n + bc
  const updown = br * n + ac
  const walls =
    +wallBetween(p, a, side) + +wallBetween(p, a, updown) + +wallBetween(p, side, b) + +wallBetween(p, updown, b)
  return walls < 2
}

/**
 * True when the move a -> b is a diagonal that would cross an existing
 * diagonal of the line, i.e. the square's other two cells are consecutive
 * on it. `pos` gives each cell's index on the line (-1 when not on it).
 */
export function crossesLine(n: number, a: number, b: number, pos: (c: number) => number): boolean {
  const ar = Math.floor(a / n)
  const br = Math.floor(b / n)
  const ac = a % n
  const bc = b % n
  if (ar === br || ac === bc) return false
  const i = pos(ar * n + bc)
  const j = pos(br * n + ac)
  return i >= 0 && j >= 0 && Math.abs(i - j) === 1
}

/** Legal moves from every cell, honouring blocked cells, walls and the diagonal setting. */
export function adjacency(p: SCPuzzle): number[][] {
  const n = p.size
  const adj: number[][] = []
  for (let c = 0; c < n * n; c++) {
    const out: number[] = []
    if (!p.blocked[c]) {
      const r = Math.floor(c / n)
      const col = c % n
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue
          const rr = r + dr
          const cc = col + dc
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue
          if (canStep(p, c, rr * n + cc)) out.push(rr * n + cc)
        }
      }
    }
    adj.push(out)
  }
  return adj
}

/** A complete, valid line: every open cell once, legal moves, every shown number on its step. */
export function isSolved(p: SCPuzzle, path: number[]): boolean {
  if (path.length !== openCellCount(p)) return false
  const pos = new Map<number, number>()
  for (let i = 0; i < path.length; i++) {
    const c = path[i]
    if (pos.has(c) || p.blocked[c]) return false
    if (p.clues[c] && p.clues[c] !== i + 1) return false
    if (i > 0) {
      const prev = path[i - 1]
      if (!canStep(p, prev, c)) return false
      if (!p.crossings && crossesLine(p.size, prev, c, (x) => pos.get(x) ?? -1)) return false
    }
    pos.set(c, i)
  }
  return true
}

/**
 * Drawing rules for the shared board. Only the moves themselves are enforced:
 * the line may run over a number on the wrong step (the board shows it red),
 * so the puzzle is about finding the route, not feeling where the line sticks.
 */
export function pathRules(p: SCPuzzle): PathRules {
  const total = openCellCount(p)
  return {
    size: p.size,
    diagonals: p.diagonals,
    start: p.clues.indexOf(1),
    canExtend: (line, next) => {
      const head = line[line.length - 1]
      if (line.length >= total || !canStep(p, head, next)) return false
      return p.crossings || !crossesLine(p.size, head, next, (c) => line.indexOf(c))
    },
  }
}
