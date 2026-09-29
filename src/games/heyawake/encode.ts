import { buildPuzzle, type HYPuzzle, type RoomRect } from './puzzle'

/*
 * URL-safe puzzle code: `<size>.<rooms>`, three characters per room in
 * reading order of the room's top-left cell: width, height (base36) and the
 * number (base36, or '-' when the room has none). Each room starts on the
 * first cell not yet covered, so positions don't need storing.
 */

export function encodePuzzle(p: HYPuzzle): string {
  const rooms = p.rooms.map((r) => r.w.toString(36) + r.h.toString(36) + (r.clue === null ? '-' : r.clue.toString(36)))
  return `${p.size}.${rooms.join('')}`
}

export function decodePuzzle(code: string): HYPuzzle | null {
  const [sizeText, roomsText] = code.split('.')
  const size = Number(sizeText)
  if (!Number.isInteger(size) || size < 2 || size > 16 || !roomsText || roomsText.length % 3) return null
  const covered = new Uint8Array(size * size)
  const rects: RoomRect[] = []
  let next = 0
  for (let i = 0; i < roomsText.length; i += 3) {
    while (next < size * size && covered[next]) next++
    if (next >= size * size) return null
    const w = parseInt(roomsText[i], 36)
    const h = parseInt(roomsText[i + 1], 36)
    const clueChar = roomsText[i + 2]
    const clue = clueChar === '-' ? null : parseInt(clueChar, 36)
    const r = Math.floor(next / size)
    const c = next % size
    if (!(w >= 1 && h >= 1) || r + h > size || c + w > size || Number.isNaN(clue)) return null
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++) {
        if (covered[y * size + x]) return null
        covered[y * size + x] = 1
      }
    }
    rects.push({ r, c, w, h, clue })
  }
  if (covered.some((v) => !v)) return null
  return buildPuzzle(size, rects)
}
