// Cave overhaul A1: render/depth-tone.ts is pure and continuous. Written from design-render §2 and the plan row A1. A9 adds descent-fx.
import type { State } from '../core/types.ts'
import { init, MAP_H, MAP_W } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { CAVE_DRESSING, dressingAt } from '../core/cave-props.ts'
import { purposedCave } from '../core/cave-water.ts'
import type { CaveIn } from '../core/cave-water.ts'
import { clearCaches, getBeaconRoom, getDepthField } from '../world/caches.ts'
import { crackMul, depth01Field, playerDepth01, toneOf, vineDensity, wetField } from '../render/depth-tone.ts'
import { drawDescentFx, moteAt, moteCount, pebbleAt, pebbleCount, pebbleList } from '../render/descent-fx.ts'
import type { View } from '../render/view.ts'
import { caveOf } from './caves.ts'

const ok = (c: boolean, why: string): void => { if (!c) throw new Error('depth tone: ' + why) }
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9
let runId = 9000
const WET_R = 3 // the Chebyshev radius wetField marks around each purposed water anchor
const cheb = (ax: number, ay: number, x: number, y: number): number => Math.max(Math.abs(ax - x), Math.abs(ay - y))

// Purposed water anchors as [tx, ty], built exactly as render/dressing.ts feeds the drawn puddles (same CaveIn fields).
function waterAnchors(s: State): number[][] {
  const { w, h, tiles, entrance, beacon, exit } = s.world
  const c: CaveIn = { tiles, w, h, seed: s.meta.seed, entrance: entrance.ty * w + entrance.tx, beacon: beacon.ty * w + beacon.tx,
    exitTx: exit.tx, exitTy: exit.ty, room: getBeaconRoom(s), veins: s.veins.map(v => v.tile) }
  return purposedCave(c).water.map(p => [p.tile % w, Math.floor(p.tile / w)])
}

function load(tiles: string, w: number, h: number, entrance: number, beacon: number, beaconDist: number, seed = 5): State {
  const s = init()
  Object.assign(s.world, {
    w, h, tiles, tilesHash: fnv1a(tiles), beaconDist,
    entrance: { tx: entrance % w, ty: Math.floor(entrance / w) }, exit: { tx: entrance % w, ty: Math.floor(entrance / w) },
    beacon: { tx: beacon % w, ty: Math.floor(beacon / w) },
  })
  s.meta.runId = ++runId
  s.meta.seed = seed
  clearCaches()
  return s
}

function tone(): void {
  const stops = [[0, 0.86, 0.97, 1.00, 1.00], [0.35, 0.74, 0.86, 0.92, 0.78], [0.65, 0.70, 0.64, 0.84, 0.55], [1, 0.64, 0.50, 0.70, 0.32]]
  for (const [d, r, g, b, amb] of stops) {
    const t = toneOf(d)
    ok(near(t.r, r) && near(t.g, g) && near(t.b, b) && near(t.amb, amb), 'toneOf equals the table stop at d=' + d)
  }
  ok(toneOf(-3).amb === 1 && toneOf(7).amb === 0.32 && toneOf(NaN).amb === 1, 'toneOf clamps d to [0,1], NaN is shallow')
  let prev = toneOf(0)
  for (let i = 1; i <= 1000; i++) {
    const t = toneOf(i / 1000)
    ok(t.amb < prev.amb, 'amb strictly decreasing at d=' + i / 1000)
    ok(Math.abs(t.r - prev.r) < 0.01 && Math.abs(t.g - prev.g) < 0.01 && Math.abs(t.b - prev.b) < 0.01 && prev.amb - t.amb < 0.01,
      'per-channel step < 0.01 per 0.001 depth at d=' + i / 1000)
    prev = t
  }
  ok(toneOf(0.5).r < toneOf(0.35).r && toneOf(0.5).r > toneOf(0.65).r && toneOf(0.5).b < toneOf(0.35).b, 'tone darkens between stops')
}

function factors(): void {
  ok(crackMul(0) === 0.5 && crackMul(1) === 1.5 && crackMul(0.5) === 1 && crackMul(9) === 1.5 && crackMul(-9) === 0.5, 'crackMul = 0.5 + d, clamped')
  ok(vineDensity(0, false) === 1 && vineDensity(0, true) === 1, 'vineDensity(0, *) = 1')
  ok(vineDensity(0.55, false) === 0 && vineDensity(0.7, true) === 0 && vineDensity(1, false) === 0 && vineDensity(1, true) === 0, 'no vines past the cut-off')
  ok(vineDensity(0.6, false) === 0 && vineDensity(0.6, true) > 0 && vineDensity(0.69, true) > 0, 'wet tolerates vines up to 0.7')
  ok(Math.abs(vineDensity(0.27, false) - 0.36) < 0.02, 'vineDensity(0.27) is about 0.36')
  for (const wet of [false, true]) {
    let prev = 1
    for (let i = 0; i <= 200; i++) {
      const v = vineDensity(i / 200, wet)
      ok(v <= prev && v >= 0 && v <= 1, 'vineDensity monotone non-increasing in [0,1] (wet=' + wet + ')')
      prev = v
    }
  }
  for (let i = 0; i <= 100; i++) ok(vineDensity(i / 100, true) >= vineDensity(i / 100, false), 'wet never thinner than dry')
}

// 7x5 room with an island wall, entrance (1,1), beacon (5,3), shortest route 6.
function fixture(): void {
  const rows = ['#######', '#.....#', '#.###.#', '#.....#', '#######']
  const w = 7, h = 5, s = load(rows.join(''), w, h, 1 * w + 1, 3 * w + 5, 6)
  const f = depth01Field(s), d = getDepthField(s)
  ok(f instanceof Float32Array && f.length === w * h, 'depth01Field is a Float32Array of w*h')
  ok(f[1 * w + 1] === 0 && f[3 * w + 5] === 1, 'entrance tile 0, beacon tile 1')
  for (let i = 0; i < f.length; i++) {
    ok(f[i] >= 0 && f[i] <= 1, 'field in [0,1] at ' + i)
    if (rows[Math.floor(i / w)][i % w] !== '#') ok(Math.abs(f[i] - d[i] / 6) < 1e-6, 'floor tile = pathDist / beaconDist at ' + i)
  }
  ok(f[1 * w + 0] === 0 && f[3 * w + 6] === 1, 'outer wall takes the value of its floor neighbour')
  ok(f[2 * w + 3] === f[1 * w + 3] || f[2 * w + 3] === f[3 * w + 3], 'island wall takes a neighbouring floor value')
  ok(depth01Field(s) === f, 'depth01Field is cached by identity')
  const s2 = load(rows.join(''), w, h, 1 * w + 1, 3 * w + 5, 6)
  ok(depth01Field(s2) !== f, 'a new base field rebuilds the cache')
  const solid = load('#'.repeat(9), 3, 3, 4, 4, 1)
  ok(depth01Field(solid).every(v => v === 0), 'no reachable floor: all zero, no throw')
  const bad = load('...', 3, 3, 0, 2, 2)
  ok(depth01Field(bad).length === 9 && depth01Field(bad).every(v => v === 0), 'tiles shorter than w*h: all zero, no throw')
  const t = (x: number, y: number): State => { s2.player.x = x; s2.player.y = y; return s2 }
  ok(playerDepth01(t(1.5 * 32, 1.5 * 32)) === 0 && playerDepth01(t(5.5 * 32, 3.5 * 32)) === 1, 'playerDepth01 at entrance and beacon')
  ok(playerDepth01(t(3.5 * 32, 3.5 * 32)) === f[3 * w + 3], 'playerDepth01 reads the player tile')
  for (const [x, y] of [[-500, -500], [1e9, 1e9], [NaN, 20], [20, Infinity]]) {
    const v = playerDepth01(t(x, y))
    ok(v >= 0 && v <= 1, 'playerDepth01 stays in [0,1] out of map: ' + x + ',' + y)
  }
  ok(playerDepth01(t(-500, -500)) === f[0], 'out-of-map clamps to the nearest edge tile')
}

function generated(): void {
  for (const seed of [1, 7, 42]) {
    const r = caveOf(seed), w = MAP_W, h = MAP_H, e = r.entrance.ty * w + r.entrance.tx, b = r.beacon.ty * w + r.beacon.tx
    const s = load(r.tiles, w, h, e, b, r.beaconDist, seed)
    const f = depth01Field(s), d = getDepthField(s)
    ok(f[e] === 0 && f[b] === 1, 'seed ' + seed + ': entrance 0, beacon 1')
    let walls = 0
    for (let i = 0; i < f.length; i++) {
      ok(f[i] >= 0 && f[i] <= 1, 'seed ' + seed + ': field in [0,1]')
      if (r.tiles[i] !== '#' && d[i] >= 0) { ok(f[i] === Math.fround(d[i] / r.beaconDist), 'seed ' + seed + ': floor = d / beaconDist'); continue }
      walls++
      const x = i % w, y = Math.floor(i / w)
      const nb = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h)
        .map(([dx, dy]) => f[(y + dy) * w + x + dx])
      ok(nb.includes(f[i]), 'seed ' + seed + ': filled wall tile ' + i + ' copies a 4-neighbour')
    }
    ok(walls > 0, 'seed ' + seed + ' has walls')
    ok(depth01Field(s) === f, 'seed ' + seed + ': identity cache')
  }
}

function wet(): void {
  const w = 60, h = 60, s = load('.'.repeat(w * h), w, h, 0, w * h - 1, 2 * w, 11)
  const f = wetField(s)
  ok(f instanceof Uint8Array && f.length === w * h, 'wetField is a Uint8Array of w*h')
  ok(wetField(s) === f, 'wetField cached by identity')
  // Raw lattice water anchors (the A1 oracle): purposed water is a subset of them, so wet tiles must stay inside the raw-anchor wet area.
  const raw: number[][] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = dressingAt(s.world.tiles, w, h, x, y, 11)
    if (n >= 0 && CAVE_DRESSING[n].water) raw.push([x, y])
  }
  ok(raw.length > 3, 'fixture has raw water anchors')
  const anchors = waterAnchors(s)
  // the open fixture has no guide-led water, so it may hold zero purposed anchors; generated seeds are covered by wetPurposed()
  ok(anchors.length <= raw.length, 'purposed water anchors are a subset of the raw ones')
  let wetN = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const want = anchors.some(([ax, ay]) => cheb(ax, ay, x, y) <= WET_R) ? 1 : 0
    ok(f[y * w + x] === want, 'wetField = Chebyshev ' + WET_R + ' of a purposed water anchor at ' + x + ',' + y)
    if (want) ok(raw.some(([ax, ay]) => cheb(ax, ay, x, y) <= WET_R), 'wet tile is within reach of a raw anchor at ' + x + ',' + y)
    wetN += want
  }
  ok(wetN < w * h && (wetN === 0) === (anchors.length === 0), 'dry tiles exist; wet tiles exist iff purposed anchors exist')
  const other = load('.'.repeat(w * h), w, h, 0, w * h - 1, 2 * w, 12)
  ok(wetField(other) !== f, 'a new base field or seed rebuilds wetField')
  const solid = load('#'.repeat(9), 3, 3, 4, 4, 1)
  ok(wetField(solid).every(v => v === 0), 'no floor: no wet tiles')
}

// W1b: wet tiles mirror the purposed puddles on generated caves, both directions, plus the identity cache.
function wetPurposed(): void {
  let total = 0
  for (const seed of [1, 7, 42, 3, 19]) {
    const r = caveOf(seed), w = MAP_W, h = MAP_H, e = r.entrance.ty * w + r.entrance.tx, b = r.beacon.ty * w + r.beacon.tx
    const s = load(r.tiles, w, h, e, b, r.beaconDist, seed), f = wetField(s), anchors = waterAnchors(s)
    total += anchors.length
    ok(f.includes(1) && f.includes(0), 'seed ' + seed + ': wet and dry tiles both exist')
    ok(wetField(s) === f, 'seed ' + seed + ': wetField identity cache')
    for (let i = 0; i < f.length; i++) {
      if (f[i] !== 1) continue
      const x = i % w, y = (i - x) / w
      ok(anchors.some(([ax, ay]) => cheb(ax, ay, x, y) <= WET_R), 'seed ' + seed + ': wet tile ' + i + ' has a purposed water anchor within ' + WET_R)
    }
    for (const [ax, ay] of anchors) {
      let hit = false
      for (let y = Math.max(0, ay - WET_R); !hit && y <= Math.min(h - 1, ay + WET_R); y++) {
        for (let x = Math.max(0, ax - WET_R); x <= Math.min(w - 1, ax + WET_R); x++) if (f[y * w + x] === 1) { hit = true; break }
      }
      ok(hit, 'seed ' + seed + ': purposed water anchor ' + ax + ',' + ay + ' has a wet tile within ' + WET_R)
    }
  }
  ok(total > 0, 'the generated seeds hold purposed water anchors')
}

// F10: wetField's memo key holds the vein tiles (element-wise) and the exit. Mining a vein (systems/mining.ts: splice + veinGen += 1) and moving
// the exit must rebuild it; the rebuilt field must equal a fresh stamp of the purposed water anchors (waterAnchors reads s.veins and the exit).
// ponytail: detailCtx (render/cave-details.ts) and dressingCache (render/dressing.ts) carry the same vein/exit keys but cannot be reached here: both
// import render/tileset.ts (a JSON import without attribute) and assets/images.ts (import.meta.glob), which the node check runner cannot load.
function wetVeins(): void {
  const r = caveOf(1), w = MAP_W, h = MAP_H, e = r.entrance.ty * w + r.entrance.tx, b = r.beacon.ty * w + r.beacon.tx
  const s = load(r.tiles, w, h, e, b, r.beaconDist, 1)
  const stamp = (): Uint8Array => {
    const v = new Uint8Array(w * h)
    for (const [ax, ay] of waterAnchors(s)) for (let y = Math.max(0, ay - WET_R); y <= Math.min(h - 1, ay + WET_R); y++) for (let x = Math.max(0, ax - WET_R); x <= Math.min(w - 1, ax + WET_R); x++) v[y * w + x] = 1
    return v
  }
  const same = (f: Uint8Array): boolean => { const want = stamp(); return f.every((v, i) => v === want[i]) }
  const [[ax, ay], [bx, by]] = waterAnchors(s)
  const vein = (tx: number, ty: number) => ({ id: 1, mineral: 'sodium' as const, tile: ty * w + tx, stand: ty * w + tx, pieces: 1 })
  const f0 = wetField(s)
  ok(wetField(s) === f0 && same(f0), 'wetField hit without change, equals the stamp')
  s.veins.push(vein(ax, ay)) // a vein on a purposed water anchor suppresses that puddle
  const f1 = wetField(s)
  ok(f1 !== f0 && same(f1) && f1.some((v, i) => v !== f0[i]), 'a new vein rebuilds wetField with fewer wet tiles')
  ok(wetField(s) === f1, 'wetField hit with the vein in place')
  s.veins.splice(0, 1); s.world.veinGen += 1 // mining, as systems/mining.ts does
  const f2 = wetField(s)
  ok(f2 !== f1 && same(f2) && f2.every((v, i) => v === f0[i]), 'mining the vein rebuilds wetField back to the vein-free field')
  s.veins.push(vein(ax, ay))
  const f3 = wetField(s)
  s.veins[0] = vein(bx, by) // same vein count, other tile: only the element-wise compare sees it
  const f4 = wetField(s)
  ok(f4 !== f3 && same(f4), 'a vein on another tile (same count) rebuilds wetField')
  s.world.exit = { tx: s.world.exit.tx + 1, ty: s.world.exit.ty }
  const f5 = wetField(s)
  ok(f5 !== f4 && same(f5) && wetField(s) === f5, 'moving the exit one tile rebuilds wetField')
}

// Cave overhaul A9: descent dust and pebbles are stateless pure functions of time, density follows depth.
function descent(): void {
  const per = (n: (d: number) => number): number[] => Array.from({ length: 101 }, (_, i) => n(i / 100))
  const mc = per(moteCount), pc = per(pebbleCount)
  ok(mc[0] === 2 && mc[100] === 12 && pc[0] === 0 && pc[100] === 6, 'counts at the ends: motes 2..12, pebbles 0..6')
  ok(moteCount(0.5) === Math.round(2 + 10 * 0.5 ** 1.5) && pebbleCount(0.5) === Math.floor(6 * 0.25), 'count formulas')
  ok(moteCount(NaN) === 2 && pebbleCount(NaN) === 0 && moteCount(9) === 12 && pebbleCount(-3) === 0, 'counts clamp d to [0,1]')
  for (let i = 1; i <= 100; i++) ok(mc[i] >= mc[i - 1] && pc[i] >= pc[i - 1], 'counts monotone non-decreasing in d at ' + i / 100)
  ok(mc[100] > mc[0] && pc[100] > pc[0], 'counts grow with depth')

  const big = '.'.repeat(64 * 64)
  for (const t of [0, 0.37, 5.5, 123.456, 9999.1]) {
    for (let i = 0; i < 12; i++) {
      const a = moteAt(i, t, 500, 600), b = moteAt(i, t, 500, 600)
      ok(a.x === b.x && a.y === b.y && a.a === b.a, 'moteAt deterministic for equal t')
      ok(a.a >= 0 && a.a <= 0.5 && Math.abs(a.x - 500) <= 90 && Math.abs(a.y - 600) <= 80 + 6 * 8 + 1, 'mote alpha 0..0.5 and inside its box')
    }
    for (let j = 0; j < 6; j++) {
      const a = pebbleAt(j, t, 500, 600), b = pebbleAt(j, t, 500, 600)
      ok(JSON.stringify(a) === JSON.stringify(b), 'pebbleAt deterministic for equal t')
      if (a) ok(a.y <= a.ly && a.ly - a.y <= 48 && a.a >= 0 && a.a <= 1, 'pebble falls at most 48 px onto its landing point')
    }
    ok(JSON.stringify(pebbleList(big, 64, 64, t, 1000, 1000, 1)) === JSON.stringify(pebbleList(big, 64, 64, t, 1000, 1000, 1)), 'pebbleList deterministic')
    ok(pebbleList(big, 64, 64, t, 1000, 1000, 0).length === 0, 'pebble list empty at d=0')
    ok(pebbleList(big, 64, 64, t, 1000, 1000, 0.4).length <= pebbleCount(0.4), 'pebble list at most pebbleCount')
  }
  let seen = 0, quiet = 0
  for (let i = 0; i < 4000; i++) {
    const n = pebbleList(big, 64, 64, i * 0.05, 1000, 1000, 1).length
    seen += n; if (n === 0) quiet++
  }
  ok(seen > 0 && quiet > 0, 'pebbles come and go over time')
  const walls = '#'.repeat(64 * 64), edge = '.'.repeat(64 * 64)
  for (let i = 0; i < 400; i++) ok(pebbleList(walls, 64, 64, i * 0.1, 1000, 1000, 1).length === 0, 'no pebble lands on a wall')
  for (let i = 0; i < 400; i++) ok(pebbleList(edge, 64, 64, i * 0.1, -5000, -5000, 1).length === 0, 'no pebble lands outside the map')
  const half = ('.'.repeat(32) + '#'.repeat(32)).repeat(64)
  for (let i = 0; i < 600; i++) for (const p of pebbleList(half, 64, 64, i * 0.1, 1024, 1024, 1)) {
    ok(half[Math.floor(p.ly / 32) * 64 + Math.floor(p.lx / 32)] === '.', 'every pebble lands on a floor tile')
  }

  // drawDescentFx: stub canvas records fillRect calls; quality gate and time freeze.
  const rects: number[][] = []
  const ctx = { save() {}, restore() {}, fillRect: (...a: number[]) => { rects.push(a) }, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '' }
  const c = ctx as unknown as CanvasRenderingContext2D
  const v = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 } as View
  const w = 7, h = 5, s = load(['#######', '#.....#', '#.###.#', '#.....#', '#######'].join(''), w, h, 1 * w + 1, 3 * w + 5, 6)
  s.player.x = 5.5 * 32; s.player.y = 3.5 * 32 // beacon tile: depth 1
  const frame = (q: 'q0' | 'q1' | 'q2' | 'q3', t: number): string => {
    s.settings.quality = q; s.meta.time = t; rects.length = 0
    const rng = JSON.stringify(s.rng)
    drawDescentFx(c, s, v)
    ok(JSON.stringify(s.rng) === rng, 'drawDescentFx never advances the rng streams')
    return JSON.stringify(rects)
  }
  ok(frame('q0', 3.3).length > 2 && frame('q1', 3.3) === frame('q0', 3.3), 'decor quality draws and is stateless')
  ok(frame('q2', 3.3) === '[]' && frame('q3', 3.3) === '[]', 'no draw when decor is off')
  ok(frame('q0', 3.3) === frame('q0', 3.3), 'same time, same frame')
  ok(frame('q0', 3.3) !== frame('q0', 4.1), 'the pass animates with time')
  s.player.x = 1.5 * 32; s.player.y = 1.5 * 32 // entrance: depth 0
  ok(playerDepth01(s) === 0, 'entrance depth is 0')
  frame('q0', 3.3)
  ok(rects.length <= moteCount(0) && rects.every(r => r[2] === 1 && r[3] === 1), 'entrance: at most the 2 motes, no pebble or puff')
  s.settings.quality = 'auto'
}

export function run(): void {
  tone()
  factors()
  fixture()
  generated()
  wet()
  wetPurposed()
  wetVeins()
  descent()
  clearCaches()
}
