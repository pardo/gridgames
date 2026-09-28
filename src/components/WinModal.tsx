import { formatDuration } from '../hooks/useTimer'
import { bestTime, type RunRecord } from '../storage'

interface WinModalProps {
  elapsedMs: number
  /** Runs for this mode, most recent (this one) first. */
  history: RunRecord[]
  onPlayAgain: () => void
  onBackToMenu: () => void
  onNewRandom: () => void
  onViewStats: () => void
  onClose: () => void
  /** The solution was revealed on this puzzle, so the run isn't recorded. */
  unscored?: boolean
}

export function WinModal({ elapsedMs, history, onPlayAgain, onBackToMenu, onNewRandom, onViewStats, onClose, unscored = false }: WinModalProps) {
  const best = bestTime(history)
  const isNewBest = !unscored && (best === undefined || elapsedMs <= best)
  // A scored win is history[0]; an unscored one isn't in the list at all.
  const previousRuns = history.slice(unscored ? 0 : 1, unscored ? 5 : 6)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal win-modal" onClick={(e) => e.stopPropagation()}>
        <h2>🎉 Solved!</h2>
        <p className="win-stat">Time: {formatDuration(elapsedMs)}</p>
        {unscored && <p className="modal-note">Unscored: the solution was shown for this puzzle.</p>}
        {isNewBest && history.length > 1 && <p className="win-best">New best time!</p>}

        {previousRuns.length > 0 && (
          <div className="run-history">
            <h3>Previous runs</h3>
            <ul>
              {previousRuns.map((run, i) => (
                <li key={i}>
                  <span>{formatDuration(run.timeMs)}</span>
                  <span className="run-history-date">{new Date(run.completedAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
            {history.length > 1 && (
              <button type="button" className="link-button" onClick={onViewStats}>
                View all {history.length} runs →
              </button>
            )}
          </div>
        )}

        <button type="button" className="pill-button accent wide" onClick={onNewRandom}>
          🎲 New puzzle
        </button>
        <div className="modal-actions">
          <button type="button" className="pill-button" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="pill-button" onClick={onBackToMenu}>
            Menu
          </button>
        </div>
      </div>
    </div>
  )
}
