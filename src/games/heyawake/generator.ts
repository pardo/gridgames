import type { Difficulty } from '../types'
import { buildPuzzle, components, isSolution, neighbours, type HYPuzzle, type RoomRect } from './puzzle'
import { solveLogic, type Tier } from './solver'

interface Params {
  /** Rooms bigger than this, or longer on a side, always get split. */
  maxArea: number
  maxSide: number
  /** Chance a room that may stay whole is split anyway. */
  splitChance: number
  /** Share of cells shaded in the first draft of the answer. */
  density: number
  /** Deductions the player needs; also the tier numbers are removed against. */
  tier: Tier
  /** Stop removing numbers once only this share of rooms has one. */
  minClues: number
}

const PARAMS: Record<Difficulty, Params> = {
  easy: { maxArea: 6, maxSide: 3, splitChance: 0.5, density: 0.2, tier: 1, minClues: 0.6 },
  medium: { maxArea: 9, maxSide: 4, splitChance: 0.4, density: 0.22, tier: 2, minClues: 0.35 },
  hard: { maxArea: 12, maxSide: 4, splitChance: 0.3, density: 0.24, tier: 3, minClues: 0 },
}

/** Give up looking for an exact grade after this long and use the closest puzzle. */
const TIME_BUDGET_MS = 1200
/** Tweaks to one layout before starting over. */
const MAX_REPAIRS = 80

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))
const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

/** Cut a room in two, across a random side. Null if it's a single cell. */
function splitRoom(rect: RoomRect, horizontal: boolean): [RoomRect, RoomRect] | null {
  const side = horizontal ? rect.h : rect.w
  if (side < 2) return null
  // Keep cuts away from the edge on long sides so 1-wide slivers stay rare.
  const cut = side >= 4 ? randInt(2, side - 2) : randInt(1, side - 1)
  const { r, c, w, h } = rect
  return horizontal
    ? [
        { r, c, w, h: cut, clue: null },
        { r: r + cut, c, w, h: h - cut, clue: null },
      ]
    : [
        { r, c, w: cut, h, clue: null },
        { r, c: c + cut, w: w - cut, h, clue: null },
      ]
}

/** Recursively cut the grid into rectangles. */
function partition(n: number, { maxArea, maxSide, splitChance }: Params): RoomRect[] {
  const rooms: RoomRect[] = []
  const split = (rect: RoomRect) => {
    const { w, h } = rect
    const must = h > maxSide || w > maxSide || h * w > maxArea
    if (!must && (h * w <= 2 || Math.random() >= splitChance)) {
      rooms.push(rect)
      return
    }
    // Cut across the longer side; a coin flip when square.
    const parts = splitRoom(rect, h > w || (h === w && Math.random() < 0.5))!
    parts.forEach(split)
  }
  split({ r: 0, c: 0, w: n, h: n, clue: null })
  return rooms
}

/** Could `c` be shaded without touching another shaded cell or splitting the unshaded area? */
function canShade(n: number, shaded: boolean[], c: number): boolean {
  if (shaded[c] || neighbours(n, c).some((nb) => shaded[nb])) return false
  shaded[c] = true
  const ok = components(n, (i) => !shaded[i]).length === 1
  shaded[c] = false
  return ok
}

/** A random shading that satisfies every rule; numbers come from it. Null if it painted itself into a corner. */
function randomAnswer(p: HYPuzzle, density: number): boolean[] | null {
  const n = p.size
  const shaded = new Array<boolean>(n * n).fill(false)

  // First break every run that would span three rooms, preferring cells that
  // break several at once so fewer shaded cells get in each other's way.
  for (;;) {
    const open = p.segments.filter((seg) => !seg.some((c) => shaded[c]))
    if (!open.length) break
    const hits = new Map<number, number>()
    for (const seg of open) for (const c of seg) hits.set(c, (hits.get(c) ?? 0) + 1)
    // Work on the run with the fewest usable cells first.
    let best: number[] | null = null
    for (const seg of open) {
      const options = seg.filter((c) => canShade(n, shaded, c))
      if (!options.length) return null
      if (!best || options.length < best.length) best = options
    }
    const top = Math.max(...best!.map((c) => hits.get(c)!))
    shaded[pick(best!.filter((c) => hits.get(c) === top))] = true
  }

  // Then top up to the target density.
  let count = shaded.filter(Boolean).length
  const target = Math.round(n * n * density)
  for (const c of shuffle(Array.from({ length: n * n }, (_, i) => i))) {
    if (count >= target) break
    if (canShade(n, shaded, c)) {
      shaded[c] = true
      count++
    }
  }
  return shaded
}

const withClues = (p: HYPuzzle, answer: boolean[]): RoomRect[] =>
  p.rooms.map(({ r, c, w, h, cells }) => ({ r, c, w, h, clue: cells.filter((i) => answer[i]).length }))

/**
 * With every room numbered, tweak the layout where the solver gets stuck
 * (shade one more answer cell, or split a room) until `tier` solves it.
 */
function solvableLayout(size: number, params: Params): { rects: RoomRect[]; answer: boolean[] } | null {
  let rects = partition(size, params)
  let answer: boolean[] | null = null
  for (let tries = 0; tries < 10 && !answer; tries++) answer = randomAnswer(buildPuzzle(size, rects), params.density)
  if (!answer) return null
  const shaded = answer

  for (let k = 0; k < MAX_REPAIRS; k++) {
    const puzzle = buildPuzzle(size, rects)
    const full = withClues(puzzle, shaded)
    const result = solveLogic(buildPuzzle(size, full), params.tier)
    if (result.solved) return { rects: full, answer: shaded }

    const stuck = shuffle(Array.from({ length: size * size }, (_, i) => i).filter((c) => result.known[c] === -1))
    let fixed = false
    for (const c of stuck) {
      if (Math.random() < 0.5 && canShade(size, shaded, c)) {
        shaded[c] = true
        fixed = true
        break
      }
      const room = puzzle.rooms[puzzle.roomOf[c]]
      const parts = splitRoom(room, room.h > room.w || (room.h === room.w && Math.random() < 0.5))
      if (!parts) continue
      const next = rects.filter((r) => r.r !== room.r || r.c !== room.c).concat(parts)
      // New borders can create three-room runs the answer doesn't break.
      if (!isSolution(buildPuzzle(size, next), (i) => shaded[i])) continue
      rects = next
      fixed = true
      break
    }
    if (!fixed) return null
  }
  return null
}

/** Drop numbers one by one while the puzzle stays solvable within `tier`. */
function pruneClues(size: number, rects: RoomRect[], tier: Tier, minClues: number): RoomRect[] {
  const keep = Math.ceil(rects.length * minClues)
  let clued = rects.filter((r) => r.clue !== null).length
  for (const i of shuffle(rects.map((_, k) => k))) {
    if (clued <= keep) break
    if (rects[i].clue === null) continue
    const clue = rects[i].clue
    rects[i].clue = null
    if (!solveLogic(buildPuzzle(size, rects), tier).solved) rects[i].clue = clue
    else clued--
  }
  return rects
}

export function generatePuzzle(size: number, difficulty: Difficulty): { puzzle: HYPuzzle; solution: boolean[] } {
  const params = PARAMS[difficulty]
  const deadline = performance.now() + TIME_BUDGET_MS
  let fallback: { puzzle: HYPuzzle; solution: boolean[]; gap: number } | null = null

  for (;;) {
    const layout = solvableLayout(size, params)
    if (layout) {
      // Cheap tiers first: pruning against tier 3 is slow, so strip what tier 2 allows before it.
      let rects = pruneClues(size, layout.rects, Math.min(params.tier, 2) as Tier, params.minClues)
      if (params.tier === 3) rects = pruneClues(size, rects, 3, params.minClues)
      const puzzle = buildPuzzle(size, rects)
      const graded = solveLogic(puzzle, 3)
      if (graded.solved) {
        const gap = Math.abs(graded.hardest - params.tier)
        if (gap === 0) return { puzzle, solution: layout.answer }
        if (!fallback || gap < fallback.gap) fallback = { puzzle, solution: layout.answer, gap }
      }
    }
    if (fallback && performance.now() > deadline) return fallback
  }
}
