import type { ComponentType } from 'react'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface DifficultyInfo {
  id: Difficulty
  label: string
  blurb: string
}

export const DIFFICULTIES: DifficultyInfo[] = [
  { id: 'easy', label: 'Easy', blurb: 'Numbers close together, few obstacles.' },
  { id: 'medium', label: 'Medium', blurb: 'Blocked cells, walls and a few detours.' },
  {
    id: 'hard',
    label: 'Hard',
    blurb: 'Long detours and U-turns: the obvious route between two numbers is often a trap.',
  },
]

export function isDifficulty(value: string): value is Difficulty {
  return DIFFICULTIES.some((d) => d.id === value)
}

export interface GamePlayProps {
  /** Encoded puzzle, as found in the URL. */
  code: string
  difficulty: Difficulty
  /** Variant id from the URL, for games that have variants (may be missing on old links). */
  variant?: string
  onBackToMenu: () => void
  onNewRandom: (size: number, difficulty: Difficulty, variant?: string) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

/** A rule set a game offers alongside difficulty, picked in its menu. */
export interface VariantOption {
  id: string
  label: string
  blurb: string
}

/** Everything the shell needs to list, generate and play one grid game. */
export interface GameDefinition {
  id: string
  title: string
  tagline: string
  rules: string[]
  sizes: number[]
  /** Optional variants; the first is the default. */
  variants?: VariantOption[]
  /** Per-game wording for the difficulty legend, overriding the shared blurbs. */
  difficultyBlurbs?: Partial<Record<Difficulty, string>>
  /** Build a fresh random puzzle and return its URL-safe code. */
  generate: (size: number, difficulty: Difficulty, variant?: string) => string
  /** Size of the puzzle a code describes, or null if the code is invalid. */
  sizeOf: (code: string) => number | null
  Play: ComponentType<GamePlayProps>
}
