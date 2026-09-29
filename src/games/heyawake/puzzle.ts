/** A rectangular room. `clue` is how many of its cells are shaded, if shown. */
export interface Room {
  r: number
  c: number
  w: number
  h: number
  clue: number | null
  cells: number[]
}

export interface HYPuzzle {
  size: number
  /** Rooms in reading order of their top-left cell. */
  rooms: Room[]
  /** Per cell: index of its room. */
  roomOf: number[]
  /**
   * Straight runs that cross two room borders: from the cell before one
   * border to the cell after the next. Each needs at least one shaded cell,
   * or a line of unshaded cells would span three rooms.
   */
  segments: number[][]
}

export type RoomRect = Pick<Room, 'r' | 'c' | 'w' | 'h' | 'clue'>

/** What the player has put on a cell. */
export const EMPTY = 0
export const SHADED = 1
export const DOT = 2
export type Mark = typeof EMPTY | typeof SHADED | typeof DOT

export function buildPuzzle(size: number, rects: RoomRect[]): HYPuzzle {
  const sorted = [...rects].sort((a, b) => a.r - b.r || a.c - b.c)
  const roomOf = new Array<number>(size * size).fill(-1)
  const rooms = sorted.map((rect, i) => {
    const cells: number[] = []
    for (let r = rect.r; r < rect.r + rect.h; r++) {
      for (let c = rect.c; c < rect.c + rect.w; c++) {
        cells.push(r * size + c)
        roomOf[r * size + c] = i
      }
    }
    return { ...rect, cells }
  })
  return { size, rooms, roomOf, segments: findSegments(size, roomOf) }
}

function findSegments(n: number, roomOf: number[]): number[][] {
  const segments: number[][] = []
  const scan = (line: number[]) => {
    const borders: number[] = []
    for (let i = 0; i + 1 < line.length; i++) if (roomOf[line[i]] !== roomOf[line[i + 1]]) borders.push(i)
    for (let k = 0; k + 1 < borders.length; k++) segments.push(line.slice(borders[k], borders[k + 1] + 2))
  }
  for (let i = 0; i < n; i++) {
    scan(Array.from({ length: n }, (_, j) => i * n + j))
    scan(Array.from({ length: n }, (_, j) => j * n + i))
  }
  return segments
}

export function neighbours(n: number, c: number): number[] {
  const r = Math.floor(c / n)
  const col = c % n
  const out: number[] = []
  if (r > 0) out.push(c - n)
  if (r < n - 1) out.push(c + n)
  if (col > 0) out.push(c - 1)
  if (col < n - 1) out.push(c + 1)
  return out
}

/** Connected groups of the cells `keep` accepts. */
export function components(n: number, keep: (c: number) => boolean): number[][] {
  const seen = new Uint8Array(n * n)
  const groups: number[][] = []
  for (let s = 0; s < n * n; s++) {
    if (seen[s] || !keep(s)) continue
    const group = [s]
    seen[s] = 1
    for (let k = 0; k < group.length; k++) {
      for (const nb of neighbours(n, group[k])) {
        if (!seen[nb] && keep(nb)) {
          seen[nb] = 1
          group.push(nb)
        }
      }
    }
    groups.push(group)
  }
  return groups
}

/** Does this shading satisfy every rule? Unshaded means anything not shaded. */
export function isSolution(p: HYPuzzle, shaded: (c: number) => boolean): boolean {
  const n = p.size
  for (let c = 0; c < n * n; c++) {
    if (!shaded(c)) continue
    if ((c % n < n - 1 && shaded(c + 1)) || (c + n < n * n && shaded(c + n))) return false
  }
  for (const room of p.rooms) {
    if (room.clue !== null && room.cells.filter(shaded).length !== room.clue) return false
  }
  if (!p.segments.every((seg) => seg.some(shaded))) return false
  return components(n, (c) => !shaded(c)).length === 1
}

export interface Analysis {
  solved: boolean
  /** Shaded cells touching another shaded cell. */
  adjacent: Set<number>
  /** Rooms over their number, or with too few open cells left to reach it. */
  badRooms: Set<number>
  /** Numbered rooms with exactly their count and no mistakes inside. */
  okRooms: Set<number>
  /** Runs of dotted cells spanning three rooms. */
  badRuns: number[][]
  /** Dotted cells walled off from the rest of the unshaded area. */
  cutOff: Set<number>
}

/**
 * Mistakes that are certain from what's on the board, for live feedback.
 * Empty cells might still be shaded or not, so only dots count as unshaded
 * here, except for the final win check.
 */
export function analyze(p: HYPuzzle, marks: readonly Mark[]): Analysis {
  const n = p.size
  const shaded = (c: number) => marks[c] === SHADED

  const adjacent = new Set<number>()
  for (let c = 0; c < n * n; c++) {
    if (!shaded(c)) continue
    for (const nb of neighbours(n, c)) {
      if (shaded(nb)) {
        adjacent.add(c)
        adjacent.add(nb)
      }
    }
  }

  const badRooms = new Set<number>()
  const okRooms = new Set<number>()
  p.rooms.forEach((room, i) => {
    if (room.clue === null) return
    const count = room.cells.filter(shaded).length
    const open = room.cells.filter((c) => marks[c] === EMPTY).length
    if (count > room.clue || count + open < room.clue) badRooms.add(i)
    // A 0 room is "done" from the start, so it only counts once it's been dotted out.
    else if (count === room.clue && (count > 0 || open === 0) && !room.cells.some((c) => adjacent.has(c))) okRooms.add(i)
  })

  const badRuns = p.segments.filter((seg) => seg.every((c) => marks[c] === DOT))

  // Every piece of the open area but the one with the most dots is cut off.
  const cutOff = new Set<number>()
  const dotted = components(n, (c) => !shaded(c))
    .map((g) => g.filter((c) => marks[c] === DOT))
    .filter((d) => d.length > 0)
    .sort((a, b) => b.length - a.length)
  for (const group of dotted.slice(1)) group.forEach((c) => cutOff.add(c))

  return { solved: isSolution(p, shaded), adjacent, badRooms, okRooms, badRuns, cutOff }
}
