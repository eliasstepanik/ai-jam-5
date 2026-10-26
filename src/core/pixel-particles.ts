// Cosmetic, bounded particle history. Never reads or writes gameplay state/RNG.
import { hash2 } from './noise.ts'
export const PIXEL_CAP = 256
export type PixelSource = 0 | 1 | 2 // torch, guide wisp, Beacon
export type PixelPool = {
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array
  born: Float64Array; life: Float32Array; size: Uint8Array; source: Uint8Array; material: Uint8Array
  px: Float64Array; py: Float64Array; at: Float64Array; next: Float64Array; active: Uint8Array; sequence: Uint32Array
  head: number; runId: number; clock: number; simAt: number
}
export function createPixelPool(): PixelPool {
  const f = () => new Float32Array(PIXEL_CAP)
  return { x: f(), y: f(), vx: f(), vy: f(), born: new Float64Array(PIXEL_CAP), life: f(),
    size: new Uint8Array(PIXEL_CAP), source: new Uint8Array(PIXEL_CAP), material: new Uint8Array(PIXEL_CAP),
    px: new Float64Array(3), py: new Float64Array(3), at: new Float64Array(3), next: new Float64Array(3),
    active: new Uint8Array(3), sequence: new Uint32Array(3), head: 0, runId: -1, clock: 0, simAt: -1 }
}
export function pixelClock(p: PixelPool, runId: number, simTime: number, playing: boolean): void {
  if (p.runId !== runId || simTime < p.simAt) {
    p.life.fill(0); p.active.fill(0); p.sequence.fill(0); p.head = 0; p.clock = 0; p.runId = runId; p.simAt = simTime
  }
  if (playing) p.clock += Math.min(0.1, Math.max(0, simTime - p.simAt))
  p.simAt = simTime
}
const RATE = [28, 64, 42] as const
function clearSource(p: PixelPool, source: PixelSource): void {
  for (let i = 0; i < PIXEL_CAP; i++) if (p.source[i] === source) p.life[i] = 0
}
export function samplePixels(p: PixelPool, source: PixelSource, x: number, y: number, enabled: boolean, quality: number, material = 0): void {
  const now = p.clock, interval = 1 / (RATE[source] * Math.max(0.1, Math.min(1, quality)))
  if (!enabled) {
    if (p.active[source]) clearSource(p, source)
    p.active[source] = 0
    return
  }
  const jump = p.active[source] && Math.hypot(x - p.px[source], y - p.py[source]) > 128
  if (!p.active[source] || jump || now - p.at[source] > 0.2) {
    if (jump) clearSource(p, source)
    p.px[source] = x; p.py[source] = y; p.at[source] = now; p.next[source] = now
  }
  p.active[source] = 1
  let emitted = 0
  while (p.next[source] <= now + 1e-9 && emitted++ < 12) {
    const born = p.next[source], dt = now - p.at[source]
    const mix = dt > 0 ? Math.max(0, Math.min(1, (born - p.at[source]) / dt)) : 1
    const n = p.sequence[source]++, i = p.head++ % PIXEL_CAP, seed = 0x5058 + source
    const width = source === 2 ? 16 : source === 1 ? 6 : 3
    p.x[i] = p.px[source] + (x - p.px[source]) * mix + (hash2(n, 1, seed) - 0.5) * width
    p.y[i] = p.py[source] + (y - p.py[source]) * mix + (hash2(n, 2, seed) - 0.5) * 4
    p.vx[i] = (hash2(n, 3, seed) - 0.5) * (source === 2 ? 16 : 7)
    p.vy[i] = -(source === 1 ? 3 : 16) - hash2(n, 4, seed) * (source === 2 ? 35 : 15)
    p.born[i] = born; p.life[i] = (source === 1 ? 0.7 : 0.6) + hash2(n, 5, seed) * 0.8
    p.size[i] = source === 2 ? 2 + n % 3 : 1 + n % 2
    p.source[i] = source; p.material[i] = material
    p.next[source] += interval
  }
  p.px[source] = x; p.py[source] = y; p.at[source] = now
}
