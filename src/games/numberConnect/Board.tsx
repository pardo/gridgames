import { useLayoutEffect, useMemo, useRef } from 'react'
import { canStep, clueMap, type NCPuzzle } from './puzzle'

interface BoardProps {
  puzzle: NCPuzzle
  path: number[]
  onPathChange: (path: number[]) => void
  /** Called when a drag starts, with the path as it was before it. */
  onStrokeStart: (before: number[]) => void
  disabled: boolean
  solved: boolean
}

/**
 * Pointer events cover mouse, pen and touch alike. The board captures the
 * pointer on press so a drag keeps working even if the finger slides off.
 */
export function Board({ puzzle, path, onPathChange, onStrokeStart, disabled, solved }: BoardProps) {
  const n = puzzle.size
  const clue = useMemo(() => clueMap(puzzle), [puzzle])
  const lastNumber = puzzle.checkpoints.length
  const boardRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef(path)
  useLayoutEffect(() => {
    pathRef.current = path
  }, [path])
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)

  const inPath = useMemo(() => new Set(path), [path])
  const nextNumber = useMemo(() => path.reduce((k, c) => (clue[c] ? k + 1 : k), 1), [path, clue])

  /** Try to move the head of the path onto `cell`; returns the new path. */
  const stepTo = (cur: number[], cell: number): number[] => {
    const head = cur[cur.length - 1]
    if (cell === head) return cur
    // Dragging back onto the previous cell rubs out the last step.
    if (cur.length > 1 && cell === cur[cur.length - 2]) return cur.slice(0, -1)
    if (cur.includes(cell)) return cur
    if (clue[head] === lastNumber) return cur
    if (!canStep(puzzle, head, cell)) return cur
    const k = clue[cell]
    if (k) {
      const next = cur.reduce((acc, c) => (clue[c] ? acc + 1 : acc), 1)
      if (k !== next) return cur
    }
    return [...cur, cell]
  }

  /** Cell under a board-relative point, ignoring a thin band on each border to avoid jitter. */
  const cellAt = (x: number, y: number, size: number, strict: boolean): number | null => {
    const fx = (x / size) * n
    const fy = (y / size) * n
    const col = Math.floor(fx)
    const row = Math.floor(fy)
    if (col < 0 || row < 0 || col >= n || row >= n) return null
    if (strict) {
      const margin = 0.14
      const dx = fx - col
      const dy = fy - row
      if (dx < margin || dx > 1 - margin || dy < margin || dy > 1 - margin) return null
    }
    return row * n + col
  }

  const applyCell = (cur: number[], cell: number): number[] => {
    const head = cur[cur.length - 1]
    const hr = Math.floor(head / n)
    const hc = head % n
    const r = Math.floor(cell / n)
    const c = cell % n
    // A fast diagonal flick can skip the corner cell: try both L-shaped routes.
    if (Math.abs(hr - r) === 1 && Math.abs(hc - c) === 1) {
      for (const via of [hr * n + c, r * n + hc]) {
        const mid = stepTo(cur, via)
        if (mid !== cur && mid.length > cur.length) {
          const done = stepTo(mid, cell)
          if (done !== mid) return done
        }
      }
      return cur
    }
    return stepTo(cur, cell)
  }

  const localPoint = (e: React.PointerEvent) => {
    const rect = boardRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, size: rect.width }
  }

  const handleDown = (e: React.PointerEvent) => {
    if (disabled || dragRef.current) return
    const { x, y, size } = localPoint(e)
    const cell = cellAt(x, y, size, false)
    if (cell === null) return
    const cur = pathRef.current
    let next: number[] | null = null
    if (cur.length === 0) {
      // Any touch starts from 1, but only touching 1 itself begins a drag.
      if (cell === puzzle.checkpoints[0]) next = [cell]
    } else {
      const idx = cur.indexOf(cell)
      // Touching anywhere on the path cuts it back to that cell.
      if (idx >= 0) next = cur.slice(0, idx + 1)
    }
    if (!next) return
    e.preventDefault()
    try {
      boardRef.current!.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already gone (e.g. a synthetic event); the drag still works while over the board.
    }
    dragRef.current = { id: e.pointerId, x, y }
    onStrokeStart(cur)
    if (next.length !== cur.length || next[0] !== cur[0]) {
      pathRef.current = next
      onPathChange(next)
    }
  }

  const handleMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return
    const { x, y, size } = localPoint(e)
    // Sample the segment since the last event so quick swipes don't skip cells.
    const cellPx = size / n
    const dist = Math.hypot(x - drag.x, y - drag.y)
    const steps = Math.max(1, Math.ceil(dist / (cellPx / 4)))
    let cur = pathRef.current
    for (let s = 1; s <= steps; s++) {
      const px = drag.x + ((x - drag.x) * s) / steps
      const py = drag.y + ((y - drag.y) * s) / steps
      const cell = cellAt(px, py, size, true)
      if (cell !== null) cur = applyCell(cur, cell)
    }
    drag.x = x
    drag.y = y
    if (cur !== pathRef.current) {
      pathRef.current = cur
      onPathChange(cur)
    }
  }

  const handleUp = (e: React.PointerEvent) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null
  }

  const pts = path.map((c) => `${(c % n) + 0.5},${Math.floor(c / n) + 0.5}`).join(' ')
  const head = path[path.length - 1]

  const walls: { x1: number; y1: number; x2: number; y2: number; key: string }[] = []
  for (let c = 0; c < n * n; c++) {
    const r = Math.floor(c / n)
    const col = c % n
    if (puzzle.wallRight[c] && col < n - 1) walls.push({ x1: col + 1, y1: r, x2: col + 1, y2: r + 1, key: `r${c}` })
    if (puzzle.wallDown[c] && r < n - 1) walls.push({ x1: col, y1: r + 1, x2: col + 1, y2: r + 1, key: `d${c}` })
  }

  return (
    <div
      ref={boardRef}
      className={`nc-board${solved ? ' solved' : ''}`}
      style={{ '--n': n } as React.CSSProperties}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onLostPointerCapture={handleUp}
    >
      {Array.from({ length: n * n }, (_, c) => (
        <div
          key={c}
          className={`nc-cell${puzzle.blocked[c] ? ' blocked' : ''}${inPath.has(c) ? ' filled' : ''}`}
        />
      ))}

      <svg className="nc-overlay" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
        {path.length > 1 && <polyline className="nc-path" points={pts} />}
        {path.length === 1 && <circle className="nc-path-dot" cx={(head % n) + 0.5} cy={Math.floor(head / n) + 0.5} r={0.2} />}
        {walls.map((w) => (
          <line key={w.key} className="nc-wall" x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />
        ))}
        {puzzle.checkpoints.map((c, i) => {
          const cx = (c % n) + 0.5
          const cy = Math.floor(c / n) + 0.5
          const reached = inPath.has(c)
          const isNext = !solved && i + 1 === nextNumber && path.length > 0
          return (
            <g key={c} className={`nc-number${reached ? ' reached' : ''}${isNext ? ' next' : ''}`}>
              <circle cx={cx} cy={cy} r={0.34} />
              <text x={cx} y={cy} dy="0.02" fontSize={i + 1 >= 10 ? 0.3 : 0.36}>
                {i + 1}
              </text>
            </g>
          )
        })}
        {path.length > 0 && !solved && (
          <circle className="nc-head" cx={(head % n) + 0.5} cy={Math.floor(head / n) + 0.5} r={0.42} />
        )}
      </svg>
    </div>
  )
}
