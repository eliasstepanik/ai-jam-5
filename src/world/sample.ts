import type { State } from '../core/types.ts'
import { rand } from '../core/rng.ts'
import type { StreamName } from '../core/rng.ts'
import { forN4, idx, inMap, isSolidAt, worldToTile } from './grid.ts'
import { circleHitsSolid } from './collide.ts'
import { exitDistAt, pathDistAt } from './caches.ts'

export function nearestFloor(s: State, i: number, maxSteps = 8): number {
  const w = s.world.w, x = i % w, y = Math.floor(i / w)
  if (!Number.isInteger(i) || !inMap(s, x, y) || !Number.isFinite(maxSteps) || maxSteps < 0) return -1
  const steps = Math.floor(maxSteps)
  const x0 = Math.max(0, x - steps), y0 = Math.max(0, y - steps)
  const width = Math.min(w - 1, x + steps) - x0 + 1
  const height = Math.min(s.world.h - 1, y + steps) - y0 + 1
  const q = new Int32Array(width * height), seen = new Uint8Array(q.length)
  const local = (j: number) => (Math.floor(j / w) - y0) * width + j % w - x0
  let head = 0, tail = 1
  q[0] = i
  seen[local(i)] = 1
  for (let depth = 0; depth <= steps && head < tail; depth++) {
    const end = tail
    while (head < end) {
      const j = q[head++]
      if (!isSolidAt(s, j)) return j
      if (depth === steps) continue
      // Recovery searches through walls too; FIFO preserves E S W N ties.
      forN4(s, j, k => {
        const p = local(k)
        if (!seen[p]) { seen[p] = 1; q[tail++] = k }
      })
    }
  }
  return -1
}

export type SpawnOpts = { minPx: number; maxPx: number; r: number; tries: number; outside: number }

export function sampleSpawn(s: State, stream: StreamName, x: number, y: number, o: SpawnOpts): { x: number; y: number } | null {
  let result: { x: number; y: number } | null = null
  for (let k = 0; k < o.tries; k++) {
    const a = rand(s, stream) * 2 * Math.PI, d = o.minPx + rand(s, stream) * (o.maxPx - o.minPx)
    if (result) continue // Keep exactly two draws per try, including after success.
    const px = x + d * Math.cos(a), py = y + d * Math.sin(a)
    const tx = worldToTile(px), ty = worldToTile(py)
    if (!inMap(s, tx, ty) || circleHitsSolid(s, px, py, o.r)) continue
    if (o.outside > 0 && Math.hypot(px - x, py - y) < o.outside + o.r) continue
    const i = idx(s, tx, ty)
    if ((s.meta.phase === 'escape' ? exitDistAt(s, i) : pathDistAt(s, i)) < 0) continue
    result = { x: px, y: py }
  }
  return result
}
