// Simulates sloppy finger drags along each puzzle's solution (corner cutting,
// wobble, uneven speed) through the real drag logic, and reports how often the
// drawn path ends up exactly on the solution.
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { generatePuzzle } = await server.ssrLoadModule('/src/games/numberConnect/generator.ts')
const { cellUnder, moveToward } = await server.ssrLoadModule('/src/games/numberConnect/drag.ts')
const { clueMap } = await server.ssrLoadModule('/src/games/numberConnect/puzzle.ts')

/** A finger trail through the solution's cell centres, cutting each corner. */
function fingerTrail(n, solution, cut, wobble, rng, overshoot = 0) {
  const c = (i) => ({ x: (solution[i] % n) + 0.5, y: Math.floor(solution[i] / n) + 0.5 })
  const pts = []
  for (let i = 0; i < solution.length - 1; i++) {
    const a = c(i)
    const b = c(i + 1)
    const turnNext = i + 2 < solution.length && (() => {
      const d = c(i + 2)
      return (b.x - a.x) !== (d.x - b.x) || (b.y - a.y) !== (d.y - b.y)
    })()
    // Walk a -> b, but if the path turns at b, leave early and head diagonally.
    const steps = 3 + Math.floor(rng() * 5)
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      if (turnNext && t > 1 - cut) break
      pts.push({ x: a.x + (b.x - a.x) * t + (rng() - 0.5) * wobble, y: a.y + (b.y - a.y) * t + (rng() - 0.5) * wobble })
    }
    if (turnNext && overshoot > 0 && rng() < 0.6) {
      // Run past the turn into the next cell straight ahead, then cut back diagonally.
      const d = c(i + 2)
      const over = { x: b.x + (b.x - a.x) * overshoot, y: b.y + (b.y - a.y) * overshoot }
      for (let k = 0; k <= 3; k++) {
        const t = k / 3
        pts.push({ x: b.x + (over.x - b.x) * t, y: b.y + (over.y - b.y) * t })
      }
      for (let k = 1; k <= 3; k++) {
        const t = k / 3
        pts.push({ x: over.x + (d.x - over.x) * t, y: over.y + (d.y - over.y) * t })
      }
      // The finger is now at the cell after the turn; carry on from there.
      i++
      continue
    }
    if (turnNext) {
      const d = c(i + 2)
      // Diagonal shortcut across the corner.
      const start = { x: b.x - (b.x - a.x) * cut, y: b.y - (b.y - a.y) * cut }
      const end = { x: b.x + (d.x - b.x) * cut, y: b.y + (d.y - b.y) * cut }
      for (let k = 0; k < 3; k++) {
        const t = k / 3
        pts.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t })
      }
    }
  }
  pts.push(c(solution.length - 1))
  return pts
}

/** Mirrors Board.handleMove. */
function drag(puzzle, trailPts) {
  const n = puzzle.size
  const clue = clueMap(puzzle)
  let cur = [puzzle.checkpoints[0]]
  let trail = [trailPts[0]]
  for (let i = 1; i < trailPts.length; i++) {
    const p = trailPts[i]
    const last = trail[trail.length - 1]
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / 0.34))
    for (let k = 1; k <= steps; k++) {
      const pt = { x: last.x + ((p.x - last.x) * k) / steps, y: last.y + ((p.y - last.y) * k) / steps }
      trail.push(pt)
      if (trail.length > 16) trail.shift()
      const target = cellUnder(n, pt, cur[cur.length - 1])
      if (target === null) continue
      const moved = moveToward(puzzle, clue, cur, target, trail)
      if (moved !== cur) {
        cur = moved
        trail = [pt]
      }
    }
  }
  return cur
}

let seed = 7
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
for (const [cut, wobble, overshoot] of [[0.3, 0.2, 0], [0.5, 0.4, 0], [0.3, 0.2, 0.75], [0.45, 0.3, 0.85]]) {
  let ok = 0
  let total = 0
  const t0 = performance.now()
  for (const size of [6, 8, 10]) {
    for (const diff of ['easy', 'medium', 'hard']) {
      for (let i = 0; i < 15; i++) {
        const { puzzle, solution } = generatePuzzle(size, diff)
        const got = drag(puzzle, fingerTrail(size, solution, cut, wobble, rng, overshoot))
        total++
        if (got.length === solution.length && got.every((c, j) => c === solution[j])) ok++
      }
    }
  }
  console.log(`corner cut ${cut}, wobble ±${wobble / 2}, overshoot ${overshoot}: ${ok}/${total} traced exactly (${(performance.now() - t0).toFixed(0)}ms)`)
}
await server.close()
