import { useId } from 'react'
import type { LineStyle } from '../../hooks/useLineSettings'
import { fireColor, hue } from './lineColors'

interface PathLineProps {
  /** Cell indices along the path. */
  cells: number[]
  /** Board width in cells. */
  n: number
  lineStyle: LineStyle
  solved?: boolean
  /** Path length the rainbow spreads over, so colours don't shift as the line grows. */
  spread?: number
}

const center = (c: number, n: number): [number, number] => [(c % n) + 0.5, Math.floor(c / n) + 0.5]

/** The line through the path cells, drawn in one of several styles. Coordinates are in cells. */
export function PathLine({ cells, n, lineStyle, solved = false, spread }: PathLineProps) {
  const glowId = 'glow' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  if (cells.length === 0) return null

  const pts = cells.map((c) => center(c, n))
  const points = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const cls = `nc-line style-${lineStyle}${solved ? ' solved' : ''}`

  if (cells.length === 1) {
    const [x, y] = pts[0]
    return (
      <g className={cls}>
        <circle className="nc-line-dot" cx={x} cy={y} r={0.2} style={rainbowish(lineStyle) ? { fill: `hsl(${hue(0, 2)} 85% 60%)` } : undefined} />
      </g>
    )
  }

  switch (lineStyle) {
    case 'rainbow':
    case 'aurora': {
      const total = spread ?? cells.length
      return (
        <g className={cls}>
          {pts.slice(1).map(([x, y], i) => (
            <line
              key={i}
              x1={pts[i][0]}
              y1={pts[i][1]}
              x2={x}
              y2={y}
              className="nc-line-seg"
              style={{ stroke: `hsl(${hue(i, total)} 85% 58%)` }}
            />
          ))}
        </g>
      )
    }
    case 'fire': {
      // Dark red embers at 1, white-hot yellow at the tip.
      const last = Math.max(1, pts.length - 2)
      const segs = (className: string) =>
        pts.slice(1).map(([x, y], i) => (
          <line
            key={i}
            x1={pts[i][0]}
            y1={pts[i][1]}
            x2={x}
            y2={y}
            className={className}
            style={{ stroke: fireColor(i / last) }}
          />
        ))
      return (
        <g className={cls}>
          <defs>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.16" />
            </filter>
          </defs>
          <g className="nc-fire-glow" filter={`url(#${glowId})`}>
            {segs('nc-fire-glow-seg')}
          </g>
          {segs('nc-line-seg')}
          <polyline className="nc-fire-core" points={points} />
        </g>
      )
    }
    case 'flow':
      return (
        <g className={cls}>
          <polyline className="nc-line-base" points={points} />
          <polyline className="nc-line-flow" points={points} />
        </g>
      )
    case 'neon':
      return (
        <g className={cls}>
          <defs>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.14" />
            </filter>
          </defs>
          <polyline className="nc-line-glow" points={points} filter={`url(#${glowId})`} />
          <polyline className="nc-line-base" points={points} />
          <polyline className="nc-line-core" points={points} />
        </g>
      )
    case 'comet':
      return (
        <g className={cls}>
          <polyline className="nc-line-base" points={points} />
          <polyline className="nc-line-comet" points={points} pathLength={100} />
        </g>
      )
    case 'beads':
      return (
        <g className={cls}>
          <polyline className="nc-line-string" points={points} />
          {pts.map(([x, y], i) => (
            <circle key={i} className="nc-line-bead" cx={x} cy={y} r={0.19} />
          ))}
        </g>
      )
    default:
      return (
        <g className={cls}>
          <polyline className="nc-line-base" points={points} />
        </g>
      )
  }
}

function rainbowish(s: LineStyle) {
  return s === 'rainbow' || s === 'aurora'
}
