import { adjacency, clueMap, openCellCount, type NCPuzzle } from './puzzle'

export interface SolveResult {
  solutions: number[][]
  /** True when the node budget ran out before the search finished. */
  aborted: boolean
}

/**
 * Exhaustive search for paths that start on 1, visit every open cell once,
 * hit the numbers in order and end on N. Stops after `maxSolutions`.
 *
 * Pruning at every node:
 *  - every unvisited cell must still be reachable (one connected region
 *    touching the head of the path);
 *  - every unvisited cell except the final number needs two free sides
 *    (a way in and a way out), the final number needs one.
 */
export function solve(p: NCPuzzle, maxSolutions = 2, budget = 400_000): SolveResult {
  const adj = adjacency(p)
  const clue = clueMap(p)
  const total = openCellCount(p)
  const start = p.checkpoints[0]
  const end = p.checkpoints[p.checkpoints.length - 1]
  const cells = p.size * p.size

  const visited = new Uint8Array(cells)
  const path = new Array<number>(total)
  const solutions: number[][] = []
  const stamp = new Uint32Array(cells)
  const queue = new Int32Array(cells)
  let stampId = 0
  let nodes = 0
  let aborted = false

  const feasible = (head: number, remaining: number): boolean => {
    // Degree check.
    for (let u = 0; u < cells; u++) {
      if (visited[u] || p.blocked[u]) continue
      let free = 0
      for (const v of adj[u]) if (!visited[v] || v === head) free++
      if (free < (u === end ? 1 : 2)) return false
    }
    // Connectivity: flood from the end over unvisited cells.
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
        if (visited[v] || stamp[v] === stampId) continue
        stamp[v] = stampId
        queue[qt++] = v
      }
    }
    return touchesHead && reached === remaining
  }

  const dfs = (head: number, depth: number, next: number) => {
    if (++nodes > budget) {
      aborted = true
      return
    }
    if (depth === total) {
      if (head === end) solutions.push(path.slice())
      return
    }
    if (head === end) return
    if (!feasible(head, total - depth)) return
    for (const nb of adj[head]) {
      if (visited[nb]) continue
      const k = clue[nb]
      if (k && k !== next) continue
      visited[nb] = 1
      path[depth] = nb
      dfs(nb, depth + 1, k ? next + 1 : next)
      visited[nb] = 0
      if (aborted || solutions.length >= maxSolutions) return
    }
  }

  visited[start] = 1
  path[0] = start
  if (total === 1) solutions.push([start])
  else dfs(start, 1, 2)
  return { solutions, aborted }
}
