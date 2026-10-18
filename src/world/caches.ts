import type { State } from '../core/types.ts'

// A18 brings forward the complete solid cache from A22 (WQ2 §1).
// Other cache getters remain A22/B6 work, without placeholder exports here.
let solidE: { key: string; v: Uint8Array } | null = null

export function getSolid(s: State): Uint8Array {
  const w = s.world
  const key = s.meta.runId + ':' + w.tilesHash + ':' + w.w + 'x' + w.h + ':' + w.solidSig
  if (solidE?.key === key) return solidE.v
  const n = w.w * w.h, g = new Uint8Array(n)
  if (w.tiles.length !== n) g.fill(1)
  else for (let i = 0; i < n; i++) g[i] = w.tiles.charCodeAt(i) === 35 ? 1 : 0
  for (const r of s.rocks) if (r.landed) for (const i of r.tiles) g[i] = 1
  solidE = { key, v: g }
  return g
}

// Tests may clear derived data; normal writers invalidate through solidSig.
export function clearCaches(): void {
  solidE = null
}
