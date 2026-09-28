import type { GamePlayProps } from '../types'
import type { BoardMark } from '../shared/path/Board'
import { PathGamePlay, type PathGame } from '../shared/path/PathGamePlay'
import { decodePuzzle } from './encode'
import { cellOfStep, isSolved, pathRules, type SCPuzzle } from './puzzle'
import { solve } from './solver'
import { VARIANTS } from './variants'

export const GAME_ID = 'step-count'

/** The first shown number still ahead of the line: its step, or undefined when none is left. */
function nextShownStep(p: SCPuzzle, path: number[]): number | undefined {
  const at = cellOfStep(p)
  for (let k = path.length + 1; k < at.length; k++) if (at[k] >= 0) return k
  return undefined
}

const game: PathGame<SCPuzzle> = {
  id: GAME_ID,
  decode: decodePuzzle,
  rules: pathRules,
  marks: (p, path, solved) => {
    const index = new Map(path.map((c, i) => [c, i]))
    const next = path.length > 0 && !solved ? nextShownStep(p, path) : undefined
    const marks: BoardMark[] = []
    p.clues.forEach((k, cell) => {
      if (!k) return
      const i = index.get(cell)
      let state: BoardMark['state']
      if (i !== undefined) state = i + 1 === k ? 'reached' : 'wrong'
      // The line already passed step k somewhere else.
      else if (path.length >= k) state = 'wrong'
      else if (k === next) state = 'next'
      marks.push({ cell, label: k, state })
    })
    return marks
  },
  ringCell: (p, path) => {
    if (!path.length) return undefined
    const k = nextShownStep(p, path)
    return k === undefined ? undefined : p.clues.indexOf(k)
  },
  isMilestone: (p, cell, index) => p.clues[cell] === index + 1,
  isSolved,
  solution: (p) => solve(p, 1, 20_000_000).solutions[0],
  startHint: 'Touch 1 and drag through every cell. The cell showing k must be your k-th step.',
  stepOnHead: true,
  variants: VARIANTS,
}

export function StepCountPlay(props: GamePlayProps) {
  return <PathGamePlay game={game} {...props} />
}
