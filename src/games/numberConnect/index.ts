import type { GameDefinition } from '../types'
import { decodePuzzle, encodePuzzle } from './encode'
import { generatePuzzle } from './generator'
import { GAME_ID, NumberConnectPlay } from './NumberConnectPlay'

export const numberConnect: GameDefinition = {
  id: GAME_ID,
  title: 'Simple Number Connect',
  tagline: 'One line, every cell, numbers in order.',
  rules: [
    'Touch 1 and drag to draw a single path.',
    'Pass through the numbers in order: 1, 2, 3 … up to the last one.',
    'Fill every open cell. Dark cells are blocked and thick lines are walls.',
    'Drag back over your line to erase it, or tap any part of it to cut it there.',
  ],
  sizes: [5, 6, 7, 8, 9, 10],
  generate: (size, difficulty) => encodePuzzle(generatePuzzle(size, difficulty).puzzle),
  sizeOf: (code) => decodePuzzle(code)?.size ?? null,
  Play: NumberConnectPlay,
}
