import { ThemeToggle } from './ThemeToggle'
import { GAMES } from '../games/registry'
import { gameHash } from '../routing'

interface HomeMenuProps {
  onOpenGame: (gameId: string) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export function HomeMenu({ onOpenGame, theme, onToggleTheme }: HomeMenuProps) {
  return (
    <div className="menu">
      <div className="menu-header">
        <div className="header-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <h1>Grid Games</h1>
        <p>Pick a game</p>
      </div>

      <div className="game-list">
        {GAMES.map((game) => (
          <a
            key={game.id}
            href={gameHash(game.id)}
            className="game-card"
            onClick={(e) => {
              e.preventDefault()
              onOpenGame(game.id)
            }}
          >
            <span className="game-card-title">{game.title}</span>
            <span className="game-card-tagline">{game.tagline}</span>
            <span className="game-card-arrow">→</span>
          </a>
        ))}
      </div>
    </div>
  )
}
