import type { Difficulty } from '../types'
import { adjacency, canStep, crossesLine, type SCPuzzle } from './puzzle'
import { solve } from './solver'
import type { MoveRules } from './variants'

interface DifficultyParams {
  /** Share of cells that get blocked. */
  blockedRatio: number
  /** Share of unused orthogonal edges that get a wall. */
  wallRatio: number
  /** Stop hiding numbers once only this share of cells still shows one. */
  minShown: number
  /** Most steps allowed between two shown numbers. */
  maxGap: number
  /**
   * Which numbers to try hiding first. Numbers where the line turns are the
   * most telling: easy hides the straight-run ones first (turns stay visible),
   * hard hides turns first.
   */
  hideTurnsFirst: boolean
}

/**
 * Diagonal moves leave far more ways to reroute a stretch, so a unique answer
 * needs ~30% of cells shown whatever we ask for. Their easy and medium keep
 * more numbers and shorter gaps on purpose, so the difficulties still differ.
 */
const PARAMS: Record<'orthogonal' | 'diagonal', Record<Difficulty, DifficultyParams>> = {
  orthogonal: {
    easy: { blockedRatio: 0.03, wallRatio: 0, minShown: 0.4, maxGap: 4, hideTurnsFirst: false },
    medium: { blockedRatio: 0.06, wallRatio: 0.03, minShown: 0.28, maxGap: 7, hideTurnsFirst: false },
    hard: { blockedRatio: 0.09, wallRatio: 0.07, minShown: 0.18, maxGap: Infinity, hideTurnsFirst: true },
  },
  diagonal: {
    easy: { blockedRatio: 0.03, wallRatio: 0, minShown: 0.5, maxGap: 3, hideTurnsFirst: false },
    medium: { blockedRatio: 0.06, wallRatio: 0.03, minShown: 0.4, maxGap: 5, hideTurnsFirst: false },
    hard: { blockedRatio: 0.09, wallRatio: 0.07, minShown: 0.2, maxGap: Infinity, hideTurnsFirst: true },
  },
}

/** Node budget for each uniqueness check while hiding numbers. */
const SOLVE_BUDGET = 150_000

type Rng = () => number

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function emptyPuzzle(size: number, moves: MoveRules): SCPuzzle {
  const cells = size * size
  return {
    size,
    diagonals: moves.diagonals,
    crossings: moves.diagonals && moves.crossings,
    blocked: new Array<boolean>(cells).fill(false),
    wallRight: new Array<boolean>(cells).fill(false),
    wallDown: new Array<boolean>(cells).fill(false),
    clues: new Array<number>(cells).fill(0),
  }
}

const colour = (n: number, c: number) => (Math.floor(c / n) + (c % n)) % 2

function pickBlocked(p: SCPuzzle, count: number, rng: Rng): boolean {
  const n = p.size
  for (const c of shuffle([...Array(n * n).keys()], rng).slice(0, count)) p.blocked[c] = true
  if (p.diagonals) return true
  // An orthogonal line alternates checkerboard colours, so the open cells
  // must be balanced to within one.
  let balance = 0
  for (let c = 0; c < n * n; c++) if (!p.blocked[c]) balance += colour(n, c) ? 1 : -1
  return Math.abs(balance) <= 1
}

/** Randomised DFS for a line through every open cell, honouring the move rules. */
function randomLine(p: SCPuzzle, rng: Rng, budget = 30_000): number[] | null {
  const n = p.size
  const cells = n * n
  const adj = adjacency(p)
  const open = [...Array(cells).keys()].filter((c) => !p.blocked[c])
  const total = open.length

  let starts = open
  if (!p.diagonals) {
    const black = open.filter((c) => colour(n, c) === 0)
    const white = open.filter((c) => colour(n, c) === 1)
    if (black.length !== white.length) starts = black.length > white.length ? black : white
  }
  const start = starts[Math.floor(rng() * starts.length)]

  const pos = new Int32Array(cells).fill(-1)
  const path: number[] = [start]
  pos[start] = 0
  let nodes = 0
  const posOf = (c: number) => pos[c]

  const feasible = (head: number): boolean => {
    let deadEnds = 0
    let first = -1
    let remaining = 0
    for (const u of open) {
      if (pos[u] >= 0) continue
      remaining++
      if (first < 0) first = u
      let free = 0
      for (const v of adj[u]) if (pos[v] < 0 || v === head) free++
      if (free === 0) return false
      if (free === 1 && ++deadEnds > 1) return false
    }
    if (remaining === 0) return true
    const seen = new Uint8Array(cells)
    const stack = [first]
    seen[first] = 1
    let reached = 0
    let touchesHead = false
    while (stack.length) {
      const u = stack.pop()!
      reached++
      for (const v of adj[u]) {
        if (v === head) touchesHead = true
        if (pos[v] >= 0 || seen[v]) continue
        seen[v] = 1
        stack.push(v)
      }
    }
    return touchesHead && reached === remaining
  }

  const onward = (c: number) => adj[c].reduce((s, v) => s + (pos[v] < 0 ? 1 : 0), 0)

  const dfs = (head: number): boolean => {
    if (path.length === total) return true
    if (++nodes > budget) return false
    if (!feasible(head)) return false
    const options = shuffle(
      adj[head].filter((v) => pos[v] < 0 && (p.crossings || !crossesLine(n, head, v, posOf))),
      rng,
    ).sort((a, b) => onward(a) - onward(b))
    for (const nb of options) {
      pos[nb] = path.length
      path.push(nb)
      if (dfs(nb)) return true
      path.pop()
      pos[nb] = -1
      if (nodes > budget) return false
    }
    return false
  }

  return dfs(start) ? path : null
}

/**
 * Backbite moves: join one end of the line to one of its neighbours further
 * along and cut the edge just before it. Always yields another line through
 * every cell, and repeating it scrambles the tidy spirals a DFS produces.
 * Without crossings, a move whose new diagonal would cross the line is skipped.
 */
function backbite(p: SCPuzzle, path: number[], steps: number, rng: Rng): number[] {
  const n = p.size
  const adj = adjacency(p)
  let cur = path.slice()
  const pos = new Int32Array(n * n)
  const posOf = (c: number) => pos[c]
  for (let s = 0; s < steps; s++) {
    if (rng() < 0.5) cur.reverse()
    cur.forEach((c, i) => (pos[c] = i))
    const head = cur[0]
    const options = adj[head].filter((v) => v !== cur[1])
    if (!options.length) continue
    const v = options[Math.floor(rng() * options.length)]
    if (!p.crossings && crossesLine(n, head, v, posOf)) continue
    const j = pos[v]
    cur = [...cur.slice(0, j).reverse(), ...cur.slice(j)]
  }
  return cur
}

function setWall(p: SCPuzzle, a: number, b: number, on: boolean) {
  const n = p.size
  if (b === a + 1) p.wallRight[a] = on
  else if (b === a - 1) p.wallRight[b] = on
  else if (b === a + n) p.wallDown[a] = on
  else if (b === a - n) p.wallDown[b] = on
}

/** Sprinkle walls on edges the line never uses, keeping every one of its diagonal moves open. */
function addDecoyWalls(p: SCPuzzle, path: number[], ratio: number, rng: Rng) {
  if (ratio <= 0) return
  const n = p.size
  const used = new Set<string>()
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1], path[i]].sort((x, y) => x - y)
    used.add(`${a}-${b}`)
  }
  const candidates: [number, number][] = []
  for (let c = 0; c < n * n; c++) {
    if (p.blocked[c]) continue
    if (c % n < n - 1 && !p.blocked[c + 1] && !used.has(`${c}-${c + 1}`)) candidates.push([c, c + 1])
    if (c + n < n * n && !p.blocked[c + n] && !used.has(`${c}-${c + n}`)) candidates.push([c, c + n])
  }
  shuffle(candidates, rng)
  const count = Math.round(candidates.length * ratio)
  for (let k = 0; k < count; k++) {
    const [a, b] = candidates[k]
    setWall(p, a, b, true)
    // Two walls meeting at a corner shut the diagonal through it.
    if (p.diagonals && path.some((c, i) => i > 0 && !canStep(p, path[i - 1], c))) setWall(p, a, b, false)
  }
}

/** Steps (1-based) where the line changes direction. */
function turnSteps(path: number[]): Set<number> {
  const turns = new Set<number>()
  for (let i = 1; i + 1 < path.length; i++) {
    const [a, b, c] = [path[i - 1], path[i], path[i + 1]]
    if (b - a !== c - b) turns.add(i + 1)
  }
  return turns
}

/**
 * Show every step, then hide numbers one by one, keeping each hide only if
 * the line is still the one answer. 1 and the last step always stay.
 */
function hideNumbers(p: SCPuzzle, path: number[], params: DifficultyParams, rng: Rng) {
  const total = path.length
  path.forEach((c, i) => (p.clues[c] = i + 1))
  const turns = turnSteps(path)
  const firstPass = (s: number) => turns.has(s) === params.hideTurnsFirst
  const order = shuffle(
    Array.from({ length: total - 2 }, (_, i) => i + 2),
    rng,
  ).sort((a, b) => +firstPass(b) - +firstPass(a))

  const shown = new Uint8Array(total + 2).fill(1)
  let shownCount = total
  const minShown = Math.max(2, Math.ceil(total * params.minShown))
  for (const s of order) {
    if (shownCount <= minShown) break
    // The gap this would open between the shown numbers either side.
    let lo = s - 1
    while (!shown[lo]) lo--
    let hi = s + 1
    while (!shown[hi]) hi++
    if (hi - lo > params.maxGap) continue

    const cell = path[s - 1]
    p.clues[cell] = 0
    const { solutions, aborted } = solve(p, 2, SOLVE_BUDGET)
    if (aborted || solutions.length !== 1) {
      p.clues[cell] = s
      continue
    }
    shown[s] = 0
    shownCount--
  }
}

export interface GeneratedPuzzle {
  puzzle: SCPuzzle
  solution: number[]
}

function tryGenerate(size: number, difficulty: Difficulty, moves: MoveRules, rng: Rng): GeneratedPuzzle | null {
  const params = PARAMS[moves.diagonals ? 'diagonal' : 'orthogonal'][difficulty]
  const p = emptyPuzzle(size, moves)
  const blockedCount = Math.round(size * size * params.blockedRatio * (0.6 + rng() * 0.8))
  if (!pickBlocked(p, blockedCount, rng)) return null

  const raw = randomLine(p, rng)
  if (!raw) return null
  const path = backbite(p, raw, raw.length * 25, rng)

  addDecoyWalls(p, path, params.wallRatio, rng)
  hideNumbers(p, path, params, rng)
  return { puzzle: p, solution: path }
}

export function generatePuzzle(size: number, difficulty: Difficulty, moves: MoveRules, rng: Rng = Math.random): GeneratedPuzzle {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = tryGenerate(size, difficulty, moves, rng)
    if (result) return result
  }
  throw new Error(`Could not generate a ${size}x${size} ${difficulty} Step Count puzzle`)
}
