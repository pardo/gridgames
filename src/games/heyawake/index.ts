import type { GameDefinition } from '../types'
import { decodePuzzle, encodePuzzle } from './encode'
import { generatePuzzle } from './generator'
import { GAME_ID, HeyawakePlay } from './HeyawakePlay'

export const heyawake: GameDefinition = {
  id: GAME_ID,
  title: 'Heyawake',
  tagline: 'Shade cells room by room, keep the rest connected.',
  rules: [
    'Shade some cells. Shaded cells may not touch side by side.',
    'All unshaded cells must form one connected area.',
    'A room with a number has exactly that many shaded cells.',
    'A straight line of unshaded cells may not cross more than one bold border.',
    'Tap to shade, tap again to mark a cell you know is unshaded (it turns light), again to clear. Drag to paint several.',
  ],
  sizes: [6, 7, 8, 9, 10],
  difficultyBlurbs: {
    easy: 'Small rooms, lots of numbers; every step follows from a simple rule.',
    medium: 'Fewer numbers; you’ll need to reason about how a whole room can be shaded.',
    hard: 'Sparse numbers and big rooms; some cells only fall out by trying and seeing what breaks.',
  },
  generate: (size, difficulty) => encodePuzzle(generatePuzzle(size, difficulty).puzzle),
  sizeOf: (code) => decodePuzzle(code)?.size ?? null,
  Play: HeyawakePlay,
}
