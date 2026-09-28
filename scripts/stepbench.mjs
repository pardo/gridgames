// Step Count: generates a batch of puzzles per size/move rules/difficulty and
// reports timing, how many numbers stay shown, and checks every puzzle is
// valid and unique.   node scripts/stepbench.mjs [sizes] [count] [variants]
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { generatePuzzle } = await server.ssrLoadModule('/src/games/stepCount/generator.ts')
const { solve } = await server.ssrLoadModule('/src/games/stepCount/solver.ts')
const { isSolved, openCellCount } = await server.ssrLoadModule('/src/games/stepCount/puzzle.ts')

const MOVES = {
  straight: { diagonals: false, crossings: false },
  untangled: { diagonals: true, crossings: false },
  free: { diagonals: true, crossings: true },
}

const sizes = (process.argv[2] ?? '5,7,9').split(',').map(Number)
const count = Number(process.argv[3] ?? 8)
const kinds = (process.argv[4] ?? 'straight,untangled,free').split(',')
for (const kind of kinds) {
  for (const size of sizes) {
    for (const diff of ['easy', 'medium', 'hard']) {
      const times = []
      let shown = 0
      let open = 0
      let walls = 0
      let crossings = 0
      for (let i = 0; i < count; i++) {
        const t = performance.now()
        const { puzzle, solution } = generatePuzzle(size, diff, MOVES[kind])
        times.push(performance.now() - t)
        if (!isSolved(puzzle, solution)) throw new Error('intended solution invalid')
        const r = solve(puzzle, 2, 20_000_000)
        if (r.solutions.length !== 1) throw new Error(`not unique: ${r.solutions.length} aborted=${r.aborted}`)
        shown += puzzle.clues.filter(Boolean).length
        open += openCellCount(puzzle)
        walls += puzzle.wallRight.filter(Boolean).length + puzzle.wallDown.filter(Boolean).length
        // Count X crossings in the answer: both diagonals of a 2x2 square used.
        const diag = new Set()
        for (let k = 1; k < solution.length; k++) {
          const [a, b] = [solution[k - 1], solution[k]].sort((x, y) => x - y)
          if (b - a === size + 1 || b - a === size - 1) diag.add(`${a}-${b}`)
        }
        for (const key of diag) {
          const [a, b] = key.split('-').map(Number)
          if (b - a === size + 1 && diag.has(`${a + 1}-${a + size}`)) crossings++
        }
      }
      times.sort((a, b) => a - b)
      console.log(
        `${kind.padEnd(9)} ${size}x${size} ${diff.padEnd(6)} median ${times[count >> 1].toFixed(0).padStart(5)}ms max ${times[count - 1].toFixed(0).padStart(5)}ms | shown ${((shown / open) * 100).toFixed(0)}% walls ${(walls / count).toFixed(1)} crossings ${(crossings / count).toFixed(1)}`,
      )
    }
  }
}
await server.close()
