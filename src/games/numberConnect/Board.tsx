import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { vibrate, type LineSettings } from '../../hooks/useLineSettings'
import { isMulticolor, stepColor } from './lineColors'
import { PathLine } from './PathLine'
import { canStep, clueMap, openCellCount, type NCPuzzle } from './puzzle'

interface BoardProps {
  puzzle: NCPuzzle
  path: number[]
  onPathChange: (path: number[]) => void
  /** Called when a drag starts, with the path as it was before it. */
  onStrokeStart: (before: number[]) => void
  disabled: boolean
  solved: boolean
  look: LineSettings
}

/** A short-lived decoration: ring on a new cell, spark off the head, burst on a number. */
interface Fx {
  id: number
  kind: 'ripple' | 'spark' | 'burst'
  x: number
  y: number
  color: string
  dx?: number
  dy?: number
  r?: number
  spin?: number
  delay?: number
}

const FX_LIFETIME = 700
const MAX_FX = 80
let fxSeq = 0

/**
 * Pointer events cover mouse, pen and touch alike. The board captures the
 * pointer on press so a drag keeps working even if the finger slides off.
 */
export function Board({ puzzle, path, onPathChange, onStrokeStart, disabled, solved, look }: BoardProps) {
  const n = puzzle.size
  const clue = useMemo(() => clueMap(puzzle), [puzzle])
  const openCells = useMemo(() => openCellCount(puzzle), [puzzle])
  const lastNumber = puzzle.checkpoints.length
  const boardRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef(path)
  useLayoutEffect(() => {
    pathRef.current = path
  }, [path])
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fx, setFx] = useState<Fx[]>([])
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const colorAt = (index: number, pathLen = index + 1) =>
    stepColor(look.lineStyle, index, pathLen, openCells) ?? 'var(--accent)'

  /** Decorate the cells a move just added. */
  const emitFx = (prev: number[], next: number[]) => {
    if (next.length <= prev.length) return
    const added: Fx[] = []
    let hitNumber = false
    for (let i = prev.length; i < next.length; i++) {
      const c = next[i]
      const x = (c % n) + 0.5
      const y = Math.floor(c / n) + 0.5
      const color = colorAt(i, next.length)
      const isNumber = clue[c] > 0 && i > 0
      if (isNumber) hitNumber = true
      if (isNumber && look.numberBurst) {
        added.push({ id: ++fxSeq, kind: 'burst', x, y, color })
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2 + Math.random() * 0.3
          const d = 0.6 + Math.random() * 0.4
          added.push({
            id: ++fxSeq,
            kind: 'spark',
            x,
            y,
            color: `hsl(${Math.round(Math.random() * 360)} 95% 65%)`,
            dx: Math.cos(a) * d,
            dy: Math.sin(a) * d,
            r: 0.09 + Math.random() * 0.06,
            spin: (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 180),
            delay: Math.random() * 60,
          })
        }
      } else if (look.ripple) {
        added.push({ id: ++fxSeq, kind: 'ripple', x, y, color })
      }
      // Sparks only off the newest cell, so a fast swipe doesn't spray the whole line.
      if (look.sparkles && i === next.length - 1) {
        // A trail behind the tip: sparks kick back against the direction of travel.
        const from = i > 0 ? next[i - 1] : c
        const back = Math.atan2(Math.floor(from / n) - Math.floor(c / n), (from % n) - (c % n))
        for (let k = 0; k < 3; k++) {
          const a = back + (Math.random() - 0.5) * 2.2
          const d = 0.25 + Math.random() * 0.3
          added.push({
            id: ++fxSeq,
            kind: 'spark',
            x,
            y,
            color: k === 0 ? 'white' : color,
            dx: Math.cos(a) * d,
            dy: Math.sin(a) * d,
            r: 0.06 + Math.random() * 0.06,
            spin: (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 120),
            delay: k * 30,
          })
        }
      }
    }
    if (look.haptics) vibrate(hitNumber ? [14, 40, 14] : 6)
    if (!added.length) return
    setFx((cur) => [...cur, ...added].slice(-MAX_FX))
    const ids = new Set(added.map((a) => a.id))
    timers.current.push(window.setTimeout(() => setFx((cur) => cur.filter((e) => !ids.has(e.id))), FX_LIFETIME))
  }

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
    setDragging(true)
    onStrokeStart(cur)
    if (next.length !== cur.length || next[0] !== cur[0]) {
      emitFx(cur, next)
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
      emitFx(pathRef.current, cur)
      pathRef.current = cur
      onPathChange(cur)
    }
  }

  const handleUp = (e: React.PointerEvent) => {
    if (dragRef.current?.id === e.pointerId) {
      dragRef.current = null
      setDragging(false)
    }
  }

  const head = path[path.length - 1]

  const walls: { x1: number; y1: number; x2: number; y2: number; key: string }[] = []
  for (let c = 0; c < n * n; c++) {
    const r = Math.floor(c / n)
    const col = c % n
    if (puzzle.wallRight[c] && col < n - 1) walls.push({ x1: col + 1, y1: r, x2: col + 1, y2: r + 1, key: `r${c}` })
    if (puzzle.wallDown[c] && r < n - 1) walls.push({ x1: col, y1: r + 1, x2: col + 1, y2: r + 1, key: `d${c}` })
  }

  const wave = solved && look.winWave
  const pathIndex = new Map(path.map((c, i) => [c, i]))
  /** Per-cell colour and path position, so fills and numbers match the line. */
  const cellStyle = (c: number): React.CSSProperties | undefined => {
    const i = pathIndex.get(c)
    if (i === undefined) return undefined
    const color = stepColor(look.lineStyle, i, path.length, openCells)
    return { '--i': i, ...(color ? { '--c': color } : {}) } as React.CSSProperties
  }

  return (
    <div
      ref={boardRef}
      className={`nc-board look-${look.lineStyle}${isMulticolor(look.lineStyle) ? ' multicolor' : ''}${solved ? ' solved' : ''}${wave ? ' wave' : ''}${dragging ? ' dragging' : ''}`}
      style={{ '--n': n, '--path-len': path.length } as React.CSSProperties}
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
          style={cellStyle(c)}
        />
      ))}

      <svg className="nc-overlay" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
        <PathLine cells={path} n={n} lineStyle={look.lineStyle} solved={solved} spread={openCells} />
        {walls.map((w) => (
          <line key={w.key} className="nc-wall" x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />
        ))}
        {fx.map((e) =>
          e.kind === 'spark' ? (
            <g key={e.id} transform={`translate(${e.x} ${e.y}) scale(${e.r})`}>
              {/* Four-point twinkle drawn around its own origin, so it scales and spins in place. */}
              <path
                className="nc-fx-spark"
                d="M0,-1 C0.12,-0.12 0.12,-0.12 1,0 C0.12,0.12 0.12,0.12 0,1 C-0.12,0.12 -0.12,0.12 -1,0 C-0.12,-0.12 -0.12,-0.12 0,-1Z"
                style={
                  {
                    '--dx': `${(e.dx ?? 0) / (e.r ?? 1)}px`,
                    '--dy': `${(e.dy ?? 0) / (e.r ?? 1)}px`,
                    '--fall': `${0.25 / (e.r ?? 1)}px`,
                    '--spin': `${e.spin ?? 90}deg`,
                    '--delay': `${e.delay ?? 0}ms`,
                    fill: e.color,
                  } as React.CSSProperties
                }
              />
            </g>
          ) : (
            <circle
              key={e.id}
              className={e.kind === 'burst' ? 'nc-fx-burst' : 'nc-fx-ripple'}
              cx={e.x}
              cy={e.y}
              r={e.kind === 'burst' ? 0.36 : 0.3}
              style={{ stroke: e.color }}
            />
          ),
        )}
        {puzzle.checkpoints.map((c, i) => {
          const cx = (c % n) + 0.5
          const cy = Math.floor(c / n) + 0.5
          const reached = inPath.has(c)
          const isNext = !solved && i + 1 === nextNumber && path.length > 0
          return (
            <g
              key={c}
              className={`nc-number${reached ? ' reached' : ''}${isNext ? ' next' : ''}`}
              style={cellStyle(c)}
            >
              <circle cx={cx} cy={cy} r={0.34} />
              {/* Alphabetic baseline nudged down by half the digit height: dominant-baseline
                  centres the whole font box (and differs on iOS), which sits the digits high. */}
              <text x={cx} y={cy} dy="0.36em" fontSize={i + 1 >= 10 ? 0.3 : 0.36}>
                {i + 1}
              </text>
            </g>
          )
        })}
        {path.length > 0 && !solved && (
          <circle
            className="nc-head"
            cx={(head % n) + 0.5}
            cy={Math.floor(head / n) + 0.5}
            r={0.42}
            style={{ stroke: colorAt(path.length - 1) }}
          />
        )}
      </svg>
    </div>
  )
}
