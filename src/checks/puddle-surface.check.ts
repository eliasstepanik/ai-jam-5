// Cave overhaul A10: render/puddle-surface.ts is pure, stateless and bounded. Written from design-render §5/§6 and plan row A10.
import { createWaterFx, RIPPLE_LIFE } from '../core/puddle-fx.ts'
import { dripOf, poolTint, rimOf, shimmerAlpha } from '../render/puddle-surface.ts'
import type { PoolMask } from '../render/puddle-surface.ts'

const ok = (c: boolean, why: string): void => { if (!c) throw new Error('puddle surface: ' + why) }
const mask = (w: number, h: number, on: (x: number, y: number) => boolean): PoolMask => {
  const bits = new Uint8Array(w * h)
  for (let i = 0; i < bits.length; i++) bits[i] = Number(on(i % w, Math.floor(i / w)))
  return { w, h, bits }
}
// Irregular 24x16 blob with a hole, so some random positions miss the mask.
const blob = mask(24, 16, (x, y) => Math.hypot(x - 11.5, y - 7.5) < 7.5 && !(x > 12 && x < 16 && y > 6 && y < 10))

function shimmer(): void {
  let lo = 1, hi = 0
  for (let tile = 0; tile < 200; tile++) for (let c = 0; c < 400; c += 0.37) {
    const a = shimmerAlpha(c, tile)
    lo = Math.min(lo, a); hi = Math.max(hi, a)
    ok(shimmerAlpha(c, tile) === a, 'shimmerAlpha deterministic')
  }
  ok(lo >= 0.28 && hi <= 0.40, 'shimmerAlpha stays in [0.28,0.40], got ' + lo + '..' + hi)
  ok(hi - lo > 0.08, 'shimmerAlpha actually moves, got span ' + (hi - lo))
  ok(shimmerAlpha(0, 3) !== shimmerAlpha(0, 4) || shimmerAlpha(0, 3) !== shimmerAlpha(0, 5), 'tiles shimmer out of step')
  ok(shimmerAlpha(-5, 3) >= 0.28 && shimmerAlpha(1e6, 3) <= 0.40, 'shimmerAlpha bounded for odd clocks')
}

function drips(): void {
  const fx = createWaterFx(), before = JSON.stringify(fx)
  const step = 0.01
  let seen = 0, quiet = 0
  for (let tile = 0; tile < 40; tile++) {
    // One tile = one drip at a time: dripOf returns at most one ring, a ring lives <= RIPPLE_LIFE,
    // and consecutive rings (different cycle k) are separated by quiet time (min period 1.6 s - RIPPLE_LIFE 0.85 s = 0.75 s).
    let k = -1, first = 0, last = 0
    for (let c = 0; c < 60; c = Math.round((c + step) * 1000) / 1000) {
      const d = dripOf(tile, c, blob)
      ok(JSON.stringify(dripOf(tile, c, blob)) === JSON.stringify(d), 'dripOf deterministic at tile ' + tile + ' clock ' + c)
      if (!d) { quiet++; continue }
      seen++
      ok(d.age >= 0 && d.age < 1, 'drip age in [0,1)')
      ok(d.x >= 0 && d.y >= 0 && d.x < blob.w && d.y < blob.h && blob.bits[d.y * blob.w + d.x] === 1, 'drip lands inside the pool mask')
      if (d.k !== k) {
        ok(d.k > k, 'drip cycle never goes backwards')
        ok(k < 0 || c - last > 0.5, 'a new ring starts only after a quiet gap (period 1.6 - life 0.85), tile ' + tile)
        k = d.k; first = c
      }
      ok(c - first < RIPPLE_LIFE + step, 'a drip ring lives at most RIPPLE_LIFE, tile ' + tile)
      last = c
    }
  }
  ok(seen > 1000, 'drips actually occur, got ' + seen)
  ok(quiet > seen, 'there are quiet moments between drips, got ' + quiet)
  ok(dripOf(0, 3, { w: 0, h: 0, bits: new Uint8Array(0) }) === null, 'empty mask: no drip')
  ok(dripOf(0, 3, mask(5, 5, () => false)) === null, 'blank mask: no drip')
  let single = 0
  const dot = mask(8, 8, (x, y) => x === 3 && y === 5)
  for (let c = 0; c < 400; c += 0.05) { const d = dripOf(7, c, dot); if (d) { single++; ok(d.x === 3 && d.y === 5, 'single-bit mask: drip on that bit') } }
  ok(single > 0, 'single-bit mask still drips now and then')
  for (let tile = 0; tile < 40; tile++) ok(JSON.stringify(dripOf(tile, -4, blob)) === JSON.stringify(dripOf(tile, 0, blob)), 'negative clock clamps to 0, tile ' + tile)
  // Drips are pure render: they never write the shared ripple list or any other fx field.
  ok(JSON.stringify(fx) === before && fx.ripples.length === 0, 'drips never touch fx.ripples')
}

function rim(): void {
  const full = mask(5, 3, () => true), r = rimOf(full)
  ok(r.length === 15 && r.reduce((a, b) => a + b, 0) === 12, '5x3 full mask has 12 border bits')
  ok(r[1 * 5 + 1] === 0 && r[1 * 5 + 2] === 0 && r[1 * 5 + 3] === 0, 'the 3 interior bits are not rim')
  ok(rimOf(full) === r, 'rimOf cached per mask object')
  const twin = mask(5, 3, () => true)
  ok(rimOf(twin) !== r && rimOf(twin).every((v, i) => v === r[i]), 'a distinct mask object gets its own equal rim')
  const hole = mask(5, 5, (x, y) => !(x === 2 && y === 2)), h = rimOf(hole)
  ok(h[1 * 5 + 2] === 1 && h[2 * 5 + 1] === 1 && h[2 * 5 + 3] === 1 && h[3 * 5 + 2] === 1, 'bits next to a hole are rim')
  ok(h[2 * 5 + 2] === 0, 'a hole is never rim')
  ok(h[1 * 5 + 1] === 0 && h.reduce((a, b) => a + b, 0) === 16 + 4, 'diagonal-only neighbours of a hole are interior')
  for (let i = 0; i < r.length; i++) ok(r[i] <= full.bits[i], 'rim is a subset of the mask')
  ok(rimOf(mask(4, 4, () => false)).every(v => v === 0), 'empty mask has no rim')
}

function tint(): void {
  ok(poolTint(0) === 'rgba(90,76,47,0.3)', 'poolTint(0) equals the old tint, got ' + poolTint(0))
  ok(poolTint(1) === 'rgba(34,42,54,0.42)', 'poolTint(1) is the deep tint, got ' + poolTint(1))
  ok(poolTint(-2) === poolTint(0) && poolTint(9) === poolTint(1) && poolTint(NaN) === poolTint(0), 'poolTint clamps d')
  ok(poolTint(0.5) === 'rgba(62,59,51,0.36)', 'poolTint midpoint lerps, got ' + poolTint(0.5))
}

export function run(): void {
  shimmer()
  drips()
  rim()
  tint()
}
