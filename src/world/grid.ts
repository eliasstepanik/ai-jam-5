import type { State, TileCh } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { getSolid } from './caches.ts'

export { TILE }
export const worldToTile = (px: number): number => Math.floor(px / TILE)
export const tileToWorld = (t: number): number => t * TILE + TILE / 2
export const idx = (s: State, tx: number, ty: number): number => ty * s.world.w + tx
export const inMap = (s: State, tx: number, ty: number): boolean =>
  Number.isInteger(tx) && Number.isInteger(ty) && tx >= 0 && ty >= 0 && tx < s.world.w && ty < s.world.h

export function tileAt(s: State, tx: number, ty: number): TileCh {
  if (!inMap(s, tx, ty) || s.world.tiles.length !== s.world.w * s.world.h) return '#'
  return s.world.tiles[idx(s, tx, ty)] as TileCh
}

export function isSolidTile(s: State, tx: number, ty: number): boolean {
  return !inMap(s, tx, ty) || getSolid(s)[idx(s, tx, ty)] === 1
}

export function isSolidAt(s: State, i: number): boolean {
  return !Number.isInteger(i) || i < 0 || i >= s.world.w * s.world.h || getSolid(s)[i] === 1
}

export const isSolidPx = (s: State, x: number, y: number): boolean =>
  isSolidTile(s, worldToTile(x), worldToTile(y))
export const playerTile = (s: State): number => idx(s, worldToTile(s.player.x), worldToTile(s.player.y))

export const N4: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const N8: readonly (readonly [number, number])[] =
  [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

export function forN4(s: State, i: number, f: (j: number) => void): void {
  const x = i % s.world.w, y = Math.floor(i / s.world.w)
  if (!inMap(s, x, y)) return
  for (const [dx, dy] of N4) if (inMap(s, x + dx, y + dy)) f(idx(s, x + dx, y + dy))
}

export function forN8(s: State, i: number, f: (j: number, diag: boolean) => void): void {
  const x = i % s.world.w, y = Math.floor(i / s.world.w)
  if (!inMap(s, x, y)) return
  for (const [dx, dy] of N8) {
    if (inMap(s, x + dx, y + dy)) f(idx(s, x + dx, y + dy), dx !== 0 && dy !== 0)
  }
}
