import type { PathRules } from '../shared/path/rules'

/**
 * Simple Number Connect: draw one path from 1 through every number in order,
 * filling every open cell. Blocked cells can't be entered; thin walls sit on
 * the line between two neighbouring cells and can't be crossed.
 */
export interface NCPuzzle {
  size: number
  /** Per cell: true if the cell is disabled. */
  blocked: boolean[]
  /** Per cell: wall between this cell and the one to its right. */
  wallRight: boolean[]
  /** Per cell: wall between this cell and the one below it. */
  wallDown: boolean[]
  /** Cell index of number 1, 2, ... N, in order. */
  checkpoints: number[]
}

export function canStep(p: NCPuzzle, a: number, b: number): boolean {
  const n = p.size
  if (p.blocked[a] || p.blocked[b]) return false
  const ar = Math.floor(a / n)
  const ac = a % n
  const br = Math.floor(b / n)
  const bc = b % n
  if (ar === br && bc === ac + 1) return !p.wallRight[a]
  if (ar === br && bc === ac - 1) return !p.wallRight[b]
  if (ac === bc && br === ar + 1) return !p.wallDown[a]
  if (ac === bc && br === ar - 1) return !p.wallDown[b]
  return false
}

/** Open neighbours of every cell, honouring blocked cells and walls. */
export function adjacency(p: NCPuzzle): number[][] {
  const n = p.size
  const adj: number[][] = []
  for (let c = 0; c < n * n; c++) {
    const out: number[] = []
    if (!p.blocked[c]) {
      const r = Math.floor(c / n)
      const col = c % n
      if (col < n - 1 && canStep(p, c, c + 1)) out.push(c + 1)
      if (col > 0 && canStep(p, c, c - 1)) out.push(c - 1)
      if (r < n - 1 && canStep(p, c, c + n)) out.push(c + n)
      if (r > 0 && canStep(p, c, c - n)) out.push(c - n)
    }
    adj.push(out)
  }
  return adj
}

export function openCellCount(p: NCPuzzle): number {
  return p.blocked.reduce((sum, b) => sum + (b ? 0 : 1), 0)
}

/** Map of cell index -> its number (1-based), 0 when unnumbered. */
export function clueMap(p: NCPuzzle): number[] {
  const clue = new Array<number>(p.size * p.size).fill(0)
  p.checkpoints.forEach((cell, i) => (clue[cell] = i + 1))
  return clue
}

/** A complete, valid path: every open cell once, numbers in order, ends on N. */
export function isSolved(p: NCPuzzle, path: number[]): boolean {
  if (path.length !== openCellCount(p)) return false
  if (path[0] !== p.checkpoints[0]) return false
  if (path[path.length - 1] !== p.checkpoints[p.checkpoints.length - 1]) return false
  const clue = clueMap(p)
  const seen = new Set<number>()
  let next = 1
  for (let i = 0; i < path.length; i++) {
    const c = path[i]
    if (seen.has(c) || p.blocked[c]) return false
    if (i > 0 && !canStep(p, path[i - 1], c)) return false
    seen.add(c)
    if (clue[c]) {
      if (clue[c] !== next) return false
      next++
    }
  }
  return next === p.checkpoints.length + 1
}

/** Drawing rules for the shared board: orthogonal steps, numbers in order, stop on the last one. */
export function pathRules(p: NCPuzzle): PathRules {
  const clue = clueMap(p)
  const last = p.checkpoints.length
  return {
    size: p.size,
    diagonals: false,
    start: p.checkpoints[0],
    canExtend: (line, next) => {
      const head = line[line.length - 1]
      if (clue[head] === last || !canStep(p, head, next)) return false
      if (!clue[next]) return true
      // The newest number on the line (1 is always its first cell) must come just before.
      let i = line.length - 1
      while (!clue[line[i]]) i--
      return clue[next] === clue[line[i]] + 1
    },
  }
}
