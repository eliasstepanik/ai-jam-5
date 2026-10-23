// L4 render: pure, DOM-free numbers and cache keys. Formats: docs/architecture-rulings-2.md R-089 (C7-C9),
// architecture-resources.md §2-3.1, architecture-render-2.md §2.1-2.2 and §5.4, architecture-render-3.md §1 and §4.
// Browser-verified only: checks cover src/core/view.ts, not this file (R-043).
import type { FlameKind } from '../core/types.ts'
import { MAP_W } from '../core/state.ts'

// Zoom lives in src/core/view.ts (R-018, R-131); re-exported so the other render modules have one import point.
export { VIEW_H_DEV, deviceZoom } from '../core/view.ts'

// Bump when a light mask stop table changes: it is part of the mask key, so stale sprites are ignored (resources §3.1).
export const LIGHT_VERSION = 1
// Bump when tile painting changes so HMR discards previously painted chunk canvases.
const TILE_VERSION = 2

export type MaskKind = FlameKind | 'beacon' | 'shaft' | 'ember'

// Sprite diameters in px (render-2 §5.4, render-3 §1) and the vignette size step (render-3 §4).
export const MASK_BUCKETS: readonly number[] = [64, 128, 256, 512]
export const GLOW_BUCKETS: readonly number[] = [32, 64, 128, 256]
export const VIG_STEP = 256

// Chunk grid: 8x8 tiles per chunk, CHUNKS_W = ceil(w / 8) from the one map width constant (scale-and-economy-4 §1.3).
export const CHUNK_TILES = 8
export const CHUNKS_W = Math.ceil(MAP_W / CHUNK_TILES)

// Smallest bucket >= d; above the largest bucket the largest is returned (the sprite is scaled up). `buckets`: ascending, non-empty.
export function bucketOf(d: number, buckets: readonly number[]): number {
  for (const b of buckets) if (b >= d) return b
  return buckets[buckets.length - 1]
}

export const maskKey = (kind: MaskKind, b: number): string => 'm:' + LIGHT_VERSION + ':' + kind + ':' + b
export const glowKey = (hex: string, b: number): string => 'g:' + hex + ':' + b
// w and h are already bucketed by the caller (multiples of VIG_STEP): the canvas is created at exactly that size.
export const vigKey = (hex: string, w: number, h: number): string => 'v:' + hex + ':' + w + 'x' + h
// veinGen: the baked south-facing ore lives in the walls chunks, so mining a vein must change the key (B1a). ponytail: two runs with equal
// tiles AND equal veinGen but different veins would share chunks; the seed is not in the key (see tileCache in tiles.ts).
export const tileKey = (tilesHash: number, gen: number, veinGen = 0): string => tilesHash + ':' + gen + ':' + veinGen + ':' + TILE_VERSION
export const chunkKey = (cx: number, cy: number): number => cx + cy * CHUNKS_W

// h = 16-way floor hash, floor(hash2(tx, ty, seed) * 16) in 0..15. 0-9 -> 0, 10-12 -> 1, 13-14 -> 2, 15 -> 3 (render-2 §2.1).
export const variantOf = (h: number): number => (h < 10 ? 0 : h < 13 ? 1 : h < 15 ? 2 : 3)
