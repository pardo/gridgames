import { useEffect, useState } from 'react'
import { CssBlobBackground } from './components/CssBlobBackground'
import { GameMenu } from './components/GameMenu'
import { HomeMenu } from './components/HomeMenu'
import { findGame } from './games/registry'
import { DIFFICULTIES, type Difficulty } from './games/types'
import { gameHash, homeHash, parseHash, playHash, type Route } from './routing'
import { useTheme } from './hooks/useTheme'
import './App.css'

/** A generation the UI has promised but not run yet, so a spinner can show. */
interface PendingGeneration {
  gameId: string
  size: number
  difficulty: Difficulty
  variant?: string
  /** 'replace' keeps a deep link tidy; 'push' adds a history entry. */
  history: 'replace' | 'push'
}

function GeneratingOverlay({ pending }: { pending: PendingGeneration }) {
  const label = DIFFICULTIES.find((d) => d.id === pending.difficulty)?.label ?? pending.difficulty
  return (
    <div className="generating-overlay" role="status" aria-live="polite">
      <div className="generating-card">
        <div className="generating-spinner" aria-hidden="true" />
        <p className="generating-title">
          Building a {pending.size}x{pending.size} {label} puzzle
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [pending, setPending] = useState<PendingGeneration | null>(null)
  const { theme, toggle: toggleTheme } = useTheme()

  useEffect(() => {
    const apply = () => {
      const next = parseHash(window.location.hash)
      if (next.type === 'random') {
        // Generate fresh, then swap the URL for a stable link to this exact
        // puzzle so a reload (or iOS reviving a background tab) resumes it.
        const { gameId, size, difficulty, variant } = next
        setPending({ gameId, size, difficulty, variant, history: 'replace' })
      } else {
        setRoute(next)
      }
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  // Yield long enough to paint the spinner before blocking the main thread.
  // A timer rather than requestAnimationFrame, which never fires in a hidden tab.
  useEffect(() => {
    if (!pending) return
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      const game = findGame(pending.gameId)
      if (game) {
        try {
          const { size, difficulty, variant } = pending
          const code = game.generate(size, difficulty, variant)
          const hash = playHash(game.id, difficulty, code, variant)
          if (pending.history === 'replace') history.replaceState(null, '', hash)
          else history.pushState(null, '', hash)
          setRoute({ type: 'play', gameId: game.id, difficulty, code, variant })
        } catch (err) {
          console.error(err)
          setRoute({ type: 'game', gameId: game.id })
        }
      } else {
        setRoute({ type: 'home' })
      }
      setPending(null)
    }, 50)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pending])

  const navigate = (hash: string) => {
    window.location.hash = hash
  }

  const game = route.type === 'home' ? undefined : findGame(route.gameId)
  const generate = (size: number, difficulty: Difficulty, variant?: string) => {
    if (game) setPending({ gameId: game.id, size, difficulty, variant, history: 'push' })
  }

  let view
  if (!game) {
    view = <HomeMenu onOpenGame={(id) => navigate(gameHash(id))} theme={theme} onToggleTheme={toggleTheme} />
  } else if (route.type === 'play') {
    view = (
      <game.Play
        key={route.code}
        code={route.code}
        difficulty={route.difficulty}
        variant={route.variant}
        onBackToMenu={() => navigate(gameHash(game.id))}
        onNewRandom={generate}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    )
  } else {
    view = (
      <GameMenu
        game={game}
        onGenerate={generate}
        onBack={() => navigate(homeHash())}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    )
  }

  return (
    <>
      <CssBlobBackground />
      {pending && <GeneratingOverlay pending={pending} />}
      {view}
    </>
  )
}
