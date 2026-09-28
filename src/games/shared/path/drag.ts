import { gridDistance, gridNeighbours, type PathRules } from './rules'

/** How far back along the path a drag can jump in one go to erase. */
const MAX_BACKTRACK = 3
/** Longest route the path will auto-fill toward a cell the finger skipped to. */
const MAX_BRIDGE = 4
/** How many freshly drawn cells a diagonal correction may take back. */
const MAX_OVERSHOOT_UNDO = 2
/** How far past the head cell's edge the finger must go before it counts as leaving it. */
const HYSTERESIS = 0.18
/** With diagonals: how close to a head corner counts as maybe cutting across it. */
const CORNER = 0.3
/** With diagonals: a head the finger got less than this far into counts as an overshoot. */
const GRAZE = 0.3

type Pt = { x: number; y: number }

/**
 * The cell the finger is over, in board cells. Near the head's own border it
 * sticks to the head, so jitter across a line doesn't flip back and forth.
 *
 * With diagonal moves, a finger passing close to one of the head's corners
 * may be heading for the diagonal cell and just clipping a side neighbour on
 * the way, so near a corner it also sticks to the head until the finger
 * clearly picks a cell.
 */
export function cellUnder(n: number, p: Pt, head: number | undefined, diagonals = false): number | null {
  if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) return null
  const cell = Math.floor(p.y) * n + Math.floor(p.x)
  if (head === undefined) return cell
  const hr = Math.floor(head / n)
  const hc = head % n
  if (p.x >= hc - HYSTERESIS && p.x < hc + 1 + HYSTERESIS && p.y >= hr - HYSTERESIS && p.y < hr + 1 + HYSTERESIS) {
    return head
  }
  if (diagonals) {
    const dr = Math.floor(p.y) - hr
    const dc = Math.floor(p.x) - hc
    // Only a side neighbour can be a clipped corner; the diagonal cell itself is the goal.
    if (Math.abs(dr) + Math.abs(dc) === 1) {
      const kx = p.x < hc + 0.5 ? hc : hc + 1
      const ky = p.y < hr + 0.5 ? hr : hr + 1
      if (Math.hypot(p.x - kx, p.y - ky) < CORNER) return head
    }
  }
  return cell
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
export function moveToward(rules: PathRules, cur: number[], target: number, trail: Pt[]): number[] {
  const head = cur[cur.length - 1]
  if (target === head) return cur

  const dist = gridDistance(rules.size, rules.diagonals, head, target)

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
  //
  // With diagonals an overshot cell usually touches the intended one too, so
  // continuing from it looks just as cheap. A head the finger only grazed
  // (barely past the border it crossed) is erased for free instead.
  const free = rules.diagonals && cur.length >= 2 && grazed(rules.size, cur[cur.length - 2], head, trail) ? 1 : 0
  let best: number[] | null = null
  let bestCost = dist
  for (let back = 0; back <= MAX_OVERSHOOT_UNDO && back < cur.length; back++) {
    const base = back ? cur.slice(0, cur.length - back) : cur
    const route = bridge(rules, base, target, trail, MAX_BRIDGE)
    const cost = back - Math.min(back, free) + (route?.length ?? 0)
    if (route && cost <= bestCost) {
      bestCost = cost
      best = [...base, ...route]
    }
  }
  return best ?? cur
}

/**
 * Did the finger, since `head` joined the line, get less than GRAZE past the
 * border it crossed coming from `prev`? (The side for an orthogonal step,
 * the corner for a diagonal one.)
 */
function grazed(n: number, prev: number, head: number, trail: Pt[]): boolean {
  const px = (prev % n) + 0.5
  const py = Math.floor(prev / n) + 0.5
  const dx = (head % n) + 0.5 - px
  const dy = Math.floor(head / n) + 0.5 - py
  const len = Math.hypot(dx, dy)
  let deepest = -Infinity
  for (const t of trail) deepest = Math.max(deepest, ((t.x - px) * dx + (t.y - py) * dy) / len)
  return deepest - len / 2 < GRAZE
}

/** Shortest legal extension of `cur` ending on `target`, or null. */
function bridge(rules: PathRules, cur: number[], target: number, trail: Pt[], maxLen: number): number[] | null {
  const { size: n, diagonals } = rules
  const minSteps = gridDistance(n, diagonals, cur[cur.length - 1], target)
  if (minSteps > maxLen) return null

  const used = new Set(cur)
  const center = (c: number): Pt => ({ x: (c % n) + 0.5, y: Math.floor(c / n) + 0.5 })
  let best: number[] | null = null
  let bestScore = Infinity

  // Only the shortest routes count; among them, keep the one closest to the
  // finger's trail. `line` is the path plus the route being tried.
  const line = cur.slice()
  const search = (score: number) => {
    const at = line[line.length - 1]
    if (line.length - cur.length === minSteps) {
      if (at === target && score < bestScore) {
        bestScore = score
        best = line.slice(cur.length)
      }
      return
    }
    const left = minSteps - (line.length - cur.length) - 1
    for (const nb of gridNeighbours(n, diagonals, at)) {
      if (used.has(nb)) continue
      if (gridDistance(n, diagonals, nb, target) > left) continue
      if (!rules.canExtend(line, nb)) continue
      line.push(nb)
      used.add(nb)
      search(score + (nb === target ? 0 : distToTrail2(center(nb), trail)))
      used.delete(nb)
      line.pop()
    }
  }
  search(0)
  return best
}
