import { isDifficulty, type Difficulty } from './games/types'

export type Route =
  | { type: 'home' }
  | { type: 'game'; gameId: string }
  | { type: 'random'; gameId: string; size: number; difficulty: Difficulty; variant?: string }
  | { type: 'play'; gameId: string; difficulty: Difficulty; code: string; variant?: string }

/*
 * #/                                           home: pick a game
 * #/<game>                                     that game's menu
 * #/<game>/r/<size>/<difficulty>[/<variant>]   generate a fresh puzzle
 * #/<game>/g/<difficulty>/<code>[/<variant>]   one specific puzzle (reload-safe)
 *
 * The variant is only for games that have them. It picks the rules for new
 * puzzles and which stats a solve counts toward; a puzzle code is complete
 * on its own.
 */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const [gameId, kind, a, b, variant] = parts
  if (!gameId) return { type: 'home' }
  if (kind === 'r' && a && b && isDifficulty(b)) {
    const size = Number(a)
    if (Number.isInteger(size)) return { type: 'random', gameId, size, difficulty: b, variant }
  }
  if (kind === 'g' && a && b && isDifficulty(a)) {
    return { type: 'play', gameId, difficulty: a, code: b, variant }
  }
  return { type: 'game', gameId }
}

export const homeHash = () => '#/'
export const gameHash = (gameId: string) => `#/${gameId}`
const variantPart = (variant?: string) => (variant ? `/${encodeURIComponent(variant)}` : '')
export const randomHash = (gameId: string, size: number, difficulty: Difficulty, variant?: string) =>
  `#/${gameId}/r/${size}/${difficulty}${variantPart(variant)}`
export const playHash = (gameId: string, difficulty: Difficulty, code: string, variant?: string) =>
  `#/${gameId}/g/${difficulty}/${encodeURIComponent(code)}${variantPart(variant)}`
