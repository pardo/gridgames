import type { Difficulty } from '../types'
import { adjacency, type NCPuzzle } from './puzzle'
import { solve } from './solver'

interface DifficultyParams {
  /** Share of cells that get blocked. */
  blockedRatio: number
  /** Share of unused inner edges that get a wall up front ("tight spaces"). */
  wallRatio: number
  /** Path steps between consecutive numbers. */
  minGap: number
  maxGap: number
  /**
   * How much to favour misleading number pairs: numbers that sit close
   * together on the board but are far apart along the real path, so the
   * direct connection looks right but isn't. Negative favours honest,
   * straight-ish connections.
   */
  deception: number
  /** When a puzzle is ambiguous, chance to fix it with a wall rather than a number. */
  wallFixChance: number
}

const PARAMS: Record<Difficulty, DifficultyParams> = {
  easy: { blockedRatio: 0.03, wallRatio: 0, minGap: 2, maxGap: 5, deception: -1, wallFixChance: 0.15 },
  medium: { blockedRatio: 0.07, wallRatio: 0.06, minGap: 3, maxGap: 9, deception: 1, wallFixChance: 0.45 },
  hard: { blockedRatio: 0.1, wallRatio: 0.12, minGap: 5, maxGap: 16, deception: 2.5, wallFixChance: 0.55 },
}

type Rng = () => number

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function emptyPuzzle(size: number): NCPuzzle {
  const cells = size * size
  return {
    size,
    blocked: new Array<boolean>(cells).fill(false),
    wallRight: new Array<boolean>(cells).fill(false),
    wallDown: new Array<boolean>(cells).fill(false),
    checkpoints: [],
  }
}

function pickBlocked(p: NCPuzzle, count: number, rng: Rng): boolean {
  const n = p.size
  const cells = shuffle([...Array(n * n).keys()], rng)
  let placed = 0
  for (const c of cells) {
    if (placed >= count) break
    p.blocked[c] = true
    placed++
  }
  // A path alternates colours on the checkerboard, so the open cells must
  // be balanced to within one.
  let black = 0
  let white = 0
  for (let c = 0; c < n * n; c++) {
    if (p.blocked[c]) continue
    if ((Math.floor(c / n) + (c % n)) % 2 === 0) black++
    else white++
  }
  return Math.abs(black - white) <= 1
}

/** Randomised DFS for any Hamiltonian path over the open cells. */
function findHamiltonianPath(p: NCPuzzle, rng: Rng, budget = 30_000): number[] | null {
  const n = p.size
  const cells = n * n
  const adj = adjacency(p)
  const open = [...Array(cells).keys()].filter((c) => !p.blocked[c])
  const total = open.length

  let black = 0
  for (const c of open) if ((Math.floor(c / n) + (c % n)) % 2 === 0) black++
  const white = total - black
  const startColour = black > white ? 0 : white > black ? 1 : -1
  const starts = open.filter((c) => startColour < 0 || (Math.floor(c / n) + (c % n)) % 2 === startColour)
  const start = starts[Math.floor(rng() * starts.length)]

  const visited = new Uint8Array(cells)
  const path: number[] = [start]
  visited[start] = 1
  let nodes = 0

  const feasible = (head: number): boolean => {
    let deadEnds = 0
    let first = -1
    let remaining = 0
    for (const u of open) {
      if (visited[u]) continue
      remaining++
      if (first < 0) first = u
      let free = 0
      for (const v of adj[u]) if (!visited[v] || v === head) free++
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
        if (visited[v] || seen[v]) continue
        seen[v] = 1
        stack.push(v)
      }
    }
    return touchesHead && reached === remaining
  }

  const onward = (c: number) => adj[c].reduce((s, v) => s + (visited[v] ? 0 : 1), 0)

  const dfs = (head: number): boolean => {
    if (path.length === total) return true
    if (++nodes > budget) return false
    if (!feasible(head)) return false
    const options = shuffle(
      adj[head].filter((v) => !visited[v]),
      rng,
    ).sort((a, b) => onward(a) - onward(b))
    for (const nb of options) {
      visited[nb] = 1
      path.push(nb)
      if (dfs(nb)) return true
      path.pop()
      visited[nb] = 0
      if (nodes > budget) return false
    }
    return false
  }

  return dfs(start) ? path : null
}

/**
 * Backbite moves: join one end of the path to one of its neighbours further
 * along and cut the edge just before it. Always yields another Hamiltonian
 * path, and repeating it scrambles the tidy spirals a DFS tends to produce.
 */
function backbite(p: NCPuzzle, path: number[], steps: number, rng: Rng): number[] {
  const adj = adjacency(p)
  let cur = path.slice()
  const pos = new Int32Array(p.size * p.size)
  for (let s = 0; s < steps; s++) {
    if (rng() < 0.5) cur.reverse()
    cur.forEach((c, i) => (pos[c] = i))
    const head = cur[0]
    const options = adj[head].filter((v) => v !== cur[1])
    if (!options.length) continue
    const j = pos[options[Math.floor(rng() * options.length)]]
    cur = [...cur.slice(0, j).reverse(), ...cur.slice(j)]
  }
  return cur
}

function manhattan(n: number, a: number, b: number): number {
  return Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n))
}

function weightedPick(weights: number[], rng: Rng): number {
  const total = weights.reduce((s, w) => s + w, 0)
  let r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

/** Choose which path positions get numbers. Always includes both ends. */
function pickCheckpoints(n: number, path: number[], params: DifficultyParams, rng: Rng): number[] {
  const last = path.length - 1
  const idx = [0]
  let i = 0
  while (last - i > params.maxGap) {
    const gaps: number[] = []
    const weights: number[] = []
    for (let g = params.minGap; g <= params.maxGap && i + g < last; g++) {
      const d = manhattan(n, path[i], path[i + g])
      // g / d is how much longer the true route is than it looks.
      const detour = g / Math.max(1, d)
      gaps.push(g)
      weights.push(Math.pow(detour, params.deception) + 0.02)
    }
    i += gaps[weightedPick(weights, rng)]
    idx.push(i)
  }
  if (last > 0) idx.push(last)
  return idx
}

function setWall(p: NCPuzzle, a: number, b: number) {
  const n = p.size
  if (b === a + 1) p.wallRight[a] = true
  else if (b === a - 1) p.wallRight[b] = true
  else if (b === a + n) p.wallDown[a] = true
  else if (b === a - n) p.wallDown[b] = true
}

/** Sprinkle walls on edges the real path never uses. */
function addDecoyWalls(p: NCPuzzle, path: number[], ratio: number, rng: Rng) {
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
  for (let k = 0; k < count; k++) setWall(p, candidates[k][0], candidates[k][1])
}

export interface GeneratedPuzzle {
  puzzle: NCPuzzle
  solution: number[]
}

function tryGenerate(size: number, difficulty: Difficulty, rng: Rng): GeneratedPuzzle | null {
  const params = PARAMS[difficulty]
  const p = emptyPuzzle(size)
  const blockedCount = Math.round(size * size * params.blockedRatio * (0.6 + rng() * 0.8))
  if (!pickBlocked(p, blockedCount, rng)) return null

  const raw = findHamiltonianPath(p, rng)
  if (!raw) return null
  const path = backbite(p, raw, raw.length * 25, rng)

  addDecoyWalls(p, path, params.wallRatio, rng)
  const idx = pickCheckpoints(size, path, params, rng)

  // Tighten until the intended path is the only one: find a competing
  // solution, locate where it first leaves the intended path, and block
  // that move with either a wall or a new number.
  for (let round = 0; round < 80; round++) {
    p.checkpoints = idx.map((i) => path[i])
    const { solutions, aborted } = solve(p, 2)
    if (aborted) {
      // Too open to reason about quickly: split the longest stretch.
      let best = 0
      for (let k = 1; k < idx.length; k++) if (idx[k] - idx[k - 1] > idx[best + 1] - idx[best]) best = k - 1
      const mid = Math.floor((idx[best] + idx[best + 1]) / 2)
      if (mid === idx[best]) return null
      idx.splice(best + 1, 0, mid)
      continue
    }
    if (solutions.length === 0) return null
    const alt = solutions.find((s) => s.some((c, i) => c !== path[i]))
    if (!alt) return { puzzle: p, solution: path }

    const k = alt.findIndex((c, i) => c !== path[i])
    if (rng() < params.wallFixChance) {
      setWall(p, alt[k - 1], alt[k])
    } else {
      // Number the cell the intended path goes to instead.
      const at = idx.findIndex((i) => i > k)
      if (idx.includes(k)) setWall(p, alt[k - 1], alt[k])
      else idx.splice(at, 0, k)
    }
  }
  return null
}

export function generatePuzzle(size: number, difficulty: Difficulty, rng: Rng = Math.random): GeneratedPuzzle {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = tryGenerate(size, difficulty, rng)
    if (result) return result
  }
  throw new Error(`Could not generate a ${size}x${size} ${difficulty} puzzle`)
}
