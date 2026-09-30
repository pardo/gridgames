import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { vibrate, type LineSettings } from '../../hooks/useLineSettings'
import { DOT, EMPTY, SHADED, type Analysis, type HYPuzzle, type Mark } from './puzzle'

interface HeyawakeBoardProps {
  puzzle: HYPuzzle
  marks: Mark[]
  analysis: Analysis
  onMarksChange: (marks: Mark[]) => void
  /** Called when a tap or drag starts, with the marks as they were before it. */
  onStrokeStart: (before: Mark[]) => void
  disabled: boolean
  solved: boolean
  look: LineSettings
}

interface Ripple {
  id: number
  cell: number
}

const FX_LIFETIME = 600
let fxSeq = 0

/**
 * Tap cycles a cell: empty, shaded, marked open (a light fill). Dragging paints whatever the first
 * cell became onto every cell it passes that was in the same state as the
 * first one was, so a stroke never wipes out other marks. Right-click marks open.
 */
export function HeyawakeBoard({ puzzle, marks, analysis, onMarksChange, onStrokeStart, disabled, solved, look }: HeyawakeBoardProps) {
  const n = puzzle.size
  const boardRef = useRef<HTMLDivElement>(null)
  const marksRef = useRef(marks)
  useLayoutEffect(() => {
    marksRef.current = marks
  }, [marks])
  const dragRef = useRef<{ id: number; from: Mark; to: Mark; last: number } | null>(null)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const cellAt = (e: React.PointerEvent) => {
    const rect = boardRef.current!.getBoundingClientRect()
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * n)
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * n)
    return row >= 0 && row < n && col >= 0 && col < n ? row * n + col : null
  }

  const paint = (cells: number[]) => {
    const drag = dragRef.current!
    const cur = marksRef.current
    const changed = cells.filter((c) => cur[c] === drag.from)
    if (!changed.length) return
    const next = cur.slice()
    for (const c of changed) next[c] = drag.to
    marksRef.current = next
    onMarksChange(next)
    if (look.haptics) vibrate(drag.to === SHADED ? 8 : 4)
    if (look.ripple && drag.to === SHADED) {
      const added = changed.map((cell) => ({ id: ++fxSeq, cell }))
      setRipples((r) => [...r, ...added].slice(-30))
      const ids = new Set(added.map((a) => a.id))
      timers.current.push(window.setTimeout(() => setRipples((r) => r.filter((x) => !ids.has(x.id))), FX_LIFETIME))
    }
  }

  const handleDown = (e: React.PointerEvent) => {
    if (disabled || dragRef.current) return
    const cell = cellAt(e)
    if (cell === null) return
    e.preventDefault()
    try {
      boardRef.current!.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already gone; the stroke still works while over the board.
    }
    const from = marksRef.current[cell]
    const to: Mark = e.button === 2 ? (from === DOT ? EMPTY : DOT) : (((from + 1) % 3) as Mark)
    dragRef.current = { id: e.pointerId, from, to, last: cell }
    onStrokeStart(marksRef.current)
    paint([cell])
  }

  const handleMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return
    const cell = cellAt(e)
    if (cell === null || cell === drag.last) return
    // Walk the straight line from the last cell so a fast swipe doesn't skip any.
    const [r0, c0] = [Math.floor(drag.last / n), drag.last % n]
    const [r1, c1] = [Math.floor(cell / n), cell % n]
    const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0))
    const cells: number[] = []
    for (let k = 1; k <= steps; k++) {
      cells.push(Math.round(r0 + ((r1 - r0) * k) / steps) * n + Math.round(c0 + ((c1 - c0) * k) / steps))
    }
    drag.last = cell
    paint(cells)
  }

  const handleUp = (e: React.PointerEvent) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null
  }

  // Bold borders between rooms; the board's own edge is the outer one.
  const borders: { x1: number; y1: number; x2: number; y2: number; key: string }[] = []
  for (let c = 0; c < n * n; c++) {
    const r = Math.floor(c / n)
    const col = c % n
    if (col < n - 1 && puzzle.roomOf[c] !== puzzle.roomOf[c + 1]) borders.push({ x1: col + 1, y1: r, x2: col + 1, y2: r + 1, key: `r${c}` })
    if (r < n - 1 && puzzle.roomOf[c] !== puzzle.roomOf[c + n]) borders.push({ x1: col, y1: r + 1, x2: col + 1, y2: r + 1, key: `d${c}` })
  }

  const clueAt = new Map(puzzle.rooms.map((room, i) => [room.cells[0], i]))
  const wave = solved && look.winWave

  return (
    <div
      ref={boardRef}
      className={`hy-board${solved ? ' solved' : ''}${wave ? ' wave' : ''}`}
      style={{ '--n': n } as React.CSSProperties}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onLostPointerCapture={handleUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {marks.map((mark, c) => {
        const roomIndex = clueAt.get(c)
        const clue = roomIndex === undefined ? null : puzzle.rooms[roomIndex].clue
        const err = analysis.adjacent.has(c) || analysis.cutOff.has(c)
        const cls = `hy-cell${mark === SHADED ? ' shaded' : mark === DOT ? ' dot' : ''}${err ? ' err' : ''}`
        return (
          <div key={c} className={cls} style={{ '--d': Math.floor(c / n) + (c % n) } as React.CSSProperties}>
            {mark === SHADED && <span className="hy-ink" />}
            {clue !== null && (
              <span
                className={`hy-clue${analysis.badRooms.has(roomIndex!) ? ' bad' : analysis.okRooms.has(roomIndex!) ? ' ok' : ''}`}
              >
                {clue}
              </span>
            )}
          </div>
        )
      })}

      <svg className="hy-layer" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
        {borders.map((b) => (
          <line key={b.key} className="hy-border" x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} />
        ))}
        {analysis.badRuns.map((run) => {
          const [a, b] = [run[0], run[run.length - 1]]
          return (
            <line
              key={`${a}-${b}`}
              className="hy-bad-run"
              x1={(a % n) + 0.5}
              y1={Math.floor(a / n) + 0.5}
              x2={(b % n) + 0.5}
              y2={Math.floor(b / n) + 0.5}
            />
          )
        })}
      </svg>

      <div className="nc-fx-layer" aria-hidden="true">
        {ripples.map(({ id, cell }) => (
          <span
            key={id}
            className="nc-fx nc-fx-ripple"
            style={{
              left: `${(((cell % n) + 0.5) / n) * 100}%`,
              top: `${((Math.floor(cell / n) + 0.5) / n) * 100}%`,
              width: `${(0.6 / n) * 100}%`,
              color: 'var(--accent)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
