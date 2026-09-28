import { ThemeToggle } from './ThemeToggle'
import { formatDuration } from '../hooks/useTimer'
import { DIFFICULTIES, type Difficulty, type GameDefinition } from '../games/types'
import { randomHash } from '../routing'
import { bestTime, loadModeHistory } from '../storage'

interface GameMenuProps {
  game: GameDefinition
  onGenerate: (size: number, difficulty: Difficulty) => void
  onBack: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function GameMenu({ game, onGenerate, onBack, theme, onToggleTheme }: GameMenuProps) {
  return (
    <div className="menu">
      <div className="menu-header">
        <button type="button" className="back-button menu-back" onClick={onBack}>
          ← Games
        </button>
        <div className="header-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <h1>{game.title}</h1>
        <p>{game.tagline}</p>
      </div>

      <section className="rules">
        <h2>How to play</h2>
        <ol>
          {game.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </section>

      <section className="generate">
        <h2>New puzzle</h2>
        <div className="generate-table">
          {game.sizes.map((size) => (
            <div className="generate-row" key={size}>
              <span className="generate-size">
                {size}x{size}
              </span>
              <div className="generate-row-buttons">
                {DIFFICULTIES.map((d) => {
                  const best = bestTime(loadModeHistory(game.id, size, d.id))
                  return (
                    <a
                      key={d.id}
                      className="difficulty-button"
                      href={randomHash(game.id, size, d.id)}
                      data-difficulty={d.id}
                      title={d.blurb}
                      onClick={(e) => {
                        e.preventDefault()
                        onGenerate(size, d.id)
                      }}
                    >
                      {d.label}
                      {best !== undefined && <span className="difficulty-best">{formatDuration(best)}</span>}
                    </a>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <dl className="difficulty-legend">
          {DIFFICULTIES.map((d) => (
            <div key={d.id} className="difficulty-legend-item">
              <dt data-difficulty={d.id}>{d.label}</dt>
              <dd>{d.blurb}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
