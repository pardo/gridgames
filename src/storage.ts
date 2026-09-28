import type { Difficulty } from './games/types'

const PREFIX = 'gridgames:'
const MAX_HISTORY = 20

export interface RunRecord {
  timeMs: number
  completedAt: string
  /** Puzzle code, so a past run can be replayed. */
  code?: string
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Ignore quota/availability errors; data just won't persist.
  }
}

/** Per-puzzle saved state; the shape is up to each game. */
export function loadProgress<T>(gameId: string, code: string): T | null {
  return read<T | null>(`${gameId}:progress:${code}`, null)
}

export function saveProgress(gameId: string, code: string, progress: unknown): void {
  write(`${gameId}:progress:${code}`, progress)
}

/**
 * Random puzzles are one-offs, so runs are tracked per mode (game + size +
 * difficulty), e.g. every "7x7 Hard" you've solved.
 */
function modeKey(gameId: string, size: number, difficulty: Difficulty): string {
  return `${gameId}:mode:${size}-${difficulty}`
}

export function loadModeHistory(gameId: string, size: number, difficulty: Difficulty): RunRecord[] {
  return read<RunRecord[]>(modeKey(gameId, size, difficulty), [])
}

export function addModeRunRecord(
  gameId: string,
  size: number,
  difficulty: Difficulty,
  record: RunRecord,
): RunRecord[] {
  const next = [record, ...loadModeHistory(gameId, size, difficulty)].slice(0, MAX_HISTORY)
  write(modeKey(gameId, size, difficulty), next)
  return next
}

export function bestTime(history: RunRecord[]): number | undefined {
  return history.length ? Math.min(...history.map((r) => r.timeMs)) : undefined
}
