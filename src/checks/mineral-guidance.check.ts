// User-requested mineral routing, floor-anchored fire, wheel selection and escape teaching layout.
import { init } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { createCopperHints, sampleCopperFire } from '../core/copper-hints.ts'
import { resolveIntent } from '../systems/intent.ts'
import { stepMinerals } from '../systems/flame.ts'
import { stepCopperTrail } from '../systems/copper-trail.ts'
import { beaconTile } from '../world/beacon-position.ts'
import { clearCaches } from '../world/caches.ts'
import { escapeTipPose } from '../ui/escape-tip-pose.ts'
import { hudLayout } from '../ui/layout.ts'
import type { Input } from '../main.ts'
const ok = (v: unknown, message: string): void => { if (!v) throw Error('mineral guide: ' + message) }
function routing(): void {
  const s = init(), w = 14, h = 11
  const tiles = Array.from({ length: w * h }, (_, i) => {
    const x = i % w, y = Math.floor(i / w)
    return !x || x === w - 1 || !y || y === h - 1 || (x === 5 && y < 9) ||
      ((x === 9 || x === 11) && y === 3) || (x === 10 && (y === 2 || y === 4)) ? '#' : '.'
  }).join('')
  Object.assign(s.world, { w, h, tiles, tilesHash: fnv1a(tiles), beacon: { tx: 11, ty: 8 } })
  s.meta.runId = 8001; s.player.x = 4 * 32 + 16; s.player.y = 2 * 32 + 16
  s.player.activeMineral = 'strontium'; s.player.energy = 50
  s.pickups = [[6, 2], [2, 6], [10, 3]].map(([x, y], id) => ({ id, kind: 'resin', x: x * 32 + 16, y: y * 32 + 16, bob: 0, size: 'small' }))
  s.pickups.push({ id: 10, kind: 'plant', x: s.player.x, y: s.player.y + 32, bob: 0, size: 'small' })
  clearCaches(); const rng = JSON.stringify(s.rng); stepCopperTrail(s, 1 / 60)
  ok(s.trail.path.at(-1) === 6 * w + 2 && s.trail.path.length === 7, 'nearest resin uses walking distance, ignores walls/nearer plant')
  s.pickups.splice(1, 1); stepCopperTrail(s, 1 / 60)
  ok(s.trail.path.at(-1) === 2 * w + 6 && s.trail.path.length > 12, 'removing resin reroutes stationary player around barrier, full path')
  s.pickups = s.pickups.filter(p => p.kind !== 'resin' || p.id === 2); stepCopperTrail(s, 1 / 60)
  ok(s.trail.path.length === 0, 'unreachable resin produces no false route')
  s.pickups = []; stepCopperTrail(s, 1 / 60); ok(s.trail.path.length === 0, 'no resin is graceful')
  s.player.activeMineral = 'copper'; stepCopperTrail(s, 1 / 60)
  const b = beaconTile(s)
  ok(s.trail.path.at(-1) === b.ty * w + b.tx, 'stationary mineral switch targets Beacon')
  ok(JSON.stringify(s.rng) === rng, 'routing draws no gameplay RNG')
  s.meta.phase = 'escape'; stepCopperTrail(s, 1 / 60); ok(!s.trail.on && !s.trail.path.length, 'escape disables both guides')
}
function fire(): void {
  const p = createCopperHints(), points = Array.from({ length: 20 }, (_, tile) => ({ tile, x: tile * 32 + 16, y: 100 }))
  const sample = (time: number, pts = points, material = 'copper', on = true): void => sampleCopperFire(p, 1, time, on, material, 42, pts, 1)
  sample(0); ok(p.pixels.length === 0, 'emitters have staggered world-tile phases')
  sample(.2); ok(p.pixels.length > 0 && p.pixels.length < points.length, 'fire appears gradually instead of a simultaneous burst')
  const a = p.pixels[0], x = a.x, y = a.y
  sample(.25, points.slice(5)); ok(p.pixels.includes(a) && a.x === x && a.y === y, 're-routing never translates living fire')
  const count = p.pixels.length; sample(.25, points.slice(5)); ok(p.pixels.length === count, 'frozen clock never re-emits')
  for (let i = 1; i < 600; i++) sample(.25 + i / 60)
  ok(p.pixels.length > 4 && p.pixels.length < 24, 'low density spread across twenty route tiles')
  sample(11, points, 'strontium'); ok(!p.pixels.includes(a) && p.material === 'strontium', 'colour switch clears the old guide history')
  sample(11.5, points, 'strontium', false); ok(!p.pixels.length && !p.next.size, 'extinguish clears fire')
  sampleCopperFire(p, 2, 0, true, 'copper', 42, points, 1); ok(p.runId === 2, 'new run resets pool')
  const huge = Array.from({ length: 500 }, (_, tile) => ({ tile, x: tile * 32, y: 0 }))
  sampleCopperFire(p, 2, 50, true, 'copper', 42, huge, 1); sampleCopperFire(p, 2, 51, true, 'copper', 42, huge, 1)
  ok(p.pixels.length <= 128, 'particle history is bounded even for a huge route')
}
function controls(): void {
  const s = init(), input: Input = { keys: new Set(), pressed: new Set(), clicks: [], mouse: { x: 0, y: 0, down: false }, view: { w: 1280, h: 720, dpr: 1 } }
  const test = (wheel: number, expected: string): void => {
    s.player.selected = 'sodium'; const it = resolveIntent(s, { ...input, wheel }); stepMinerals(s, it)
    ok(s.player.selected === expected, 'wheel wraps ' + wheel); ok(s.player.activeMineral === 'none', 'wheel only selects; never spends/applies mineral')
  }
  test(1, 'copper'); test(-1, 'strontium'); test(3, 'sodium'); test(4, 'copper'); test(-4, 'strontium')
  ok(resolveIntent(s, { ...input, wheel: 1, pressed: new Set(['Digit3']) }).select === 'strontium', 'number keys retain priority')
  for (const [w, h] of [[1280, 720], [640, 360], [1920, 1080]]) {
    const l = hudLayout(w, h, s), a = escapeTipPose(0, l), z = escapeTipPose(3, l), mid = escapeTipPose(2.4, l)
    ok(a.y > l.exitBanner.y + 66 * l.u && a.size === 28, 'dodge starts below announcement')
    ok(z.x === l.hotbarHint.x && z.y === l.hotbarHint.y && z.size === 12, 'dodge settles at old torch controls')
    ok(mid.y > a.y && mid.y < z.y && mid.size < a.size && mid.size > z.size, 'smooth shrink and move')
  }
}
export function run(): void { routing(); fire(); controls() }
