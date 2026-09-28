import { useEffect, useMemo, useRef, useState } from 'react'
import { StatsModal } from '../../components/StatsModal'
import { ThemeToggle } from '../../components/ThemeToggle'
import { WinModal } from '../../components/WinModal'
import { useLineSettings, vibrate } from '../../hooks/useLineSettings'
import { formatDuration, useTimer } from '../../hooks/useTimer'
import { addModeRunRecord, loadModeHistory, loadProgress, saveProgress, type RunRecord } from '../../storage'
import { DIFFICULTIES, type GamePlayProps } from '../types'
import { Board } from './Board'
import { decodePuzzle } from './encode'
import { LookSettingsModal } from './LookSettingsModal'
import { isSolved, openCellCount } from './puzzle'
import { solve } from './solver'

export const GAME_ID = 'simple-number-connect'

interface Progress {
  path: number[]
  elapsedMs: number
  completed: boolean
  /** The solution was shown: this puzzle no longer counts toward stats. */
  revealed?: boolean
}

export function NumberConnectPlay({ code, difficulty, onBackToMenu, onNewRandom, theme, onToggleTheme }: GamePlayProps) {
  const puzzle = useMemo(() => decodePuzzle(code), [code])
  const saved = useMemo(() => loadProgress<Progress>(GAME_ID, code), [code])
  const [path, setPath] = useState<number[]>(saved?.path ?? [])
  const [won, setWon] = useState(saved?.completed ?? false)
  const [revealed, setRevealed] = useState(saved?.revealed ?? false)
  /** True while the board is showing the revealed answer (not a solve by the player). */
  const [showingSolution, setShowingSolution] = useState(false)
  const [confirmReveal, setConfirmReveal] = useState(false)
  const [undoStack, setUndoStack] = useState<number[][]>([])
  const [showStats, setShowStats] = useState(false)
  const [showWin, setShowWin] = useState(false)
  const [showLook, setShowLook] = useState(false)
  const { settings: look, update: updateLook } = useLineSettings()
  const winTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => clearTimeout(winTimer.current), [])
  const strokeBefore = useRef<number[] | null>(null)
  const timer = useTimer(saved?.elapsedMs ?? 0)
  const size = puzzle?.size ?? 0
  const [history, setHistory] = useState<RunRecord[]>(() => loadModeHistory(GAME_ID, size, difficulty))

  useEffect(() => {
    if (!won) timer.start()
    return () => timer.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  useEffect(() => {
    saveProgress(GAME_ID, code, { path, elapsedMs: timer.elapsedMs, completed: won, revealed } satisfies Progress)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, won, revealed])

  // Save the clock now and then too, so a closed tab doesn't lose time.
  useEffect(() => {
    const id = setInterval(() => {
      saveProgress(GAME_ID, code, { path, elapsedMs: timer.elapsedMs, completed: won, revealed } satisfies Progress)
    }, 5000)
    return () => clearInterval(id)
  })

  if (!puzzle) {
    return (
      <div className="play-view">
        <p className="empty-note">This puzzle link is broken.</p>
        <button type="button" className="pill-button" onClick={onBackToMenu}>
          ← Menu
        </button>
      </div>
    )
  }

  const total = openCellCount(puzzle)

  const changePath = (next: number[]) => {
    if (strokeBefore.current) {
      const before = strokeBefore.current
      strokeBefore.current = null
      setUndoStack((s) => [...s.slice(-49), before])
    }
    setPath(next)
    if (!won && isSolved(puzzle, next)) {
      timer.pause()
      setWon(true)
      if (look.haptics) vibrate([30, 60, 30, 60, 90])
      // Let the victory wave play before the modal covers the board.
      winTimer.current = window.setTimeout(() => setShowWin(true), look.winWave ? Math.min(1600, 500 + next.length * 25) : 250)
      if (!revealed) {
        setHistory(
          addModeRunRecord(GAME_ID, puzzle.size, difficulty, {
            timeMs: timer.elapsedMs,
            completedAt: new Date().toISOString(),
            code,
          }),
        )
      }
    }
  }

  const undo = () => {
    if (!undoStack.length) return
    setPath(undoStack[undoStack.length - 1])
    setUndoStack((s) => s.slice(0, -1))
  }

  const clear = () => {
    if (!path.length) return
    setUndoStack((s) => [...s.slice(-49), path])
    setPath([])
  }

  const revealSolution = () => {
    setConfirmReveal(false)
    const answer = solve(puzzle, 1, 20_000_000).solutions[0]
    if (!answer) return
    timer.pause()
    setUndoStack([])
    setRevealed(true)
    setShowingSolution(true)
    setWon(true)
    setPath(answer)
  }

  const restart = () => {
    setShowingSolution(false)
    setPath([])
    setUndoStack([])
    setWon(false)
    setShowWin(false)
    timer.reset(0)
    timer.start()
  }

  const label = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty
  const filled = path.length

  return (
    <div className="play-view">
      <header className="play-header">
        <button type="button" className="back-button" onClick={onBackToMenu}>
          ← Menu
        </button>
        <h2>
          {puzzle.size}x{puzzle.size} {label}
        </h2>
        <div className="stats">
          <button type="button" className="stats-button" onClick={() => setShowLook(true)} title="Line & effects" aria-label="Line and effects">
            🎨
          </button>
          <button type="button" className="stats-button hide-narrow" onClick={() => setShowStats(true)} title="Stats">
            📊
          </button>
          <span>⏱ {formatDuration(timer.elapsedMs)}</span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      <div className="board-wrap">
        <Board
          puzzle={puzzle}
          path={path}
          onPathChange={changePath}
          onStrokeStart={(before) => (strokeBefore.current = before)}
          disabled={won}
          solved={won}
          look={look}
        />
      </div>

      <div className="play-footer">
        <div className="progress-bar" aria-label={`${filled} of ${total} cells filled`}>
          <div className={`progress-fill${won ? ' done' : ''}`} style={{ width: `${(filled / total) * 100}%` }} />
        </div>
        <p className="play-hint">
          {showingSolution
            ? 'Solution shown · this puzzle no longer counts toward your stats'
            : won
              ? revealed
                ? 'Solved (unscored)'
                : 'Solved!'
              : path.length === 0
              ? 'Touch 1 and drag through every cell, in number order.'
                : `${filled} / ${total} cells · drag back to erase, tap the path to cut it${revealed ? ' · unscored' : ''}`}
        </p>
        <div className="play-actions">
          <button type="button" className="pill-button" onClick={undo} disabled={won || !undoStack.length}>
            ↶ Undo
          </button>
          <button type="button" className="pill-button" onClick={clear} disabled={won || !path.length}>
            ✕ Clear
          </button>
          {!won && (
            <button type="button" className="pill-button" onClick={() => setConfirmReveal(true)}>
              💡 Solution
            </button>
          )}
          {showingSolution && (
            <button type="button" className="pill-button" onClick={restart}>
              ↻ Try it
            </button>
          )}
          {won && (
            <button type="button" className="pill-button accent" onClick={() => onNewRandom(puzzle.size, difficulty)}>
              🎲 New puzzle
            </button>
          )}
        </div>
      </div>

      {showWin && (
        <WinModal
          elapsedMs={timer.elapsedMs}
          history={history}
          onPlayAgain={restart}
          onBackToMenu={onBackToMenu}
          onNewRandom={() => onNewRandom(puzzle.size, difficulty)}
          onViewStats={() => setShowStats(true)}
          onClose={() => setShowWin(false)}
          unscored={revealed}
        />
      )}

      {confirmReveal && (
        <div className="modal-backdrop" onClick={() => setConfirmReveal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Show the solution?</h2>
            <p className="modal-note">
              The answer will be drawn on the board. This puzzle won't count toward your times or best scores, even if you
              solve it again afterwards.
            </p>
            <button type="button" className="pill-button accent wide" onClick={revealSolution}>
              💡 Show solution
            </button>
            <button type="button" className="pill-button wide" onClick={() => setConfirmReveal(false)}>
              Keep playing
            </button>
          </div>
        </div>
      )}

      {showLook && <LookSettingsModal settings={look} onUpdate={updateLook} onClose={() => setShowLook(false)} />}

      {showStats && (
        <StatsModal title={`${puzzle.size}x${puzzle.size} ${label}`} history={history} onClose={() => setShowStats(false)} />
      )}
    </div>
  )
}
