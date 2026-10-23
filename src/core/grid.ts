// L0 core: pure 2.5D grid helpers (fixed-south 3/4 view). DOM-free, no module state.
// Spec: docs/architecture-modules-render.md (src/core/grid.ts row), R-179 (floor variant), R-180 (foot row), R-184 (direction index).
import { hash2 } from './noise.ts'

// Eight authored views, in the character atlas `direction_order` (north to northwest).
// Structural twin of `Direction` in src/assets/sprites.ts (L1, not importable here).
export type Dir8 = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

const DIR_INDEX: Readonly<Record<Dir8, number>> = { n: 0, ne: 1, e: 2, se: 3, s: 4, sw: 5, w: 6, nw: 7 }

// Floor pattern variant 0..9 of the 24 px cell (fx, fy) (R-179). Stateless, so it is never stored.
export const floorVariant = (fx: number, fy: number, seed: number): number => Math.floor(hash2(fx, fy, seed) * 10)

// Wall face frame kind from the open (floor) W and E neighbours of the wall cell: both open -> pillar,
// only W -> left, only E -> right, none -> fill. `mask` (N1 E2 S4 W8) is part of the contract; the caller
// draws a face only when bit S is set, so the kind itself depends on the side bits alone.
export function faceKind(_mask: number, wNeighbourFloor: boolean, eNeighbourFloor: boolean): 'fill' | 'left' | 'right' | 'pillar' {
  if (wNeighbourFloor && eNeighbourFloor) return 'pillar'
  if (wNeighbourFloor) return 'left'
  if (eNeighbourFloor) return 'right'
  return 'fill'
}

// Tile row (32 px) of a pixel foot y (R-180): footRow(63.9) === 1.
export const footRow = (y: number): number => Math.floor(y / 32)

// Index of a direction in the atlas `direction_order`: 'n' -> 0 ... 'nw' -> 7.
export const dirIndex = (d: Dir8): number => DIR_INDEX[d]
