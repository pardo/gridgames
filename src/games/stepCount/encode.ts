import type { SCPuzzle } from './puzzle'

/*
 * URL-safe puzzle code: `<size>.<moves>.<bits>.<numbers>`
 *   moves   - o: orthogonal only, d: diagonals, x: diagonals that may cross
 *   bits    - blocked, wallRight and wallDown flags, bit-packed as base64url
 *   numbers - each shown number as its cell then its step, two base36 chars each
 * The move rules live in the code, so a shared link plays the same whatever
 * variant it was generated under.
 */

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0))
}

const pair = (v: number) => v.toString(36).padStart(2, '0')

export function encodePuzzle(p: SCPuzzle): string {
  const moves = !p.diagonals ? 'o' : p.crossings ? 'x' : 'd'
  const flags = [...p.blocked, ...p.wallRight, ...p.wallDown]
  const bytes = new Uint8Array(Math.ceil(flags.length / 8))
  flags.forEach((f, i) => {
    if (f) bytes[i >> 3] |= 1 << (i & 7)
  })
  let numbers = ''
  p.clues.forEach((k, c) => {
    if (k) numbers += pair(c) + pair(k)
  })
  return `${p.size}.${moves}.${toBase64Url(bytes)}.${numbers}`
}

export function decodePuzzle(code: string): SCPuzzle | null {
  try {
    const [sizeText, moves, bitsText, numbersText] = code.split('.')
    const size = Number(sizeText)
    if (!Number.isInteger(size) || size < 2 || size > 16) return null
    if (moves !== 'o' && moves !== 'd' && moves !== 'x') return null
    const cells = size * size
    const bytes = fromBase64Url(bitsText)
    const flag = (i: number) => (bytes[i >> 3] & (1 << (i & 7))) !== 0
    const pick = (offset: number) => Array.from({ length: cells }, (_, i) => flag(offset + i))
    const blocked = pick(0)
    const open = blocked.filter((b) => !b).length
    const clues = new Array<number>(cells).fill(0)
    const seen = new Set<number>()
    for (let i = 0; i + 3 < numbersText.length; i += 4) {
      const c = parseInt(numbersText.slice(i, i + 2), 36)
      const k = parseInt(numbersText.slice(i + 2, i + 4), 36)
      if (!(c >= 0 && c < cells) || blocked[c] || !(k >= 1 && k <= open) || seen.has(k)) return null
      seen.add(k)
      clues[c] = k
    }
    // The line needs a visible start and finish.
    if (!seen.has(1) || !seen.has(open)) return null
    return {
      size,
      diagonals: moves !== 'o',
      crossings: moves === 'x',
      blocked,
      wallRight: pick(cells),
      wallDown: pick(2 * cells),
      clues,
    }
  } catch {
    return null
  }
}
