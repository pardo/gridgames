import { useEffect, useMemo, useRef, useState } from 'react'
import { StatsModal } from '../../components/StatsModal'
import { ThemeToggle } from '../../components/ThemeToggle'
import { WinModal } from '../../components/WinModal'
import { useLineSettings, vibrate } from '../../hooks/useLineSettings'
import { formatDuration, useTimer } from '../../hooks/useTimer'
import { addModeRunRecord, loadModeHistory, loadProgress, saveProgress, type RunRecord } from '../../storage'
import { DIFFICULTIES, type GamePlayProps } from '../types'
import { decodePuzzle } from './encode'
import { EffectsModal } from './EffectsModal'
import { HeyawakeBoard } from './HeyawakeBoard'
import { analyze, DOT, EMPTY, SHADED, type Mark } from './puzzle'
import { solveAll, solveLogic } from './solver'

export const GAME_ID = 'heyawake'

interface Progress {
  marks: Mark[]
  elapsedMs: number
  completed: boolean
  /** The solution was shown: this puzzle no longer counts toward stats. */
  revealed?: boolean
}

export function HeyawakePlay({ code, difficulty, onBackToMenu, onNewRandom, theme, onToggleTheme }: GamePlayProps) {
  const puzzle = useMemo(() => decodePuzzle(code), [code])
  const cellCount = (puzzle?.size ?? 0) ** 2
  const saved = useMemo(() => {
    const p = loadProgress<Progress>(GAME_ID, code)
    return p && p.marks?.length === cellCount ? p : null
  }, [code, cellCount])
  const [marks, setMarks] = useState<Mark[]>(() => saved?.marks ?? new Array<Mark>(cellCount).fill(EMPTY))
  const [won, setWon] = useState(saved?.completed ?? false)
  const [revealed, setRevealed] = useState(saved?.revealed ?? false)
  /** True while the board is showing the revealed answer (not a solve by the player). */
  const [showingSolution, setShowingSolution] = useState(false)
  const [confirmReveal, setConfirmReveal] = useState(false)
  const [undoStack, setUndoStack] = useState<Mark[][]>([])
  const [showStats, setShowStats] = useState(false)
  const [showWin, setShowWin] = useState(false)
  const [showLook, setShowLook] = useState(false)
  const { settings: look, update: updateLook } = useLineSettings()
  const winTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => clearTimeout(winTimer.current), [])
  const strokeBefore = useRef<Mark[] | null>(null)
  const timer = useTimer(saved?.elapsedMs ?? 0)
  const size = puzzle?.size ?? 0
  const [history, setHistory] = useState<RunRecord[]>(() => loadModeHistory(GAME_ID, size, difficulty))
  const analysis = useMemo(() => (puzzle ? analyze(puzzle, marks) : null), [puzzle, marks])

  useEffect(() => {
    if (!won) timer.start()
    return () => timer.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  useEffect(() => {
    saveProgress(GAME_ID, code, { marks, elapsedMs: timer.elapsedMs, completed: won, revealed } satisfies Progress)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, won, revealed])

  // Save the clock now and then too, so a closed tab doesn't lose time.
  useEffect(() => {
    const id = setInterval(() => {
      saveProgress(GAME_ID, code, { marks, elapsedMs: timer.elapsedMs, completed: won, revealed } satisfies Progress)
    }, 5000)
    return () => clearInterval(id)
  })

  if (!puzzle || !analysis) {
    return (
      <div className="play-view">
        <p className="empty-note">This puzzle link is broken.</p>
        <button type="button" className="pill-button" onClick={onBackToMenu}>
          ← Menu
        </button>
      </div>
    )
  }

  const changeMarks = (next: Mark[]) => {
    if (strokeBefore.current) {
      const before = strokeBefore.current
      strokeBefore.current = null
      setUndoStack((s) => [...s.slice(-49), before])
    }
    setMarks(next)
    if (!won && analyze(puzzle, next).solved) {
      timer.pause()
      setWon(true)
      if (look.haptics) vibrate([30, 60, 30, 60, 90])
      // Let the victory wave cross the board before the modal covers it.
      winTimer.current = window.setTimeout(() => setShowWin(true), look.winWave ? 500 + puzzle.size * 2 * 45 : 250)
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
    setMarks(undoStack[undoStack.length - 1])
    setUndoStack((s) => s.slice(0, -1))
  }

  const clear = () => {
    if (!marks.some((m) => m !== EMPTY)) return
    setUndoStack((s) => [...s.slice(-49), marks])
    setMarks(new Array<Mark>(cellCount).fill(EMPTY))
  }

  const revealSolution = () => {
    setConfirmReveal(false)
    const logic = solveLogic(puzzle, 3)
    const answer = logic.solved ? logic.shaded : solveAll(puzzle, 1, 2_000_000).solutions[0]
    if (!answer) return
    timer.pause()
    setUndoStack([])
    setRevealed(true)
    setShowingSolution(true)
    setWon(true)
    setMarks(answer.map((s) => (s ? SHADED : DOT)))
  }

  const restart = () => {
    setShowingSolution(false)
    setMarks(new Array<Mark>(cellCount).fill(EMPTY))
    setUndoStack([])
    setWon(false)
    setShowWin(false)
    timer.reset(0)
    timer.start()
  }

  const label = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty
  const decided = marks.filter((m) => m !== EMPTY).length
  const shadedCount = marks.filter((m) => m === SHADED).length
  const numbered = puzzle.rooms.filter((r) => r.clue !== null).length
  const mistakes =
    analysis.adjacent.size + analysis.badRooms.size + analysis.badRuns.length + analysis.cutOff.size > 0

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
          <button type="button" className="stats-button" onClick={() => setShowLook(true)} title="Effects" aria-label="Effects">
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
        <HeyawakeBoard
          puzzle={puzzle}
          marks={marks}
          analysis={analysis}
          onMarksChange={changeMarks}
          onStrokeStart={(before) => (strokeBefore.current = before)}
          disabled={won}
          solved={won}
          look={look}
        />
      </div>

      <div className="play-footer">
        <div className="progress-bar" aria-label={`${decided} of ${cellCount} cells marked`}>
          <div className={`progress-fill${won ? ' done' : ''}`} style={{ width: `${won ? 100 : (decided / cellCount) * 100}%` }} />
        </div>
        <p className="play-hint">
          {showingSolution
            ? 'Solution shown · this puzzle no longer counts toward your stats'
            : won
              ? revealed
                ? 'Solved (unscored)'
                : 'Solved!'
              : decided === 0
                ? 'Tap to shade, again to mark it open, again to clear. Drag to paint.'
                : mistakes
                  ? 'Something in red breaks a rule'
                  : `${shadedCount} shaded · ${analysis.okRooms.size} / ${numbered} numbered rooms done${revealed ? ' · unscored' : ''}`}
        </p>
        <div className="play-actions">
          <button type="button" className="pill-button" onClick={undo} disabled={won || !undoStack.length}>
            ↶ Undo
          </button>
          <button type="button" className="pill-button" onClick={clear} disabled={won || decided === 0}>
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

      {showLook && <EffectsModal settings={look} onUpdate={updateLook} onClose={() => setShowLook(false)} />}

      {showStats && (
        <StatsModal title={`${puzzle.size}x${puzzle.size} ${label}`} history={history} onClose={() => setShowStats(false)} />
      )}
    </div>
  )
}
