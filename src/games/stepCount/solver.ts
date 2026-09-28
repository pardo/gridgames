import { adjacency, cellOfStep, crossesLine, openCellCount, type SCPuzzle } from './puzzle'

export interface SolveResult {
  solutions: number[][]
  /** True when the node budget ran out before the search finished. */
  aborted: boolean
}

const FAR = 0x7fff

/**
 * Exhaustive search for lines that start on 1, visit every open cell once and
 * land on every shown number at exactly its step. Stops after `maxSolutions`.
 * Expects both 1 and the last step to be shown.
 *
 * The shown numbers split the line into gaps: from cell a (step i) to cell b
 * (step j) the line fills j - i - 1 blank steps, and a blank cell u can only
 * be one of them if dist(a, u) + dist(u, b) <= j - i. Distances are shortest
 * routes around blocked cells and walls. Pruning at every node:
 *  - the next shown number must be reachable in exactly the steps left
 *    (orthogonal moves also keep checkerboard parity);
 *  - every blank unvisited cell must fit the current gap (from the head) or a
 *    later one;
 *  - cells that must be placed by the end of a gap can't outnumber the blank
 *    steps left up to there, and the current gap needs enough candidates;
 *  - every unvisited cell needs two free sides (the last cell one);
 *  - the unvisited cells must form one region touching the head.
 */
export function solve(p: SCPuzzle, maxSolutions = 2, budget = 400_000): SolveResult {
  const n = p.size
  const cells = n * n
  const adj = adjacency(p)
  const total = openCellCount(p)
  const at = cellOfStep(p)
  const start = at[1]
  const end = at[total]
  if (start < 0 || end < 0) return { solutions: [], aborted: false }

  // All-pairs shortest routes over the open cells.
  const dist = new Int16Array(cells * cells).fill(FAR)
  {
    const q = new Int32Array(cells)
    for (let src = 0; src < cells; src++) {
      if (p.blocked[src]) continue
      const row = src * cells
      dist[row + src] = 0
      let qh = 0
      let qt = 0
      q[qt++] = src
      while (qh < qt) {
        const u = q[qh++]
        for (const v of adj[u]) {
          if (dist[row + v] !== FAR) continue
          dist[row + v] = dist[row + u] + 1
          q[qt++] = v
        }
      }
    }
  }

  // nextShown[s]: the first shown step after s.
  const nextShown = new Int32Array(total + 1)
  for (let s = total, k = total; s >= 0; s--) {
    nextShown[s] = k
    if (s > 0 && at[s] >= 0) k = s
  }
  // Gaps between consecutive shown steps: gap g runs from shown[g] to shown[g + 1].
  const shown: number[] = []
  for (let k = 1; k <= total; k++) if (at[k] >= 0) shown.push(k)
  const gapOf = new Int32Array(total + 1).fill(-1)
  shown.forEach((k, g) => (gapOf[k] = g))
  const gaps = shown.length - 1
  // lastFit[u]: the last gap blank cell u could lie in (-1 if none).
  const lastFit = new Int32Array(cells).fill(-1)
  for (let u = 0; u < cells; u++) {
    if (p.blocked[u] || p.clues[u]) continue
    for (let g = gaps - 1; g >= 0; g--) {
      const [i, j] = [shown[g], shown[g + 1]]
      if (dist[at[i] * cells + u] + dist[u * cells + at[j]] <= j - i) {
        lastFit[u] = g
        break
      }
    }
  }

  const pos = new Int32Array(cells).fill(-1)
  const path = new Array<number>(total)
  const solutions: number[][] = []
  const stamp = new Uint32Array(cells)
  const queue = new Int32Array(cells)
  const due = new Int32Array(Math.max(1, gaps))
  let stampId = 0
  let nodes = 0
  let aborted = false
  const posOf = (c: number) => pos[c]

  /** Can the line, with `head` as step `s`, still be completed? */
  const feasible = (head: number, s: number): boolean => {
    const k = nextShown[s]
    const target = at[k]
    const room = k - s
    const d = dist[head * cells + target]
    if (d > room) return false
    if (!p.diagonals && (room - d) % 2) return false

    // Gap of the shown number the head is heading for (the gap ending at k).
    const gap = gapOf[k] - 1
    due.fill(0, gap)
    let dueNow = 0
    let candidates = 0
    for (let u = 0; u < cells; u++) {
      if (pos[u] >= 0 || p.blocked[u]) continue
      let free = 0
      for (const v of adj[u]) if (pos[v] < 0 || v === head) free++
      if (free < (u === end ? 1 : 2)) return false
      if (p.clues[u]) continue
      const fitsNow = dist[head * cells + u] + dist[u * cells + target] <= room
      if (fitsNow) candidates++
      if (lastFit[u] <= gap) {
        // Can't wait for a later gap: must be placed before reaching k.
        if (!fitsNow) return false
        dueNow++
      } else {
        due[lastFit[u]]++
      }
    }
    // The current gap has room - 1 blank steps to fill, then each later gap adds its own.
    let blanks = room - 1
    if (candidates < blanks) return false
    let placed = dueNow
    if (placed > blanks) return false
    for (let g = gap + 1; g < gaps; g++) {
      blanks += shown[g + 1] - shown[g] - 1
      placed += due[g]
      if (placed > blanks) return false
    }

    stampId++
    let qh = 0
    let qt = 0
    queue[qt++] = end
    stamp[end] = stampId
    let reached = 0
    let touchesHead = false
    while (qh < qt) {
      const u = queue[qh++]
      reached++
      for (const v of adj[u]) {
        if (v === head) touchesHead = true
        if (pos[v] >= 0 || stamp[v] === stampId) continue
        stamp[v] = stampId
        queue[qt++] = v
      }
    }
    return touchesHead && reached === total - s
  }

  const tryStep = (head: number, nb: number, s: number) => {
    if (!p.crossings && crossesLine(n, head, nb, posOf)) return
    pos[nb] = s
    path[s] = nb
    dfs(nb, s + 1)
    pos[nb] = -1
  }

  /** `head` is step `s` (1-based) of the line. */
  const dfs = (head: number, s: number) => {
    if (++nodes > budget) {
      aborted = true
      return
    }
    if (s === total) {
      solutions.push(path.slice())
      return
    }
    if (!feasible(head, s)) return
    const pinned = at[s + 1]
    if (pinned >= 0) {
      if (pos[pinned] < 0 && adj[head].includes(pinned)) tryStep(head, pinned, s)
      return
    }
    for (const nb of adj[head]) {
      // A shown number is only ever entered on its own step.
      if (pos[nb] >= 0 || p.clues[nb]) continue
      tryStep(head, nb, s)
      if (aborted || solutions.length >= maxSolutions) return
    }
  }

  pos[start] = 0
  path[0] = start
  if (total === 1) solutions.push([start])
  else dfs(start, 1)
  return { solutions, aborted }
}
