import type { GamePlayProps } from '../types'
import { PathGamePlay, type PathGame } from '../shared/path/PathGamePlay'
import { decodePuzzle } from './encode'
import { isSolved, pathRules, type NCPuzzle } from './puzzle'
import { solve } from './solver'

export const GAME_ID = 'simple-number-connect'

/** The number the line must reach next (1-based), given the path so far. */
const nextNumber = (p: NCPuzzle, path: number[]) => {
  const on = new Set(path)
  return p.checkpoints.reduce((k, c) => (on.has(c) ? k + 1 : k), 1)
}

const game: PathGame<NCPuzzle> = {
  id: GAME_ID,
  decode: decodePuzzle,
  rules: pathRules,
  marks: (p, path, solved) => {
    const on = new Set(path)
    const next = nextNumber(p, path)
    return p.checkpoints.map((cell, i) => ({
      cell,
      label: i + 1,
      state: on.has(cell) ? 'reached' : !solved && path.length > 0 && i + 1 === next ? 'next' : undefined,
    }))
  },
  ringCell: (p, path) => (path.length > 0 ? p.checkpoints[nextNumber(p, path) - 1] : undefined),
  isMilestone: (p, cell) => p.checkpoints.includes(cell),
  isSolved,
  solution: (p) => solve(p, 1, 20_000_000).solutions[0],
  startHint: 'Touch 1 and drag through every cell, in number order.',
}

export function NumberConnectPlay(props: GamePlayProps) {
  return <PathGamePlay game={game} {...props} />
}
