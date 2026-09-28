import type { NCPuzzle } from './puzzle'

/*
 * URL-safe puzzle code: `<size>.<bits>.<numbers>`
 *   bits    - blocked, wallRight and wallDown flags, bit-packed as base64url
 *   numbers - cell index of each number in order, two base36 chars each
 * Keeps a generated puzzle reload-safe and shareable without a server.
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

export function encodePuzzle(p: NCPuzzle): string {
  const flags = [...p.blocked, ...p.wallRight, ...p.wallDown]
  const bytes = new Uint8Array(Math.ceil(flags.length / 8))
  flags.forEach((f, i) => {
    if (f) bytes[i >> 3] |= 1 << (i & 7)
  })
  const numbers = p.checkpoints.map((c) => c.toString(36).padStart(2, '0')).join('')
  return `${p.size}.${toBase64Url(bytes)}.${numbers}`
}

export function decodePuzzle(code: string): NCPuzzle | null {
  try {
    const [sizeText, bitsText, numbersText] = code.split('.')
    const size = Number(sizeText)
    if (!Number.isInteger(size) || size < 2 || size > 16) return null
    const cells = size * size
    const bytes = fromBase64Url(bitsText)
    const flag = (i: number) => (bytes[i >> 3] & (1 << (i & 7))) !== 0
    const pick = (offset: number) => Array.from({ length: cells }, (_, i) => flag(offset + i))
    const checkpoints: number[] = []
    for (let i = 0; i + 1 < numbersText.length; i += 2) {
      const c = parseInt(numbersText.slice(i, i + 2), 36)
      if (!(c >= 0 && c < cells)) return null
      checkpoints.push(c)
    }
    if (checkpoints.length < 2) return null
    return { size, blocked: pick(0), wallRight: pick(cells), wallDown: pick(2 * cells), checkpoints }
  } catch {
    return null
  }
}
