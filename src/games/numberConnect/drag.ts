import { canStep, type NCPuzzle } from './puzzle'

/** How far back along the path a drag can jump in one go to erase. */
const MAX_BACKTRACK = 3
/** Longest route the path will auto-fill toward a cell the finger skipped to. */
const MAX_BRIDGE = 4
/** How many freshly drawn cells a diagonal correction may take back. */
const MAX_OVERSHOOT_UNDO = 2
/** How far past the head cell's edge the finger must go before it counts as leaving it. */
const HYSTERESIS = 0.18

type Pt = { x: number; y: number }

/**
 * The cell the finger is over, in board cells. Near the head's own border it
 * sticks to the head, so jitter across a line doesn't flip back and forth.
 */
export function cellUnder(n: number, p: Pt, head: number | undefined): number | null {
  if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) return null
  if (head !== undefined) {
    const hr = Math.floor(head / n)
    const hc = head % n
    if (p.x >= hc - HYSTERESIS && p.x < hc + 1 + HYSTERESIS && p.y >= hr - HYSTERESIS && p.y < hr + 1 + HYSTERESIS) {
      return head
    }
  }
  return Math.floor(p.y) * n + Math.floor(p.x)
}

/** Squared distance from a point to the finger's trail (a polyline). */
function distToTrail2(p: Pt, trail: Pt[]): number {
  if (trail.length === 1) return (p.x - trail[0].x) ** 2 + (p.y - trail[0].y) ** 2
  let best = Infinity
  for (let i = 1; i < trail.length; i++) best = Math.min(best, distToSegment2(p, trail[i - 1], trail[i]))
  return best
}

/** Squared distance from a point to the segment a-b. */
function distToSegment2(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len2 = vx * vx + vy * vy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2))
  const dx = a.x + vx * t - p.x
  const dy = a.y + vy * t - p.y
  return dx * dx + dy * dy
}

/**
 * Move the path's head toward `target` (the cell under the finger).
 *
 * - On the path, a few cells back: erase back to it (dragging in reverse).
 * - Next to the head: step onto it if the rules allow.
 * - Further away (a fast swipe, or a corner cut diagonally that skipped a
 *   cell): fill in the shortest legal route, preferring the one that hugs the
 *   finger's recent trail (board-cell coordinates, oldest first).
 */
export function moveToward(
  puzzle: NCPuzzle,
  clue: number[],
  cur: number[],
  target: number,
  trail: Pt[],
): number[] {
  const n = puzzle.size
  const head = cur[cur.length - 1]
  if (target === head) return cur

  const hr = Math.floor(head / n)
  const hc = head % n
  const dist = Math.abs(Math.floor(target / n) - hr) + Math.abs((target % n) - hc)

  const idx = cur.lastIndexOf(target)
  if (idx >= 0) {
    // Erase only when the finger is retracing: back onto the previous cell, or
    // a few cells back when it skipped straight over the ones in between.
    // Touching older parts of the line (e.g. overshooting a U-turn into the
    // row just drawn) must not chop it.
    const back = cur.length - 1 - idx
    return back === 1 || (back <= MAX_BACKTRACK && back === dist) ? cur.slice(0, idx + 1) : cur
  }

  // Try reaching the target from the head, or from one or two cells back.
  // Backing up covers an overshoot: the finger ran one cell past a turn (the
  // path followed it) and then cut diagonally to where it meant to go.
  // Cheapest total (cells erased + cells added) wins; on a tie, erasing wins,
  // since the finger skipped past the extra cell rather than dwelling on it.
  // Nothing may cost more than the distance to the target: pushing against a
  // wall must not trigger a detour or rewrite the line.
  let best: number[] | null = null
  let bestCost = dist
  for (let back = 0; back <= MAX_OVERSHOOT_UNDO && back < cur.length; back++) {
    const base = back ? cur.slice(0, cur.length - back) : cur
    const route = bridge(puzzle, clue, base, target, trail, MAX_BRIDGE)
    if (route && back + route.length <= bestCost) {
      bestCost = back + route.length
      best = [...base, ...route]
    }
  }
  return best ?? cur
}

/** Shortest legal extension of `cur` ending on `target`, or null. */
function bridge(puzzle: NCPuzzle, clue: number[], cur: number[], target: number, trail: Pt[], maxLen: number): number[] | null {
  const n = puzzle.size
  const head = cur[cur.length - 1]
  const lastNumber = puzzle.checkpoints.length
  if (clue[head] === lastNumber) return null

  const used = new Set(cur)
  const nextNumber = cur.reduce((k, c) => (clue[c] ? k + 1 : k), 1)
  const tr = Math.floor(target / n)
  const tc = target % n
  const manhattan = (c: number) => Math.abs(Math.floor(c / n) - tr) + Math.abs((c % n) - tc)
  const minSteps = manhattan(head)
  if (minSteps > maxLen) return null

  const center = (c: number): Pt => ({ x: (c % n) + 0.5, y: Math.floor(c / n) + 0.5 })
  let best: number[] | null = null
  let bestScore = Infinity

  // Iterative deepening: the first depth with any route wins; among routes of
  // that length, keep the one closest to the finger's trail.
  for (let depth = minSteps; depth <= minSteps && !best; depth++) {
    const route: number[] = []
    const search = (at: number, next: number, score: number) => {
      if (route.length === depth) {
        if (at === target && score < bestScore) {
          bestScore = score
          best = route.slice()
        }
        return
      }
      if (clue[at] === lastNumber) return
      const c = at % n
      for (const nb of [at - n, at + n, c > 0 ? at - 1 : -1, c < n - 1 ? at + 1 : -1]) {
        if (nb < 0 || nb >= n * n) continue
        if (used.has(nb) || route.includes(nb)) continue
        if (manhattan(nb) > depth - route.length - 1) continue
        if (!canStep(puzzle, at, nb)) continue
        const k = clue[nb]
        if (k && k !== next) continue
        route.push(nb)
        search(nb, k ? next + 1 : next, score + (nb === target ? 0 : distToTrail2(center(nb), trail)))
        route.pop()
      }
    }
    search(head, nextNumber, 0)
  }
  return best
}
