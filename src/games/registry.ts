import { numberConnect } from './numberConnect'
import { stepCount } from './stepCount'
import type { GameDefinition } from './types'

/** Every grid game in the app, in menu order. Add new games here. */
export const GAMES: GameDefinition[] = [numberConnect, stepCount]

export function findGame(id: string): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id)
}
