// Bounded world-space fire history shared by the copper/strontium route guides. No gameplay RNG/State writes.
import { hash2 } from './noise.ts'
export type GuidePixel = { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number }
export type GuidePoint = { tile: number; x: number; y: number }
export type CopperHints = { version: 2; runId: number; material: string; at: number; next: Map<number, number>; pixels: GuidePixel[] }
export function createCopperHints(): CopperHints {
  return { version: 2, runId: -1, material: '', at: 0, next: new Map(), pixels: [] }
}
export function sampleCopperFire(p: CopperHints, runId: number, time: number, on: boolean, material: string,
  seed: number, points: readonly GuidePoint[], quality: number): void {
  if (p.runId !== runId || time < p.at || p.material !== material) Object.assign(p, createCopperHints(), { runId, material })
  p.at = time
  if (!on) { p.pixels = []; p.next.clear(); return }
  p.pixels = p.pixels.filter(q => time < q.born + q.life)
  const tiles = new Set(points.map(q => q.tile)), interval = .65 / Math.max(.25, quality)
  for (const tile of p.next.keys()) if (!tiles.has(tile)) p.next.delete(tile)
  for (const q of points) {
    const phase = hash2(q.tile, 61, seed) * interval
    const next = p.next.get(q.tile) ?? Math.ceil((time - phase) / interval) * interval + phase
    if (time < next) { p.next.set(q.tile, next); continue }
    const cycle = Math.floor(time / interval), h = (salt: number): number => hash2(q.tile, cycle, seed ^ salt)
    // One fresh particle per emitter after a render gap; never catch up old fire in a pile.
    if (p.pixels.length < 128) p.pixels.push({ x: q.x + (h(62) - .5) * 24, y: q.y + (h(63) - .5) * 10,
      vx: (h(64) - .5) * 6, vy: -10 - h(65) * 8, born: time, life: .6 + h(66) * .5, size: h(67) < .6 ? 2 : 3 })
    p.next.set(q.tile, time + interval)
  }
}
