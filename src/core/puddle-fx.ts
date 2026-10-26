// Bounded cosmetic water history, driven by real foot displacement and a pause-aware clock.
export type Ripple = { actor: number; tile: number; x: number; y: number; born: number }
export type WaterFx = { runId: number; simAt: number; clock: number; ripples: Ripple[];
  feet: Map<number, { x: number; y: number; at: number; distance: number; wet: boolean }> }
export const RIPPLE_CAP = 32, RIPPLE_LIFE = 0.85
export function createWaterFx(): WaterFx { return { runId: -1, simAt: -1, clock: 0, ripples: [], feet: new Map() } }
export function waterClock(f: WaterFx, runId: number, time: number, playing: boolean): void {
  if (f.runId !== runId || time < f.simAt) {
    f.runId = runId; f.simAt = time; f.clock = 0; f.ripples.length = 0; f.feet.clear()
  }
  if (playing) f.clock += Math.min(0.1, Math.max(0, time - f.simAt))
  f.simAt = time
  f.ripples = f.ripples.filter(r => f.clock - r.born < RIPPLE_LIFE)
}
export function sampleWaterFoot(f: WaterFx, id: number, x: number, y: number, tile: number | null): void {
  const old = f.feet.get(id), wet = tile !== null
  if (!old) { f.feet.set(id, { x, y, at: f.clock, distance: 0, wet }); return }
  const step = Math.hypot(x - old.x, y - old.y)
  if (step > 128) {
    f.ripples = f.ripples.filter(r => r.actor !== id)
    old.distance = 0; old.at = f.clock
  } else if (wet && step > 0.01) {
    old.distance += step
    if ((!old.wet || old.distance >= 8) && f.clock - old.at >= 0.14) {
      if (f.ripples.length >= RIPPLE_CAP) f.ripples.shift()
      f.ripples.push({ actor: id, tile, x, y, born: f.clock })
      old.distance = 0; old.at = f.clock
    }
  } else if (!wet) old.distance = 0
  old.x = x; old.y = y; old.wet = wet
}
// Native water's largest nontransparent color is its interior; exclude shore pixels without hardcoding the palette.
export function waterInterior(data: Uint8ClampedArray): Uint8Array {
  const counts = new Map<number, number>()
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) {
    const rgb = data[i] << 16 | data[i + 1] << 8 | data[i + 2]
    counts.set(rgb, (counts.get(rgb) ?? 0) + 1)
  }
  let dominant = -1, best = 0
  for (const [rgb, n] of counts) if (n > best) { dominant = rgb; best = n }
  const bits = new Uint8Array(data.length / 4)
  for (let i = 0; i < bits.length; i++) if (data[i * 4 + 3] > 200 && (data[i * 4] << 16 | data[i * 4 + 1] << 8 | data[i * 4 + 2]) === dominant) bits[i] = 1
  return bits
}
