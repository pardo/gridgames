// Simulates sloppy finger drags along each puzzle's solution (corner cutting,
// wobble, uneven speed) through the real drag logic, and reports how often the
// drawn path ends up exactly on the solution.   node scripts/dragsim.mjs [games]
// games: comma-separated from nc, straight, untangled, free (default: all)
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { cellUnder, moveToward } = await server.ssrLoadModule('/src/games/shared/path/drag.ts')
const nc = {
  ...(await server.ssrLoadModule('/src/games/numberConnect/generator.ts')),
  ...(await server.ssrLoadModule('/src/games/numberConnect/puzzle.ts')),
}
const sc = {
  ...(await server.ssrLoadModule('/src/games/stepCount/generator.ts')),
  ...(await server.ssrLoadModule('/src/games/stepCount/puzzle.ts')),
}

/** Each game: a label and how to make a puzzle's drawing rules plus its answer. */
const GAMES = {
  nc: (size, diff) => {
    const { puzzle, solution } = nc.generatePuzzle(size, diff)
    return { rules: nc.pathRules(puzzle), solution }
  },
  ...Object.fromEntries(
    [
      ['straight', { diagonals: false, crossings: false }],
      ['untangled', { diagonals: true, crossings: false }],
      ['free', { diagonals: true, crossings: true }],
    ].map(([name, moves]) => [
      name,
      (size, diff) => {
        const { puzzle, solution } = sc.generatePuzzle(size, diff, moves)
        return { rules: sc.pathRules(puzzle), solution }
      },
    ]),
  ),
}

/**
 * A finger trail through the solution's cell centres, cutting each corner.
 * `cut` and `overshoot` are distances in cells, so a diagonal move (1.41 cells
 * long) is cut by the same amount as an orthogonal one, not the same fraction.
 */
function fingerTrail(n, solution, cut, wobble, rng, overshoot = 0) {
  const c = (i) => ({ x: (solution[i] % n) + 0.5, y: Math.floor(solution[i] / n) + 0.5 })
  const len = (u, v) => Math.hypot(v.x - u.x, v.y - u.y)
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
      if (turnNext && t > 1 - cut / len(a, b)) break
      pts.push({ x: a.x + (b.x - a.x) * t + (rng() - 0.5) * wobble, y: a.y + (b.y - a.y) * t + (rng() - 0.5) * wobble })
    }
    if (turnNext && overshoot > 0 && rng() < 0.6) {
      // Run past the turn into the next cell straight ahead, then cut back diagonally.
      const d = c(i + 2)
      const o = overshoot / len(a, b)
      const over = { x: b.x + (b.x - a.x) * o, y: b.y + (b.y - a.y) * o }
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
      const [ca, cd] = [cut / len(a, b), cut / len(b, d)]
      const start = { x: b.x - (b.x - a.x) * ca, y: b.y - (b.y - a.y) * ca }
      const end = { x: b.x + (d.x - b.x) * cd, y: b.y + (d.y - b.y) * cd }
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
function drag(rules, trailPts) {
  const n = rules.size
  let cur = [rules.start]
  let trail = [trailPts[0]]
  for (let i = 1; i < trailPts.length; i++) {
    const p = trailPts[i]
    const last = trail[trail.length - 1]
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / 0.34))
    for (let k = 1; k <= steps; k++) {
      const pt = { x: last.x + ((p.x - last.x) * k) / steps, y: last.y + ((p.y - last.y) * k) / steps }
      trail.push(pt)
      if (trail.length > 16) trail.shift()
      const target = cellUnder(n, pt, cur[cur.length - 1], rules.diagonals)
      if (target === null) continue
      const moved = moveToward(rules, cur, target, trail)
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
const games = (process.argv[2] ?? Object.keys(GAMES).join(',')).split(',')
for (const game of games) {
  // Same seed per game, so a change to one game's drag doesn't reshuffle the others.
  seed = 7
  for (const [cut, wobble, overshoot] of [[0.3, 0.2, 0], [0.5, 0.4, 0], [0.3, 0.2, 0.75], [0.45, 0.3, 0.85]]) {
    let ok = 0
    let total = 0
    const t0 = performance.now()
    for (const size of [6, 8, 10]) {
      for (const diff of ['easy', 'medium', 'hard']) {
        for (let i = 0; i < 15; i++) {
          const { rules, solution } = GAMES[game](size, diff)
          const got = drag(rules, fingerTrail(size, solution, cut, wobble, rng, overshoot))
          total++
          if (got.length === solution.length && got.every((c, j) => c === solution[j])) ok++
        }
      }
    }
    console.log(
      `${game.padEnd(9)} corner cut ${cut}, wobble ±${wobble / 2}, overshoot ${overshoot}: ${ok}/${total} traced exactly (${(performance.now() - t0).toFixed(0)}ms)`,
    )
  }
}
await server.close()
