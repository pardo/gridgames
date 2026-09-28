import { useEffect, useMemo, useRef, useState } from 'react'
import { StatsModal } from '../../../components/StatsModal'
import { ThemeToggle } from '../../../components/ThemeToggle'
import { WinModal } from '../../../components/WinModal'
import { useLineSettings, vibrate } from '../../../hooks/useLineSettings'
import { formatDuration, useTimer } from '../../../hooks/useTimer'
import { addModeRunRecord, loadModeHistory, loadProgress, saveProgress, type RunRecord } from '../../../storage'
import { DIFFICULTIES, type GamePlayProps, type VariantOption } from '../../types'
import { Board, type BoardMark } from './Board'
import { LookSettingsModal } from './LookSettingsModal'
import type { PathRules } from './rules'

/** The grid every path puzzle is drawn on. */
export interface PathPuzzleGrid {
  size: number
  blocked: boolean[]
  wallRight: boolean[]
  wallDown: boolean[]
}

/** What a draw-one-line game plugs into the shared play screen. */
export interface PathGame<P extends PathPuzzleGrid> {
  id: string
  decode: (code: string) => P | null
  rules: (puzzle: P) => PathRules
  /** Numbers to draw, and how each one stands against the line so far. */
  marks: (puzzle: P, path: number[], solved: boolean) => BoardMark[]
  /** Where the "head here next" ring goes, if anywhere. */
  ringCell: (puzzle: P, path: number[]) => number | undefined
  /** Does landing on `cell` as step `index` (0-based) hit a number? */
  isMilestone: (puzzle: P, cell: number, index: number) => boolean
  isSolved: (puzzle: P, path: number[]) => boolean
  /** The answer, for the Solution button. */
  solution: (puzzle: P) => number[] | undefined
  /** Hint under the board before the line is started. */
  startHint: string
  /** Show the current step number on the head of the line. */
  stepOnHead?: boolean
  /** The game's variants, so the header and stats can name the one being played. */
  variants?: VariantOption[]
}

interface Progress {
  path: number[]
  elapsedMs: number
  completed: boolean
  /** The solution was shown: this puzzle no longer counts toward stats. */
  revealed?: boolean
}

export function PathGamePlay<P extends PathPuzzleGrid>({
  game,
  code,
  difficulty,
  variant: variantParam,
  onBackToMenu,
  onNewRandom,
  theme,
  onToggleTheme,
}: GamePlayProps & { game: PathGame<P> }) {
  const gameId = game.id
  // Old links may lack the variant: count those toward the default one.
  const variant = game.variants?.find((v) => v.id === variantParam) ?? game.variants?.[0]
  const puzzle = useMemo(() => game.decode(code), [game, code])
  const rules = useMemo(() => puzzle && game.rules(puzzle), [game, puzzle])
  const saved = useMemo(() => loadProgress<Progress>(gameId, code), [gameId, code])
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
  const [history, setHistory] = useState<RunRecord[]>(() => loadModeHistory(gameId, size, difficulty, variant?.id))

  useEffect(() => {
    if (!won) timer.start()
    return () => timer.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  useEffect(() => {
    saveProgress(gameId, code, { path, elapsedMs: timer.elapsedMs, completed: won, revealed } satisfies Progress)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, won, revealed])

  // Save the clock now and then too, so a closed tab doesn't lose time.
  useEffect(() => {
    const id = setInterval(() => {
      saveProgress(gameId, code, { path, elapsedMs: timer.elapsedMs, completed: won, revealed } satisfies Progress)
    }, 5000)
    return () => clearInterval(id)
  })

  if (!puzzle || !rules) {
    return (
      <div className="play-view">
        <p className="empty-note">This puzzle link is broken.</p>
        <button type="button" className="pill-button" onClick={onBackToMenu}>
          ← Menu
        </button>
      </div>
    )
  }

  const total = puzzle.blocked.reduce((sum, b) => sum + (b ? 0 : 1), 0)
  const marks = game.marks(puzzle, path, won)
  const ringCell = won ? undefined : game.ringCell(puzzle, path)
  const newRandom = () => onNewRandom(puzzle.size, difficulty, variant?.id)

  const changePath = (next: number[]) => {
    if (strokeBefore.current) {
      const before = strokeBefore.current
      strokeBefore.current = null
      setUndoStack((s) => [...s.slice(-49), before])
    }
    setPath(next)
    if (!won && game.isSolved(puzzle, next)) {
      timer.pause()
      setWon(true)
      if (look.haptics) vibrate([30, 60, 30, 60, 90])
      // Let the victory wave play before the modal covers the board.
      winTimer.current = window.setTimeout(() => setShowWin(true), look.winWave ? Math.min(1600, 500 + next.length * 25) : 250)
      if (!revealed) {
        setHistory(
          addModeRunRecord(
            gameId,
            puzzle.size,
            difficulty,
            { timeMs: timer.elapsedMs, completedAt: new Date().toISOString(), code },
            variant?.id,
          ),
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
    const answer = game.solution(puzzle)
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

  const difficultyLabel = DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty
  const label = variant ? `${difficultyLabel} · ${variant.label}` : difficultyLabel
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
          rules={rules}
          blocked={puzzle.blocked}
          wallRight={puzzle.wallRight}
          wallDown={puzzle.wallDown}
          marks={marks}
          ringCell={ringCell}
          isMilestone={(cell, index) => game.isMilestone(puzzle, cell, index)}
          headLabel={game.stepOnHead ? String(path.length) : undefined}
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
              ? game.startHint
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
            <button type="button" className="pill-button accent" onClick={newRandom}>
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
          onNewRandom={newRandom}
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
