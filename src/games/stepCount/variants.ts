import type { Difficulty } from '../types'

export type Variant = 'classic' | 'straight' | 'untangled' | 'free'

export interface MoveRules {
  diagonals: boolean
  crossings: boolean
}

export interface VariantInfo {
  id: Variant
  label: string
  blurb: string
  moves: Record<Difficulty, MoveRules>
}

const ORTHOGONAL: MoveRules = { diagonals: false, crossings: false }
const UNTANGLED: MoveRules = { diagonals: true, crossings: false }
const FREE: MoveRules = { diagonals: true, crossings: true }

export const VARIANTS: VariantInfo[] = [
  {
    id: 'classic',
    label: 'Classic',
    blurb: 'Easy moves straight only, Medium adds diagonals, Hard lets diagonals cross.',
    moves: { easy: ORTHOGONAL, medium: UNTANGLED, hard: FREE },
  },
  {
    id: 'straight',
    label: 'Straight',
    blurb: 'Up, down, left and right only, at every difficulty.',
    moves: { easy: ORTHOGONAL, medium: ORTHOGONAL, hard: ORTHOGONAL },
  },
  {
    id: 'untangled',
    label: 'Untangled',
    blurb: 'Diagonals allowed, but the line may never cross itself.',
    moves: { easy: UNTANGLED, medium: UNTANGLED, hard: UNTANGLED },
  },
  {
    id: 'free',
    label: 'Free',
    blurb: 'Diagonals allowed, and diagonal moves may cross in an X.',
    moves: { easy: FREE, medium: FREE, hard: FREE },
  },
]

export const DEFAULT_VARIANT: Variant = 'classic'

export function findVariant(id: string | undefined): VariantInfo {
  return VARIANTS.find((v) => v.id === id) ?? VARIANTS[0]
}
