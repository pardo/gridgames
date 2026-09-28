import { isDifficulty, type Difficulty } from './games/types'

export type Route =
  | { type: 'home' }
  | { type: 'game'; gameId: string }
  | { type: 'random'; gameId: string; size: number; difficulty: Difficulty }
  | { type: 'play'; gameId: string; difficulty: Difficulty; code: string }

/*
 * #/                                 home: pick a game
 * #/<game>                           that game's menu
 * #/<game>/r/<size>/<difficulty>     generate a fresh puzzle
 * #/<game>/g/<difficulty>/<code>     one specific puzzle (reload-safe)
 */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const [gameId, kind, a, b] = parts
  if (!gameId) return { type: 'home' }
  if (kind === 'r' && a && b && isDifficulty(b)) {
    const size = Number(a)
    if (Number.isInteger(size)) return { type: 'random', gameId, size, difficulty: b }
  }
  if (kind === 'g' && a && b && isDifficulty(a)) {
    return { type: 'play', gameId, difficulty: a, code: b }
  }
  return { type: 'game', gameId }
}

export const homeHash = () => '#/'
export const gameHash = (gameId: string) => `#/${gameId}`
export const randomHash = (gameId: string, size: number, difficulty: Difficulty) =>
  `#/${gameId}/r/${size}/${difficulty}`
export const playHash = (gameId: string, difficulty: Difficulty, code: string) =>
  `#/${gameId}/g/${difficulty}/${encodeURIComponent(code)}`
