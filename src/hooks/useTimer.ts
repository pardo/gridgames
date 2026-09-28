import { useCallback, useEffect, useRef, useState } from 'react'

export function useTimer(initialMs = 0) {
  const [elapsedMs, setElapsedMs] = useState(initialMs)
  const [running, setRunning] = useState(false)
  const lastTickRef = useRef<number | null>(null)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (!running) return

    lastTickRef.current = performance.now()
    const tick = (now: number) => {
      const last = lastTickRef.current ?? now
      lastTickRef.current = now
      setElapsedMs((prev) => prev + (now - last))
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frameRef.current)
  }, [running])

  const start = useCallback(() => setRunning(true), [])
  const pause = useCallback(() => setRunning(false), [])
  const reset = useCallback((toMs = 0) => {
    setElapsedMs(toMs)
    lastTickRef.current = null
  }, [])

  return { elapsedMs, running, start, pause, reset }
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
