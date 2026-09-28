import { useState } from 'react'

export type LineStyle = 'solid' | 'flow' | 'rainbow' | 'aurora' | 'neon' | 'comet' | 'beads' | 'fire'

export const LINE_STYLES: { id: LineStyle; label: string; blurb: string }[] = [
  { id: 'solid', label: 'Solid', blurb: 'Clean, classic line' },
  { id: 'flow', label: 'Flow', blurb: 'Dashes stream toward the head' },
  { id: 'rainbow', label: 'Rainbow', blurb: 'Each step shifts colour' },
  { id: 'aurora', label: 'Aurora', blurb: 'Rainbow that keeps cycling' },
  { id: 'neon', label: 'Neon', blurb: 'Glowing tube with a pulse' },
  { id: 'comet', label: 'Comet', blurb: 'A spark races along the line' },
  { id: 'beads', label: 'Beads', blurb: 'Pearls on a string' },
  { id: 'fire', label: 'Fire', blurb: 'Embers heating up to the tip' },
]

export interface LineSettings {
  lineStyle: LineStyle
  /** Expanding ring on each new cell. */
  ripple: boolean
  /** Particles flying off the head while dragging. */
  sparkles: boolean
  /** Burst when a number is reached. */
  numberBurst: boolean
  /** Wave along the solved path. */
  winWave: boolean
  /** Vibration ticks on supporting phones. */
  haptics: boolean
}

const KEY = 'gridgames-line-settings'

const DEFAULTS: LineSettings = {
  lineStyle: 'solid',
  ripple: true,
  sparkles: true,
  numberBurst: true,
  winWave: true,
  haptics: true,
}

function load(): LineSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<LineSettings>) }
  } catch {
    // Ignore.
  }
  return DEFAULTS
}

export function useLineSettings() {
  const [settings, setSettings] = useState<LineSettings>(load)

  const update = (patch: Partial<LineSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // Ignore.
      }
      return next
    })
  }

  return { settings, update }
}

export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export function vibrate(pattern: number | number[]) {
  if (!canVibrate) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Ignore.
  }
}
