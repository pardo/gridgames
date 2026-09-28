// Generates a batch of puzzles per size/difficulty and reports timing and stats.
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { generatePuzzle } = await server.ssrLoadModule('/src/games/numberConnect/generator.ts')
const { solve } = await server.ssrLoadModule('/src/games/numberConnect/solver.ts')
const { isSolved } = await server.ssrLoadModule('/src/games/numberConnect/puzzle.ts')

const sizes = (process.argv[2] ?? '5,6,7,8').split(',').map(Number)
const count = Number(process.argv[3] ?? 10)
for (const size of sizes) {
  for (const diff of ['easy', 'medium', 'hard']) {
    const times = []
    let nums = 0, walls = 0, blocked = 0
    for (let i = 0; i < count; i++) {
      const t = performance.now()
      const { puzzle, solution } = generatePuzzle(size, diff)
      times.push(performance.now() - t)
      if (!isSolved(puzzle, solution)) throw new Error('intended solution invalid')
      const r = solve(puzzle, 2, 5_000_000)
      if (r.solutions.length !== 1) throw new Error('not unique ' + r.solutions.length + ' aborted=' + r.aborted)
      nums += puzzle.checkpoints.length
      walls += puzzle.wallRight.filter(Boolean).length + puzzle.wallDown.filter(Boolean).length
      blocked += puzzle.blocked.filter(Boolean).length
    }
    times.sort((a, b) => a - b)
    console.log(`${size}x${size} ${diff.padEnd(6)} median ${times[count >> 1].toFixed(0)}ms max ${times[count - 1].toFixed(0)}ms | nums ${(nums / count).toFixed(1)} walls ${(walls / count).toFixed(1)} blocked ${(blocked / count).toFixed(1)}`)
  }
}
await server.close()
