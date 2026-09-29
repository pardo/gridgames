// Heyawake: generates puzzles per size/difficulty, checks uniqueness, grading
// and the URL round trip, and reports timing.
import { createServer } from 'vite'

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { generatePuzzle } = await server.ssrLoadModule('/src/games/heyawake/generator.ts')
const { solveAll, solveLogic } = await server.ssrLoadModule('/src/games/heyawake/solver.ts')
const { isSolution } = await server.ssrLoadModule('/src/games/heyawake/puzzle.ts')
const { encodePuzzle, decodePuzzle } = await server.ssrLoadModule('/src/games/heyawake/encode.ts')

const sizes = (process.argv[2] ?? '6,7,8,9,10').split(',').map(Number)
const count = Number(process.argv[3] ?? 10)
const TIER = { easy: 1, medium: 2, hard: 3 }
for (const size of sizes) {
  for (const diff of ['easy', 'medium', 'hard']) {
    const times = []
    let rooms = 0, clues = 0, offGrade = 0
    for (let i = 0; i < count; i++) {
      const t = performance.now()
      const { puzzle, solution } = generatePuzzle(size, diff)
      times.push(performance.now() - t)
      if (!isSolution(puzzle, (c) => solution[c])) throw new Error('intended solution invalid')
      const r = solveAll(puzzle, 2, 1_000_000)
      if (r.solutions.length !== 1 || r.aborted) throw new Error(`not unique: ${r.solutions.length} aborted=${r.aborted}`)
      const code = encodePuzzle(puzzle)
      if (encodePuzzle(decodePuzzle(code)) !== code) throw new Error('encode round trip failed ' + code)
      if (solveLogic(puzzle, 3).hardest !== TIER[diff]) offGrade++
      rooms += puzzle.rooms.length
      clues += puzzle.rooms.filter((r) => r.clue !== null).length
    }
    times.sort((a, b) => a - b)
    console.log(`${size}x${size} ${diff.padEnd(6)} median ${times[count >> 1].toFixed(0)}ms max ${times[count - 1].toFixed(0)}ms | rooms ${(rooms / count).toFixed(1)} clues ${(clues / count).toFixed(1)} off-grade ${offGrade}`)
  }
}
await server.close()
