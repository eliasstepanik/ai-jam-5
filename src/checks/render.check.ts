// Checks for src/core/noise.ts, src/core/view.ts and src/core/grid.ts (R-043: render.check covers only these L0 files).
// Spec: docs/architecture-render-2.md §1, architecture-modules-render-2.md §2 table, R-131, R-179, R-180, R-184.
import { hash2, vnoise, quantAngle } from '../core/noise.ts'
import { VIEW_H_DEV, deviceZoom, viewZoomCss } from '../core/view.ts'
import { floorVariant, faceKind, footRow, dirIndex } from '../core/grid.ts'
import type { Dir8 } from '../core/grid.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

export function run(): void {
  // view: integer device zoom, boundaries, floor of 1
  ok(VIEW_H_DEV === 480, 'VIEW_H_DEV is 480')
  const zooms: [number, number][] = [[0, 1], [1, 1], [240, 1], [719, 1], [720, 2], [1079, 2], [1080, 2], [1440, 3], [2160, 5]]
  for (const [ch, z] of zooms) ok(deviceZoom(ch) === z, `deviceZoom(${ch}) === ${z}, got ${deviceZoom(ch)}`)
  for (let ch = 0; ch <= 4400; ch += 7) ok(Number.isInteger(deviceZoom(ch)) && deviceZoom(ch) >= 1, `deviceZoom(${ch}) integer >= 1`)
  ok(viewZoomCss(720, 1) === 2, 'viewZoomCss(720, 1) === 2')
  ok(viewZoomCss(720, 2) === 1.5, 'viewZoomCss(720, 2) === 1.5 (R-131)')
  for (const [h, dpr] of [[720, 1], [720, 2], [1080, 1], [900, 1.25], [720, 1.5], [1000, 1.25], [1333, 1.5], [360, 3]]) {
    const dev = deviceZoom(Math.round(h * dpr))
    ok(Math.abs(viewZoomCss(h, dpr) * dpr - dev) < 1e-9, `viewZoomCss(${h}, ${dpr}) * dpr is the integer device zoom ${dev}`)
  }

  // noise: hash2 deterministic, in [0, 1), order independent, unbiased, sensitive to every argument
  ok(hash2(3, 4, 5) === hash2(3, 4, 5), 'hash2 deterministic')
  // golden vectors (uint32 / 2^32): pin the bit-exact result across engines and edits
  ok(hash2(1, 2, 3) * 4294967296 === 1631111411, 'hash2(1, 2, 3) golden')
  ok(hash2(-7, 40, 0x5a) * 4294967296 === 3848976561, 'hash2(-7, 40, 0x5a) golden')
  const fwd: number[] = []
  const bwd: number[] = []
  let sum = 0
  const n = 4096
  for (let i = 0; i < n; i++) fwd.push(hash2(i, i * 3 - 2000, 0x5a))
  for (let i = n - 1; i >= 0; i--) bwd[i] = hash2(i, i * 3 - 2000, 0x5a)
  for (let i = 0; i < n; i++) {
    ok(fwd[i] === bwd[i], 'hash2 independent of call order')
    ok(fwd[i] >= 0 && fwd[i] < 1, 'hash2 in [0, 1)')
    sum += fwd[i]
  }
  ok(Math.abs(sum / n - 0.5) < 0.05, 'hash2 mean near 0.5')
  ok(hash2(1, 2, 3) !== hash2(2, 1, 3) && hash2(1, 2, 3) !== hash2(1, 2, 4) && hash2(1, 2, 3) !== hash2(1, 3, 3), 'hash2 differs per arg')
  ok(new Set(fwd).size > n * 0.99, 'hash2 spreads values')

  // vnoise: deterministic, in [-1, 1], continuous, equals lattice hash at integers
  ok(vnoise(2.5, 7) === vnoise(2.5, 7), 'vnoise deterministic')
  ok(vnoise(3, 9) === hash2(3, 0, 9) * 2 - 1, 'vnoise at lattice point is the hashed value')
  const lo = hash2(3, 0, 9) * 2 - 1
  const hi = hash2(4, 0, 9) * 2 - 1
  const cosK = (1 - Math.cos(Math.PI / 4)) / 2 // cosine ease at f = 0.25, not the linear 0.25
  ok(Math.abs(vnoise(3.25, 9) - (lo + (hi - lo) * cosK)) < 1e-12, 'vnoise interpolates with a cosine ease')
  let prev = vnoise(-50, 11)
  for (let t = -50; t < 50; t += 0.01) {
    const v = vnoise(t, 11)
    ok(v >= -1 && v <= 1, 'vnoise in [-1, 1]')
    ok(Math.abs(v - prev) < 0.1, 'vnoise continuous')
    prev = v
  }

  // quantAngle: 16 steps of PI / 8, idempotent, symmetric, no wrap
  const step = Math.PI / 8
  ok(quantAngle(0.2) === step, 'quantAngle(0.2) === PI / 8')
  ok(quantAngle(0) === 0 && quantAngle(0.1) === 0 && quantAngle(-0.1) === 0, 'quantAngle rounds small angles to 0')
  ok(quantAngle(-0.2) === -step, 'quantAngle(-0.2) === -PI / 8')
  ok(Math.abs(quantAngle(2 * Math.PI + 0.2) - 17 * step) < 1e-12, 'quantAngle does not wrap past 2 PI')
  for (let a = -10; a <= 10; a += 0.13) {
    const q = quantAngle(a)
    ok(quantAngle(q) === q, `quantAngle idempotent at ${a}`)
    ok(Math.abs(q - a) <= step / 2 + 1e-12, `quantAngle within half a step at ${a}`)
  }

  // grid.floorVariant (R-179): integer 0..9, deterministic, spread over all variants, seed dependent
  const seen = new Set<number>()
  let seedDiffers = false
  for (let fy = 0; fy < 24; fy++) {
    for (let fx = 0; fx < 24; fx++) {
      const v = floorVariant(fx, fy, 0x5a)
      ok(Number.isInteger(v) && v >= 0 && v <= 9, `floorVariant(${fx}, ${fy}) integer 0..9, got ${v}`)
      ok(v === floorVariant(fx, fy, 0x5a), `floorVariant(${fx}, ${fy}) deterministic`)
      seen.add(v)
      if (v !== floorVariant(fx, fy, 0x5b)) seedDiffers = true
    }
  }
  ok(seen.size > 1, 'floorVariant gives more than one distinct value over a 24x24 sweep')
  ok(seen.size === 10, `floorVariant reaches all 10 variants over a 24x24 sweep, got ${seen.size}`)
  ok(seedDiffers, 'floorVariant depends on the seed')
  ok(floorVariant(-5, -9, 7) >= 0 && floorVariant(-5, -9, 7) <= 9, 'floorVariant in 0..9 for negative cells')

  // grid.faceKind: pillar (both open), left (W only), right (E only), fill (none); mask does not change the kind
  for (const mask of [0, 4, 15]) {
    ok(faceKind(mask, true, true) === 'pillar', `faceKind(${mask}, W open, E open) is pillar`)
    ok(faceKind(mask, true, false) === 'left', `faceKind(${mask}, W open only) is left`)
    ok(faceKind(mask, false, true) === 'right', `faceKind(${mask}, E open only) is right`)
    ok(faceKind(mask, false, false) === 'fill', `faceKind(${mask}, none open) is fill`)
  }

  // grid.footRow (R-180): 32 px tile rows
  ok(footRow(63.9) === 1, 'footRow(63.9) === 1')
  ok(footRow(0) === 0, 'footRow(0) === 0')
  ok(footRow(31.99) === 0 && footRow(32) === 1 && footRow(64) === 2, 'footRow row boundaries at 32 px')
  ok(footRow(-0.1) === -1, 'footRow(-0.1) === -1 (floor, not truncation)')

  // grid.dirIndex (R-184): atlas direction_order n ne e se s sw w nw
  const order: Dir8[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
  for (let i = 0; i < order.length; i++) ok(dirIndex(order[i]) === i, `dirIndex('${order[i]}') === ${i}`)
}
