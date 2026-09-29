import { isSolution, neighbours, type HYPuzzle, type Room } from './puzzle'

/*
 * Cell knowledge: -1 unknown, 0 unshaded, 1 shaded.
 *
 * Deductions come in tiers, which is also how puzzles are graded:
 *   1  single-rule steps: neighbours of a shaded cell, full or tight rooms,
 *      the last open cell of a three-room run, cells that would cut the
 *      unshaded area in two
 *   2  room enumeration: every way a numbered room can still be shaded,
 *      keeping what all of them agree on
 *   3  trial: assume a cell, apply tiers 1-2, and keep the opposite if that
 *      breaks
 * Every step is sound, so a puzzle the tiers finish has exactly one answer.
 */
const UNKNOWN = -1
type State = Int8Array

export type Tier = 1 | 2 | 3

interface Ctx {
  nbrs: number[][]
  clued: Room[]
  /** Per clued room: its cells plus the cells bordering it. */
  halo: number[][]
  /** Per clued room: the three-room runs passing through it. */
  roomSegments: number[][][]
  disc: Int32Array
  low: Int32Array
  sub: Int32Array
}

const contexts = new WeakMap<HYPuzzle, Ctx>()

function context(p: HYPuzzle): Ctx {
  let x = contexts.get(p)
  if (x) return x
  const n = p.size
  const nbrs = Array.from({ length: n * n }, (_, c) => neighbours(n, c))
  const clued = p.rooms.filter((r) => r.clue !== null)
  const halo = clued.map((room) => {
    const set = new Set(room.cells)
    for (const c of room.cells) for (const nb of nbrs[c]) set.add(nb)
    return [...set]
  })
  const roomSegments = clued.map((room) => p.segments.filter((seg) => seg.some((c) => room.cells.includes(c))))
  x = {
    nbrs,
    clued,
    halo,
    roomSegments,
    disc: new Int32Array(n * n),
    low: new Int32Array(n * n),
    sub: new Int32Array(n * n),
  }
  contexts.set(p, x)
  return x
}

/**
 * The unshaded area must stay connected. Unknown cells that are the only
 * link between unshaded cells must be unshaded; unknown cells cut off from
 * every unshaded cell must be shaded. Returns -1 on contradiction, 1 if
 * anything changed.
 */
function connectivity(x: Ctx, s: State): number {
  let total = 0
  let start = -1
  for (let c = 0; c < s.length; c++) {
    if (s[c] === 0) {
      total++
      if (start < 0) start = c
    }
  }
  if (start < 0) return 0
  const { disc, low, sub, nbrs } = x
  disc.fill(-1)
  let time = 0
  const mustOpen: number[] = []
  const dfs = (v: number) => {
    disc[v] = low[v] = time++
    sub[v] = s[v] === 0 ? 1 : 0
    let cut = false
    for (const w of nbrs[v]) {
      if (s[w] === 1) continue
      if (disc[w] === -1) {
        dfs(w)
        sub[v] += sub[w]
        if (low[w] < low[v]) low[v] = low[w]
        // Removing v would strand w's subtree; bad if unshaded cells lie on both sides.
        if (low[w] >= disc[v] && sub[w] > 0 && total - sub[w] > 0) cut = true
      } else if (disc[w] < low[v]) {
        low[v] = disc[w]
      }
    }
    if (cut && s[v] === UNKNOWN) mustOpen.push(v)
  }
  dfs(start)
  let changed = 0
  for (let c = 0; c < s.length; c++) {
    if (s[c] === 1 || disc[c] !== -1) continue
    if (s[c] === 0) return -1
    s[c] = 1
    changed = 1
  }
  for (const v of mustOpen) {
    s[v] = 0
    changed = 1
  }
  return changed
}

/** Tier 1 to a fixpoint. False on contradiction. */
function basic(p: HYPuzzle, x: Ctx, s: State): boolean {
  let changed = true
  while (changed) {
    changed = false
    for (let c = 0; c < s.length; c++) {
      if (s[c] !== 1) continue
      for (const nb of x.nbrs[c]) {
        if (s[nb] === 1) return false
        if (s[nb] === UNKNOWN) {
          s[nb] = 0
          changed = true
        }
      }
    }
    for (const room of x.clued) {
      let shaded = 0
      let open = 0
      for (const c of room.cells) {
        if (s[c] === 1) shaded++
        else if (s[c] === UNKNOWN) open++
      }
      const clue = room.clue!
      if (shaded > clue || shaded + open < clue) return false
      if (open === 0 || (shaded !== clue && shaded + open !== clue)) continue
      const fill = shaded === clue ? 0 : 1
      for (const c of room.cells) if (s[c] === UNKNOWN) s[c] = fill
      changed = true
    }
    for (const seg of p.segments) {
      let open = -1
      let count = 0
      let done = false
      for (const c of seg) {
        if (s[c] === 1) {
          done = true
          break
        }
        if (s[c] === UNKNOWN) {
          count++
          open = c
        }
      }
      if (done) continue
      if (count === 0) return false
      if (count === 1) {
        s[open] = 1
        changed = true
      }
    }
    if (changed) continue
    const r = connectivity(x, s)
    if (r < 0) return false
    changed = r > 0
  }
  return true
}

const MAX_ENUM = 16

/** Tier 2, one room at a time. -1 on contradiction, 1 if a room taught us something. */
function roomEnum(x: Ctx, s: State): number {
  for (let i = 0; i < x.clued.length; i++) {
    const room = x.clued[i]
    const open = room.cells.filter((c) => s[c] === UNKNOWN)
    if (!open.length || open.length > MAX_ENUM) continue
    const need = room.clue! - room.cells.filter((c) => s[c] === 1).length
    const on = new Int32Array(open.length)
    let valid = 0

    const localOk = () => {
      for (const c of x.halo[i]) {
        // A known-unshaded cell boxed in by shaded ones can't join the rest.
        if (s[c] !== 0) continue
        if (!x.nbrs[c].some((nb) => s[nb] !== 1)) return false
      }
      for (const seg of x.roomSegments[i]) if (!seg.some((c) => s[c] !== 0)) return false
      return true
    }

    const rec = (k: number, left: number) => {
      if (left > open.length - k) return
      if (k === open.length) {
        if (localOk()) {
          valid++
          for (let j = 0; j < open.length; j++) if (s[open[j]] === 1) on[j]++
        }
        return
      }
      const c = open[k]
      if (left > 0 && !x.nbrs[c].some((nb) => s[nb] === 1)) {
        s[c] = 1
        rec(k + 1, left - 1)
      }
      s[c] = 0
      rec(k + 1, left)
      s[c] = UNKNOWN
    }
    rec(0, need)

    if (valid === 0) return -1
    let changed = false
    for (let j = 0; j < open.length; j++) {
      if (on[j] === valid) s[open[j]] = 1
      else if (on[j] === 0) s[open[j]] = 0
      else continue
      changed = true
    }
    if (changed) return 1
  }
  return 0
}

/** Tiers 1 and 2 to a fixpoint. False on contradiction. */
function propagate(p: HYPuzzle, x: Ctx, s: State): boolean {
  for (;;) {
    if (!basic(p, x, s)) return false
    const r = roomEnum(x, s)
    if (r < 0) return false
    if (r === 0) return true
  }
}

/**
 * Tier 3: one cell whose opposite leads to a contradiction. Scans from
 * `cursor.at`, where the last hit was, so a solve doesn't keep retrying the
 * cells that already failed. Returns false after a full lap without a hit.
 */
function trial(p: HYPuzzle, x: Ctx, s: State, cursor: { at: number }): boolean {
  for (let k = 0; k < s.length; k++) {
    const c = (cursor.at + k) % s.length
    if (s[c] !== UNKNOWN) continue
    for (const v of [1, 0]) {
      const t = s.slice()
      t[c] = v
      if (!propagate(p, x, t)) {
        s[c] = 1 - v
        cursor.at = c
        return true
      }
    }
  }
  return false
}

export interface LogicResult {
  solved: boolean
  /** Shaded cells, when solved. */
  shaded: boolean[]
  /** Where the solve got to: -1 unknown, 0 unshaded, 1 shaded. */
  known: Int8Array
  /** Highest tier the solve needed. */
  hardest: Tier
}

/** Solve with deductions up to `maxTier`, cheapest first. */
export function solveLogic(p: HYPuzzle, maxTier: Tier): LogicResult {
  const x = context(p)
  const s: State = new Int8Array(p.size * p.size).fill(UNKNOWN)
  let hardest: Tier = 1
  const cursor = { at: 0 }
  const fail = () => ({ solved: false, shaded: [], known: s, hardest })
  for (;;) {
    if (!basic(p, x, s)) return fail()
    if (!s.includes(UNKNOWN)) break
    if (maxTier >= 2) {
      const r = roomEnum(x, s)
      if (r < 0) return fail()
      if (r > 0) {
        if (hardest < 2) hardest = 2
        continue
      }
    }
    if (maxTier >= 3 && trial(p, x, s, cursor)) {
      hardest = 3
      continue
    }
    return fail()
  }
  const shaded = Array.from(s, (v) => v === 1)
  return { solved: isSolution(p, (c) => shaded[c]), shaded, known: s, hardest }
}

/** Every answer up to `limit`, by search. For checking uniqueness and as a fallback. */
export function solveAll(p: HYPuzzle, limit = 2, maxNodes = 200_000): { solutions: boolean[][]; aborted: boolean } {
  const x = context(p)
  const solutions: boolean[][] = []
  let nodes = 0
  let aborted = false
  const rec = (s: State) => {
    if (aborted || solutions.length >= limit) return
    if (++nodes > maxNodes) {
      aborted = true
      return
    }
    if (!propagate(p, x, s)) return
    const c = s.indexOf(UNKNOWN)
    if (c < 0) {
      const shaded = Array.from(s, (v) => v === 1)
      if (isSolution(p, (i) => shaded[i])) solutions.push(shaded)
      return
    }
    for (const v of [1, 0]) {
      const t = s.slice()
      t[c] = v
      rec(t)
    }
  }
  rec(new Int8Array(p.size * p.size).fill(UNKNOWN))
  return { solutions, aborted }
}
