import type { GameDefinition } from '../types'
import { decodePuzzle, encodePuzzle } from './encode'
import { generatePuzzle } from './generator'
import { GAME_ID, StepCountPlay } from './StepCountPlay'
import { findVariant, VARIANTS } from './variants'

export const stepCount: GameDefinition = {
  id: GAME_ID,
  title: 'Step Count',
  tagline: 'One line, every cell, every number on its exact step.',
  rules: [
    'Touch 1 and drag to draw a single line through every open cell.',
    'Numbers count steps: the cell showing 12 must be the 12th cell of your line.',
    'Some variants let the line move diagonally, and some even let diagonal moves cross in an X.',
    'Dark cells are blocked and thick lines are walls. Two walls meeting at a corner shut the diagonal through it.',
    'A number reached on the wrong step turns red. Drag back to erase, or tap the line to cut it.',
  ],
  sizes: [5, 6, 7, 8, 9, 10],
  variants: VARIANTS.map(({ id, label, blurb }) => ({ id, label, blurb })),
  difficultyBlurbs: {
    easy: 'Plenty of numbers, never far apart.',
    medium: 'Fewer numbers and longer stretches to work out.',
    hard: 'Sparse numbers with the turns hidden, plus blocked cells and walls.',
  },
  generate: (size, difficulty, variant) =>
    encodePuzzle(generatePuzzle(size, difficulty, findVariant(variant).moves[difficulty]).puzzle),
  sizeOf: (code) => decodePuzzle(code)?.size ?? null,
  Play: StepCountPlay,
}
