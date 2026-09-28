import { formatDuration } from '../hooks/useTimer'
import { bestTime, type RunRecord } from '../storage'

interface StatsModalProps {
  title: string
  history: RunRecord[]
  onClose: () => void
}

export function StatsModal({ title, history, onClose }: StatsModalProps) {
  const best = bestTime(history)
  const average = history.length ? history.reduce((s, r) => s + r.timeMs, 0) / history.length : undefined

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal stats-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {history.length === 0 ? (
          <p className="empty-note">No solves yet. Finish one to start tracking times.</p>
        ) : (
          <>
            <div className="stat-tiles">
              <div className="stat-tile">
                <span className="stat-value">{history.length}</span>
                <span className="stat-label">Solved</span>
              </div>
              <div className="stat-tile">
                <span className="stat-value">{formatDuration(best!)}</span>
                <span className="stat-label">Best</span>
              </div>
              <div className="stat-tile">
                <span className="stat-value">{formatDuration(average!)}</span>
                <span className="stat-label">Average</span>
              </div>
            </div>
            <ul className="run-list">
              {history.map((run, i) => (
                <li key={i} className={run.timeMs === best ? 'best' : undefined}>
                  <span>{formatDuration(run.timeMs)}</span>
                  <span className="run-history-date">{new Date(run.completedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <button type="button" className="pill-button wide" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
