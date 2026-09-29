import { heyawake } from './heyawake'
import { numberConnect } from './numberConnect'
import { stepCount } from './stepCount'
import type { GameDefinition } from './types'

/** Every grid game in the app, in menu order. Add new games here. */
export const GAMES: GameDefinition[] = [numberConnect, stepCount, heyawake]

export function findGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}
