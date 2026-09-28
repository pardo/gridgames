import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { vibrate, type LineSettings } from '../../../hooks/useLineSettings'
import { cellUnder, moveToward } from './drag'
import { isMulticolor, stepColor } from './lineColors'
import { PathLine } from './PathLine'
import type { PathRules } from './rules'

/** A number drawn on the board. */
export interface BoardMark {
  cell: number
  label: number
  /** reached: on the line. next: where the line must go next. wrong: on the line at the wrong step. */
  state?: 'reached' | 'next' | 'wrong'
}

interface BoardProps {
  rules: PathRules
  blocked: boolean[]
  /** Per cell: wall between this cell and the one to its right. */
  wallRight: boolean[]
  /** Per cell: wall between this cell and the one below it. */
  wallDown: boolean[]
  marks: BoardMark[]
  /** Cell the pulsing "head here next" ring sits on, if any. */
  ringCell?: number
  /** True when step `index` (0-based) of the line landing on `cell` hits a number: burst and a stronger buzz. */
  isMilestone: (cell: number, index: number) => boolean
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
const hasGlow = (style: LineSettings['lineStyle']) => style === 'neon' || style === 'fire'

export function Board({
  rules,
  blocked,
  wallRight,
  wallDown,
  marks,
  ringCell,
  isMilestone,
  path,
  onPathChange,
  onStrokeStart,
  disabled,
  solved,
  look,
}: BoardProps) {
  const n = rules.size
  const openCells = useMemo(() => blocked.reduce((sum, b) => sum + (b ? 0 : 1), 0), [blocked])
  const boardRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef(path)
  useLayoutEffect(() => {
    pathRef.current = path
  }, [path])
  /** Active drag: pointer id plus the finger's recent trail in board-cell units. */
  const dragRef = useRef<{ id: number; trail: { x: number; y: number }[] } | null>(null)
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
      const isNumber = i > 0 && isMilestone(c, i)
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

  /** Pointer position in board-cell units (0..n on each axis). */
  const localPoint = (e: React.PointerEvent) => {
    const rect = boardRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * n, y: ((e.clientY - rect.top) / rect.height) * n }
  }

  const handleDown = (e: React.PointerEvent) => {
    if (disabled || dragRef.current) return
    const p = localPoint(e)
    const cell = cellUnder(n, p, undefined)
    if (cell === null) return
    const cur = pathRef.current
    let next: number[] | null = null
    if (cur.length === 0) {
      // Only touching the start cell begins a line.
      if (cell === rules.start) next = [cell]
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
    dragRef.current = { id: e.pointerId, trail: [p] }
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
    const p = localPoint(e)
    const last = drag.trail[drag.trail.length - 1]
    // Sample long moves so the trail (used to pick a route around corners) stays smooth.
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / 0.34))
    let cur = pathRef.current
    for (let k = 1; k <= steps; k++) {
      const pt = { x: last.x + ((p.x - last.x) * k) / steps, y: last.y + ((p.y - last.y) * k) / steps }
      drag.trail.push(pt)
      if (drag.trail.length > 16) drag.trail.shift()
      const target = cellUnder(n, pt, cur[cur.length - 1])
      if (target === null) continue
      const moved = moveToward(rules, cur, target, drag.trail)
      if (moved !== cur) {
        cur = moved
        // Only the trail since the head last moved matters for the next route.
        drag.trail = [pt]
      }
    }
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
    if (wallRight[c] && col < n - 1) walls.push({ x1: col + 1, y1: r, x2: col + 1, y2: r + 1, key: `r${c}` })
    if (wallDown[c] && r < n - 1) walls.push({ x1: col, y1: r + 1, x2: col + 1, y2: r + 1, key: `d${c}` })
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
          className={`nc-cell${blocked[c] ? ' blocked' : ''}${inPath.has(c) ? ' filled' : ''}`}
          style={cellStyle(c)}
        />
      ))}

      {/* Layers, bottom to top. Each animated style lives in its own element so the
          browser can repaint or composite it without redrawing the rest of the board. */}
      {hasGlow(look.lineStyle) && (
        <svg className={`nc-layer nc-glow-layer glow-${look.lineStyle}`} viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
          <PathLine cells={path} n={n} lineStyle={look.lineStyle} solved={solved} spread={openCells} layer="glow" />
        </svg>
      )}
      <svg className="nc-layer nc-line-layer" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
        <PathLine cells={path} n={n} lineStyle={look.lineStyle} solved={solved} spread={openCells} layer="main" />
      </svg>

      <svg className="nc-layer" viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
        {walls.map((w) => (
          <line key={w.key} className="nc-wall" x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />
        ))}
        {marks.map(({ cell: c, label, state }) => {
          const cx = (c % n) + 0.5
          const cy = Math.floor(c / n) + 0.5
          return (
            <g key={c} className={`nc-number${state ? ` ${state}` : ''}`} style={cellStyle(c)}>
              <circle cx={cx} cy={cy} r={0.34} />
              {/* Alphabetic baseline nudged down by half the digit height: dominant-baseline
                  centres the whole font box (and differs on iOS), which sits the digits high. */}
              <text x={cx} y={cy} dy="0.36em" fontSize={label >= 100 ? 0.24 : label >= 10 ? 0.3 : 0.36}>
                {label}
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

      {/* Effects are plain HTML elements animated with transform/opacity only,
          which the browser runs on the GPU without repainting the board. */}
      <div className="nc-fx-layer" aria-hidden="true">
        {!solved && ringCell !== undefined && (
          <span
            className="nc-next-ring"
            style={{
              left: `${(((ringCell % n) + 0.5) / n) * 100}%`,
              top: `${((Math.floor(ringCell / n) + 0.5) / n) * 100}%`,
              width: `${(0.8 / n) * 100}%`,
            }}
          />
        )}
        {fx.map((e) => {
          const size = e.kind === 'spark' ? (e.r ?? 0.08) * 2 : e.kind === 'burst' ? 0.72 : 0.6
          const style: Record<string, string> = {
            left: `${(e.x / n) * 100}%`,
            top: `${(e.y / n) * 100}%`,
            width: `${(size / n) * 100}%`,
            color: e.color,
          }
          if (e.kind === 'spark') {
            // translate() percentages are relative to the spark's own size.
            style['--dx'] = `${((e.dx ?? 0) / size) * 100}%`
            style['--dy'] = `${((e.dy ?? 0) / size) * 100}%`
            style['--fall'] = `${(0.25 / size) * 100}%`
            style['--spin'] = `${e.spin ?? 90}deg`
            style['--delay'] = `${e.delay ?? 0}ms`
          }
          return <span key={e.id} className={`nc-fx nc-fx-${e.kind}`} style={style as React.CSSProperties} />
        })}
      </div>
    </div>
  )
}
