import { useState } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { formatDuration } from '../hooks/useTimer'
import { DIFFICULTIES, type Difficulty, type GameDefinition } from '../games/types'
import { randomHash } from '../routing'
import { bestTime, loadModeHistory, loadSetting, saveSetting } from '../storage'

interface GameMenuProps {
  game: GameDefinition
  onGenerate: (size: number, difficulty: Difficulty, variant?: string) => void
  onBack: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function GameMenu({ game, onGenerate, onBack, theme, onToggleTheme }: GameMenuProps) {
  const variants = game.variants
  const [variantId, setVariantId] = useState(() => {
    const saved = loadSetting(game.id, 'variant')
    return variants?.find((v) => v.id === saved)?.id ?? variants?.[0].id
  })
  const variant = variants?.find((v) => v.id === variantId)
  const pickVariant = (id: string) => {
    setVariantId(id)
    saveSetting(game.id, 'variant', id)
  }

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
        {variants && (
          <div className="variant-picker">
            <div className="variant-options" role="radiogroup" aria-label="Variant">
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={v.id === variantId}
                  className={`variant-option${v.id === variantId ? ' selected' : ''}`}
                  onClick={() => pickVariant(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {variant && <p className="variant-blurb">{variant.blurb}</p>}
          </div>
        )}
        <div className="generate-table">
          {game.sizes.map((size) => (
            <div className="generate-row" key={size}>
              <span className="generate-size">
                {size}x{size}
              </span>
              <div className="generate-row-buttons">
                {DIFFICULTIES.map((d) => {
                  const best = bestTime(loadModeHistory(game.id, size, d.id, variantId))
                  return (
                    <a
                      key={d.id}
                      className="difficulty-button"
                      href={randomHash(game.id, size, d.id, variantId)}
                      data-difficulty={d.id}
                      title={game.difficultyBlurbs?.[d.id] ?? d.blurb}
                      onClick={(e) => {
                        e.preventDefault()
                        onGenerate(size, d.id, variantId)
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
              <dd>{game.difficultyBlurbs?.[d.id] ?? d.blurb}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
