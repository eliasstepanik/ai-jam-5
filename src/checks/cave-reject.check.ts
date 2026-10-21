// Cave validator, negative branches (CG4 §7 test 13, fixtures). The generator never emits failing input, so each case edits a deep copy of a
// valid cave and expects the stable reject id of validateCave. Thresholds come from the spec text, never from validate.ts (R-162):
// CG4 §5 row 5 (fallback band floor 459 = floor(0.9 * 510), band 510..690), row 11 (pickups <= 60), row 14 (14a, 14b), R-163 (fallback ring).
// The only validate.ts reads are the exported signature, the stable reject ids ('r5 band', 'r11 counts', 'winnable') and the constants MARGIN and
// Z4_E_PER_TILE, which are pinned to their spec values (rule 14a) before use.
// CUT_R 8/12 (rule 6 box radius, R-157 DEFAULT) is deliberately not pinned here: tuning default, measured R=10 rejects core seed 2.
// Fixture tiles are chosen by geometry only (never by validateCave, which would be circular); validateCave is asserted afterwards.
import type { CaveResult, Pickup } from '../core/types.ts'
import { MAP_H, MAP_W, TILE } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { bfs4 } from '../world/bfs.ts'
import { fallbackCave } from '../world/gen/fallback.ts'
import { MARGIN, Z4_E_PER_TILE, validateCave } from '../world/validate.ts'
import { caveOf } from './caves.ts'
import { SEEDS, cheb as chebT, info, ok, tileOf, zoneIn } from './cave.check.ts'

const W = MAP_W, H = MAP_H
const copy = (r: CaveResult): CaveResult => structuredClone(r) // never mutate caveOf memo results
const why = (r: CaveResult): string => validateCave(r).why
const NEED = T.beacon.minStartE + MARGIN // CG4 §5 row 14: minStartE + MARGIN
const px = (tile: number): { x: number; y: number } => ({ x: (tile % W) * TILE + TILE / 2, y: Math.floor(tile / W) * TILE + TILE / 2 })
const restore = (p: Pickup): number => (p.size === 'large' ? T.resin.largeE : T.resin.smallE)
// BFS distance Beacon <- entrance of a (possibly edited) cave, from its tiles string alone
function distOf(r: CaveResult): number {
  const g = new Uint8Array(W * H)
  for (let i = 0; i < g.length; i++) g[i] = r.tiles.charCodeAt(i) === 35 ? 1 : 0
  return bfs4(g, W, H, r.entrance.ty * W + r.entrance.tx)[r.beacon.ty * W + r.beacon.tx]
}

// Corridor carved between two main tiles (p, q) of a cave, deterministic: the BFS distance Beacon <- entrance shortens by a fixed amount. `mirror` also
// digs the x -> W - x image, so the shortest route shortens whichever side the (point-symmetric) fallback ring main runs on.
function carve(r: CaveResult, p: number, q: number, mirror: boolean): CaveResult {
  const v = copy(r), t = v.tiles.split(''), m = info(r).main, a = m[p], b = m[q]
  let x = a % W, y = Math.floor(a / W)
  const bx = b % W, by = Math.floor(b / W)
  const dig = (): void => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const X of mirror ? [x + dx, W - x - dx] : [x + dx]) {
      if (X >= 1 && X < W - 1 && y + dy >= 1 && y + dy < H - 1 && t[(y + dy) * W + X] === '#') t[(y + dy) * W + X] = '.'
    }
  }
  while (x !== bx) { dig(); x += Math.sign(bx - x) }
  while (y !== by) { dig(); y += Math.sign(by - y) }
  dig()
  v.tiles = t.join('')
  v.beaconDist = distOf(v)
  return v
}
// Detour: wall the +-1 dist slice within Chebyshev radius R of main[k] (the floor behind it that is cut off becomes wall), lengthening the route.
function detour(r: CaveResult, k: number, R: number): CaveResult {
  const I = info(r), c = I.main[k], cx = c % W, cy = Math.floor(c / W), g = I.g.slice()
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) if (!g[y * W + x] && Math.abs(I.d[y * W + x] - I.d[c]) <= 1) g[y * W + x] = 1
  const d = bfs4(g, W, H, I.e), v = copy(r), t = v.tiles.split('')
  for (let i = 0; i < t.length; i++) if (g[i] || d[i] < 0) t[i] = '#'
  v.tiles = t.join('')
  v.beaconDist = distOf(v)
  return v
}
// Fixture guard: the generator is pinned, so a fixture that lands on another distance means the fixtures are stale.
const exactly = (v: CaveResult, bd: number): CaveResult => { ok(v.beaconDist === bd, `fixture gives beaconDist ${v.beaconDist}, expected ${bd}: regenerate fixtures`); return v }

// Rule 5, fallback floor: 459 <= beaconDist <= 690 (CG4 §5; floor(0.9 * 510) = 459). The ring is fixed geometry (R-163), so one corridor carved between
// two ring main tiles gives a deterministic Beacon distance. The ring distance is odd (515): odd targets 457..461 come from the hard-coded shortcut
// pairs below (found once by search), 458 from moving the entrance one tile down (its 8 neighbours stay floor, so only the band can reject).
const RING: Record<number, readonly [number, number]> = { 459: [96, 349], 461: [96, 347], 457: [92, 351] }
function fallbackBand(): void {
  const r = fallbackCave(1)
  const at = (bd: number): CaveResult => exactly(carve(r, RING[bd][0], RING[bd][1], true), bd)
  const good = at(459), c461 = at(461)
  ok(good.beaconDist === 459 && good.stats.fallback && validateCave(good).ok, 'rule 5: fallback ring with beaconDist 459 (the floor) is accepted')
  ok(validateCave(c461).ok, 'rule 5: fallback ring with beaconDist 461 is accepted (control)')
  const short = at(457)
  ok(short.beaconDist === 457 && why(short) === 'r5 band', 'rule 5: fallback beaconDist 457 < 459 is rejected as r5 band')
  const e1 = copy(c461), shift = { tx: e1.entrance.tx, ty: e1.entrance.ty + 1 }
  e1.entrance = shift; e1.exit = { ...shift }; e1.beaconDist = distOf(e1)
  ok(e1.beaconDist === 460 && validateCave(e1).ok, 'rule 5: entrance one tile down gives 460 and is accepted (control)')
  const e2 = copy(good)
  e2.entrance = { tx: good.entrance.tx, ty: good.entrance.ty + 1 }; e2.exit = { ...e2.entrance }; e2.beaconDist = distOf(e2)
  ok(e2.beaconDist === 458 && why(e2) === 'r5 band', 'rule 5: fallback beaconDist 458 = floor - 1 is rejected as r5 band')
  const plain = copy(good) // the same 459 cave is NOT a fallback: the class-3 band 510..690 applies (CG4 §5 row 5)
  plain.stats = { ...plain.stats, fallback: false }
  ok(why(plain) === 'r5 band', 'rule 5: beaconDist 459 on a non-fallback cave is rejected as r5 band')
  ok(good.beaconDist === 459 && fallbackCave(1).beaconDist === 515, 'rule 5: the carved variant has 459 and a fresh fallbackCave(1) still has the 515 ring (deterministic, not changed by the copies)')
}

// Rule 5, class-3 band 510..690 with REAL geometry on non-fallback caves (CG4 §5 row 5): the BFS distance itself is edited, nothing else is touched.
// Lower edge: a shortcut corridor (seed, p, q) shortens the route to 509 / 510. Upper edge: a wall slice (seed, k, R) lengthens it to 690 / 691.
function classBand(): void {
  const cut = (seed: number, p: number, q: number, bd: number): CaveResult => exactly(carve(caveOf(seed), p, q, false), bd)
  const wall = (seed: number, k: number, bd: number): CaveResult => exactly(detour(caveOf(seed), k, 16), bd)
  const lo = cut(6, 209, 288, 509), lo2 = cut(25, 162, 204, 509), a510 = cut(11, 39, 107, 510), b510 = cut(30, 185, 264, 510)
  const hi = wall(22, 411, 691), a690 = wall(44, 264, 690)
  for (const v of [lo, lo2, a510, b510, hi, a690]) ok(!v.stats.fallback, 'rule 5 band: fixture is a non-fallback cave')
  ok(why(lo) === 'r5 band' && why(lo2) === 'r5 band', 'rule 5: non-fallback beaconDist 509 (real geometry) is rejected as r5 band')
  ok(validateCave(a510).ok && validateCave(b510).ok, 'rule 5: non-fallback beaconDist 510 (real geometry) is accepted')
  ok(why(hi) === 'r5 band', 'rule 5: non-fallback beaconDist 691 (real geometry) is rejected as r5 band')
  ok(validateCave(a690).ok, 'rule 5: non-fallback beaconDist 690 (real geometry) is accepted')
}

// Rule 14b: E4 >= 1.163 * (bd / 4) + minStartE + MARGIN (CG4 §5). Drop zone-4 smalls outside the cluster and outside the last 60 path tiles (so E60,
// hence 14a, is unchanged), one by one, over the 62 seeds. E4 moves in steps of 25, so the coefficient is pinned only by caves whose E4 lands within 3.6 %
// of the bound: E4 in [bound, bound + 0.036 bd / 4) must be accepted, E4 in [bound - 0.036 bd / 4, bound) must be rejected as winnable.
function zone4Resin(): void {
  let accepted = 0, rejected = 0
  for (const s of SEEDS) {
    const r = caveOf(s), I = info(r), bound = 1.163 * (I.bd / 4) + NEED, w = 0.036 * (I.bd / 4)
    const drop = r.pickups.map((p, k) => ({ p, k })).filter(({ p, k }) => k >= 3 && p.kind === 'resin' && p.size === 'small' && zoneIn(I, tileOf(p)) === 4 && I.d[tileOf(p)] < I.bd - 60)
    for (let n = 0; n <= drop.length; n++) {
      const v = copy(r), gone = new Set(drop.slice(0, n).map((d) => d.k))
      v.pickups = v.pickups.filter((_, k) => !gone.has(k))
      const e4 = v.pickups.filter((p) => p.kind === 'resin' && zoneIn(I, tileOf(p)) === 4).reduce((a, p) => a + restore(p), 0)
      if (e4 >= bound && e4 < bound + w) { accepted++; ok(validateCave(v).ok, `rule 14b seed ${s}: E4 ${e4} >= ${bound.toFixed(2)} is accepted`) }
      if (e4 < bound && e4 >= bound - w) { rejected++; ok(why(v) === 'winnable', `rule 14b seed ${s}: E4 ${e4} < ${bound.toFixed(2)} is rejected as winnable (${why(v)})`) }
    }
  }
  ok(accepted >= 1 && rejected >= 1, `rule 14b: fixtures on both sides of the bound (accepted ${accepted}, rejected ${rejected})`)
}

// Rule 14a: min(energyMax, E60) - Z4_E_PER_TILE * L >= NEED, L = max Beacon-to-cluster path length. Move one cluster resin onto the main path at
// dist bd - 40 (the far end of the cluster window, path distance 40 to the Beacon) so that L = 40; bd - 39 gives L = 39 and is the control.
// With E60 >= 100 the margin is 100 - 1.15 L - 55: 55.15 at L = 39 (accepted), 54 at L = 40 (rejected).
function clusterReach(): void {
  ok(T.flame.energyMax === 100 && Z4_E_PER_TILE === 1.15 && NEED === 55, 'rule 14a: constants energyMax 100, Z4_E_PER_TILE 1.15, minStartE + MARGIN 55')
  let found = 0
  for (const s of SEEDS) {
    const r = caveOf(s), I = info(r)
    for (let k = 0; k < 3 && found === 0; k++) {
      const moved = (dist: number): CaveResult => { const v = copy(r), t = I.main[dist]; v.pickups[k] = { ...v.pickups[k], ...px(t) }; return v }
      // Search filter via validateCave is not circular here: positions are fixed by path distance (bd - 39 / bd - 40); the filter only skips cluster
      // items whose control is rejected for another reason, and `found === 1` plus the 'winnable' assert fail if the far case is wrongly accepted.
      const near = moved(I.bd - 39), far = moved(I.bd - 40)
      if (!validateCave(near).ok || validateCave(far).ok) continue
      found++
      ok(Math.min(T.flame.energyMax, near.pickups.filter((p) => p.kind === 'resin' && I.d[tileOf(p)] >= I.bd - 60).reduce((a, p) => a + restore(p), 0)) >= 100, `rule 14a seed ${s}: E60 >= 100`)
      ok(why(far) === 'winnable', `rule 14a seed ${s}: cluster resin ${k} at Beacon path distance 40 is rejected as winnable`)
    }
    if (found) break
  }
  ok(found === 1, 'rule 14a: a seed exists whose cluster resin can sit at path distance 39 (accepted) and 40 (rejected)')
}

// Rule 11: pickups <= 60 (CG4 §5). Pad a valid cave with small resin on wide floor, >= 10 (Chebyshev) from every resin, outside the Beacon mask,
// dist >= 6, so the count is the only rule that can fire; 60 is accepted, 61 is rejected.
function pickupCeiling(): void {
  const r = caveOf(1), I = info(r), mask = new Set(r.chamber), v = copy(r)
  const base = v.pickups.find((p) => p.kind === 'resin' && p.size === 'small')!
  for (let i = 0; i < W * H && v.pickups.length < 61; i++) {
    if (I.g[i] || !I.wide2[i] || I.d[i] < 6 || mask.has(i) || v.pickups.some((p) => p.kind === 'resin' && Math.max(Math.abs(tileOf(p) % W - i % W), Math.abs(Math.floor(tileOf(p) / W) - Math.floor(i / W))) < 10)) continue
    v.pickups.push({ ...base, id: 0, ...px(i) })
    if (v.pickups.length === 60) ok(validateCave(v).ok, 'rule 11: exactly 60 pickups are accepted')
  }
  ok(v.pickups.length === 61, 'rule 11: fixture padded to 61 pickups')
  ok(why(v) === 'r11 counts', 'rule 11: 61 pickups are rejected as r11 counts')
  ok(r.pickups.length < 60, 'rule 11: deep copy leaves the source cave untouched')
  const m = copy(r) // each mineral >= 1 vein: relabel every strontium vein as sodium, the vein count stays the same
  m.veins.forEach((x) => { if (x.mineral === 'strontium') x.mineral = 'sodium' })
  ok(m.veins.length === r.veins.length && validateCave(r).ok && why(m) === 'r11 counts', 'rule 11: a cave without any strontium vein is rejected as r11 counts')
}

// Non-cluster small resin that no other rule depends on: k >= 3, dist 21..bd - 61 (outside T1 and the E60 window), zones 1-3 (E4 unchanged).
const spare = (r: CaveResult): number[] => {
  const I = info(r)
  return r.pickups.map((p, k) => ({ p, k })).filter(({ p, k }) => k >= 3 && p.kind === 'resin' && p.size === 'small' && I.d[tileOf(p)] > 20 && I.d[tileOf(p)] < I.bd - 60 && zoneIn(I, tileOf(p)) !== 4).map(({ k }) => k)
}
const keep = (r: CaveResult, drop: Set<number>): CaveResult => { const v = copy(r); v.pickups = v.pickups.filter((_, k) => !drop.has(k)); return v }

// Rule 11 boundaries (CG2 §6.1 / CG4 §5 row 11: resin >= 24, large resin >= 4, veins <= 80), each with the accepted control one step inside the bound.
// The dropped pickups sit in zones 1-3 outside the cluster, T1 and the last 60 path tiles, so rule 11 is the only rule that can fire.
function countBounds(): void {
  const r = caveOf(1), I = info(r), nResin = r.pickups.filter((p) => p.kind === 'resin').length
  const bigs = r.pickups.map((p, k) => ({ p, k })).filter(({ p, k }) => k >= 3 && p.kind === 'resin' && p.size === 'large' && zoneIn(I, tileOf(p)) !== 4).map(({ k }) => k)
  ok(bigs.length === 3 && r.pickups.filter((p) => p.size === 'large').length === 6, 'rule 11: seed 1 has 3 droppable large resin outside zone 4 (6 large in total)')
  const four = keep(r, new Set(bigs.slice(0, 2))), three = keep(r, new Set(bigs))
  ok(four.pickups.filter((p) => p.size === 'large').length === 4 && validateCave(four).ok, 'rule 11: exactly 4 large resin (the spec minimum) are accepted')
  ok(three.pickups.filter((p) => p.size === 'large').length === 3 && why(three) === 'r11 counts', 'rule 11: 3 large resin (< 4) are rejected as r11 counts')
  const sm = spare(r)
  ok(nResin === 33 && sm.length >= 10, 'rule 11: seed 1 has 33 resin and >= 10 spare small resin')
  const n24 = keep(r, new Set(sm.slice(0, nResin - 24))), n23 = keep(r, new Set(sm.slice(0, nResin - 23)))
  ok(n24.pickups.filter((p) => p.kind === 'resin').length === 24 && validateCave(n24).ok, 'rule 11: exactly 24 resin (the spec minimum) are accepted')
  ok(n23.pickups.filter((p) => p.kind === 'resin').length === 23 && why(n23) === 'r11 counts', 'rule 11: 23 resin (< 24) are rejected as r11 counts')
  // veins <= 80: pad with sodium veins (wall tile 4-adjacent to a reachable floor stand, dist >= 6, outside the Beacon mask, vein tiles >= 4 apart)
  const v = copy(r), mask = new Set(r.chamber), id = r.veins.length
  for (let i = 0; i < W * H && v.veins.length < 81; i++) {
    if (I.g[i] || I.d[i] < 6 || mask.has(i)) continue
    const wt = [i - W, i + W, i - 1, i + 1].find((t) => I.g[t] === 1 && t % W > 0 && t % W < W - 1 && v.veins.every((x) => chebT(x.tile, t) >= 4))
    if (wt === undefined) continue
    v.veins.push({ id: id + v.veins.length, mineral: 'sodium', tile: wt, stand: i, pieces: 1 })
    if (v.veins.length === 80) ok(validateCave(v).ok, 'rule 11: exactly 80 veins (the spec maximum) are accepted')
  }
  ok(v.veins.length === 81 && why(v) === 'r11 counts', 'rule 11: 81 veins (> 80) are rejected as r11 counts')
}

// Rule 10 (CG2 §3.3): resin <-> resin >= 10 Chebyshev outside the cluster; pickups need wide2 floor. One resin is added (or moved) onto a tile whose
// nearest other resin is exactly 9 (rejected) or 10 (accepted) away, resp. onto a wide2 / non-wide2 floor tile.
function spacing(): void {
  const r = caveOf(1), I = info(r), mask = new Set(r.chamber)
  const near = (v: CaveResult, i: number): number => Math.min(...v.pickups.filter((p) => p.kind === 'resin').map((p) => chebT(tileOf(p), i)))
  const at = (v: CaveResult, wide: boolean, gap: number, atLeast = false): number => {
    for (let i = 0; i < W * H; i++) if (!I.g[i] && !!I.wide2[i] === wide && I.d[i] >= 6 && !mask.has(i) && (atLeast ? near(v, i) >= gap : near(v, i) === gap)) return i
    throw new Error(`cave check: no tile with wide2 ${wide} and resin gap ${gap}: regenerate fixtures`)
  }
  const add = (i: number): CaveResult => { const v = copy(r); v.pickups.push({ ...v.pickups[5], id: 0, ...px(i) }); return v }
  ok(r.pickups[5].kind === 'resin' && r.pickups[5].size === 'small', 'rule 10: pickups[5] is a small resin (template for the added one)')
  ok(validateCave(add(at(r, true, 10))).ok, 'rule 10: a resin exactly 10 tiles (Chebyshev) from the nearest resin is accepted')
  ok(why(add(at(r, true, 9))) === 'r10 resin gap', 'rule 10: a resin exactly 9 tiles from the nearest resin is rejected as r10 resin gap')
  const k = spare(r)[0], moved = (i: number): CaveResult => { const v = copy(r); v.pickups[k] = { ...v.pickups[k], ...px(i) }; return v }
  const gone = keep(r, new Set([k]))
  ok(validateCave(moved(at(gone, true, 12))).ok, 'rule 10: a resin moved onto a wide2 floor tile is accepted (control)')
  const thin = at(gone, false, 10, true) // gap >= 10 and not wide2: only the wide2 rule can fire
  ok(why(moved(thin)) === 'r10 wide2', 'rule 10: a resin on a floor tile without 2-wide clearance is rejected as r10 wide2')
}

// Rule 13 (CG4 §3 / §5 row 13): the cluster is pickups[0..2], each within Chebyshev 10 of a main tile (CG4 §3 'relax once to Chebyshev <= 10').
// Seed 3: pickups[1] moved to a wide2 tile 10 (accepted) / 11 (rejected) tiles from the nearest main tile, dist inside [bd - 40, bd - 8]. The tile is
// selected by geometry alone, the first match in scan order; its gap is asserted before validateCave is.
function clusterRules(): void {
  const r = caveOf(3), I = info(r), mask = new Set(r.chamber)
  ok(validateCave(r).ok && r.pickups[0].size === 'large' && r.pickups[1].size === 'small', 'rule 13: seed 3 is valid with a large-first cluster (control)')
  const sw = copy(r), a = sw.pickups[0]
  sw.pickups[0] = sw.pickups[1]; sw.pickups[1] = a
  // Implementation coupling, not spec wording: validate.ts treats pickups[0..2] as the Beacon cluster with the large one first (CG4 §3 'cluster placed FIRST').
  ok(sw.pickups[0].size === 'small' && why(sw) === 'r13 cluster', 'rule 13 (pins validate.ts coupling: pickups[0..2] = cluster, large first; CG4 §3 cluster placed FIRST): first pickup not large is rejected as r13 cluster')
  const mainGap = (i: number): number => Math.min(...I.main.map((m) => chebT(m, i)))
  const onto = (i: number): CaveResult => { const v = copy(r); v.pickups[1] = { ...v.pickups[1], ...px(i) }; return v }
  const pick = (gap: number): number => {
    for (let i = 0; i < W * H; i++) if (!I.g[i] && I.wide2[i] && !mask.has(i) && I.d[i] >= I.bd - 40 && I.d[i] <= I.bd - 8 && mainGap(i) === gap && r.pickups.every((p, k) => k === 1 || chebT(tileOf(p), i) >= 10)) return i
    throw new Error(`cave check: no cluster tile at main distance ${gap}: regenerate fixtures`)
  }
  const t10 = pick(10), t11 = pick(11)
  ok(mainGap(t10) === 10 && mainGap(t11) === 11, 'rule 13: fixture tiles sit at Chebyshev 10 and 11 from the main path: regenerate fixtures')
  ok(validateCave(onto(t10)).ok, "rule 13: a cluster item exactly 10 tiles from the main path is accepted (CG4 §3 'relax once to Chebyshev <= 10')")
  ok(why(onto(t11)) === 'r13 cluster', "rule 13: a cluster item 11 tiles from the main path is rejected as r13 cluster (CG4 §3 'relax once to Chebyshev <= 10')")
}

export function run(): void {
  fallbackBand()
  classBand()
  countBounds()
  spacing()
  clusterRules()
  zone4Resin()
  clusterReach()
  pickupCeiling()
}
