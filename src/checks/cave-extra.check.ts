// Cave generator check, part 2: CG4 §7 tests 6, 9-15 (tests 1-5, 7, 8 live in cave.check.ts; split by test number to stay under 300 lines).
// Written from the spec text and exported signatures only (R-162). Rulings used: R-159 (test 10 on ONE carveCore), R-163/R-165 (fallback ring),
// R-109/R-110 (macro draw counts), R-114 (reject budget), R-041 (CHECK_HEAVY read inside run()), R-048 (heavy fallback rate).
import type { CaveResult } from '../core/types.ts'
import type { Rnd } from '../core/rng.ts'
import { init, MAP_H, MAP_W } from '../core/state.ts'
import { fnv1a, hashSeed, makeRnd, step32 } from '../core/rng.ts'
import { depthOf, zoneOfDepth } from '../core/score.ts'
import { T } from '../core/tuning.ts'
import { bfs4 } from '../world/bfs.ts'
import { clearCaches, getBeaconRoom, getDepthField, zoneAt } from '../world/caches.ts'
import { carveCore, caveSeed, finalizeCave, generateCave } from '../world/generate.ts'
import { fallbackCave } from '../world/gen/fallback.ts'
import { isEdge } from '../world/gen/carve.ts'
import { noiseFill, smooth, widen, fixDiagonals } from '../world/gen/ca.ts'
import { CELL_FLOOR_MIN, ECC_MAX, ECC_MIN, MH, MW, buildMacro, carveSpine, macroCellOf } from '../world/gen/macro.ts'
import type { MacroLayout } from '../world/gen/macro.ts'
import { buildFields, findPockets } from '../world/gen/pockets.ts'
import { placeEntrance } from '../world/gen/places.ts'
import { pickLoopPairs, hasAlternativeRoute } from '../world/gen/loops.ts'
import { largestRegion } from '../world/gen/region.ts'
import { populate } from '../world/gen/populate.ts'
import { validateCave } from '../world/validate.ts'
import { caveOf } from './caves.ts'
import { SEEDS, cluster, eq, info, ok, tileOf } from './cave.check.ts'

const W = MAP_W, H = MAP_H
const stream = (cs: number, tag: string): Rnd => makeRnd(hashSeed(cs, 'cave:' + tag))
const seeds20 = Array.from({ length: 20 }, (_, i) => i + 1)

// ',' tiles grouped into 4-connected components.
function commaParts(r: CaveResult): number[][] {
  const seen = new Set<number>(), out: number[][] = []
  for (let i = 0; i < r.tiles.length; i++) {
    if (r.tiles[i] !== ',' || seen.has(i)) continue
    const comp: number[] = [], q = [i]
    seen.add(i)
    while (q.length) {
      const c = q.pop()!
      comp.push(c)
      for (const j of [c + 1, c - 1, c + W, c - W]) if (r.tiles[j] === ',' && !seen.has(j)) { seen.add(j); q.push(j) }
    }
    out.push(comp)
  }
  return out
}

// test 6: fallback valid (20 seeds; R-163: the ring is the fixed A = 0 set, 0 draws, so it is identical for every seed); forceFail returns it
function fallbackValid(): void {
  const ring = fallbackCave(0) // the fixed A = 0 set
  for (const s of seeds20) {
    const r = fallbackCave(s), I = info(r), tag = `fallback seed ${s}: `
    ok(validateCave(r).ok && r.stats.fallback === true, tag + 'valid, stats.fallback')
    ok(r.beaconDist >= 459 && r.beaconDist <= 690 && I.d[I.b] === r.beaconDist, tag + 'beaconDist in [459, 690] and = BFS')
    ok(r.stats.attempts === 9, tag + 'populate attempt 8 (R-165) gives stats.attempts 9')
    cluster(r, I, 'fallback seed ' + s)
    // R-163: fixed geometry, 0 draws. Only populate's dark rooms / carved teaching patch (CG2 §4) vary with the seed, so compare the ring's anchors.
    eq([r.entrance, r.beacon, r.beaconDist], [ring.entrance, ring.beacon, ring.beaconDist], tag + 'entrance, Beacon and beaconDist are seed-independent')
    ok(Math.abs(r.stats.floor - ring.stats.floor) <= 16, tag + 'floor count differs only by the carved teaching patch')
    const f = generateCave(s, { forceFail: true })
    ok(f.stats.fallback && f.tiles === r.tiles && f.stats.attempts === 9, tag + 'forceFail returns the fallback')
    eq([f.pickups, f.veins, f.spawns, f.rngState], [r.pickups, r.veins, r.spawns, r.rngState], tag + 'forceFail placement = fallbackCave')
    ok(f.stats.mainLoop === hasAlternativeRoute(I.g, W, H, I.e, I.b) && f.stats.mainLoop, tag + 'finalizeCave sets mainLoop on the fallback ring (a real bypass)')
  }
  ok(fallbackCave(0).rngState !== fallbackCave(1).rngState, 'fallback placement streams differ per seed (cave:fallback)')
}

// test 9: cache agreement. startRun is not on master yet: this loads the generated cave into State the way startRun does (tiles, hash, run id).
function cacheAgreement(): void {
  const r = caveOf(42), I = info(r), s = init()
  Object.assign(s.world, { tiles: r.tiles, tilesHash: fnv1a(r.tiles), entrance: r.entrance, exit: r.entrance, beacon: r.beacon, beaconDist: r.beaconDist })
  s.meta.runId = 1
  clearCaches()
  const depth = getDepthField(s)
  ok(depth instanceof Int32Array && depth.length === W * H, 'getDepthField is an Int32Array of w*h')
  ok(depth.every((v, i) => v === I.d[i]), 'getDepthField equals the BFS dist of the generated tiles')
  const rnd = makeRnd(9)
  for (let k = 0; k < 500; k++) {
    const i = rnd.int(0, W * H - 1)
    ok(zoneAt(s, i) === zoneOfDepth(depthOf(depth[i], r.beaconDist)), 'zoneAt matches zoneOfDepth(depthOf(d, bd)) at tile ' + i)
  }
  const room = getBeaconRoom(s), set = new Set(r.chamber)
  ok(room.every((v, i) => (v === 1) === set.has(i)), 'getBeaconRoom set bits equal CaveResult.chamber')
  clearCaches()
}

// test 10 (R-159): sub-stream isolation on ONE shared carveCore result per seed; generateCave is not called twice (rule 11 would force the fallback)
function isolation(): void {
  const picked = SEEDS.filter((s) => caveOf(s).stats.attempts === 1).slice(0, 3) // attempt 0 carves AND populates
  ok(picked.length === 3, 'three attempt-0 seeds for test 10')
  for (const seed of picked) {
    const cs = caveSeed(seed, 0), core = carveCore(cs)
    if (!core) throw new Error(`cave check: seed ${seed}: attempt 0 must carve`)
    const snapT = core.t.slice(), snapD = core.dist.slice() // ONE shared core for every populate call below (R-159)
    const full = populate(core, cs, 0), again = populate(core, cs, 0)
    if (!full || !again) throw new Error(`cave check: seed ${seed}: attempt 0 must populate`)
    eq(full, again, `seed ${seed}: populate is pure in (core, cs, a)`)
    eq(finalizeCave(full), caveOf(seed), `seed ${seed}: finalizeCave(populate) is the accepted cave`)
    ok(core.t.every((v, i) => v === snapT[i]) && core.dist.every((v, i) => v === snapD[i]), `seed ${seed}: populate does not mutate the core`)
    const nv = populate(core, cs, 0, { skip: ['veins'] }), np = populate(core, cs, 0, { skip: ['pickups'] }), ns = populate(core, cs, 0, { skip: ['spawns'] })
    if (!nv || !np || !ns) throw new Error(`cave check: seed ${seed}: skip variants must populate`)
    const kind = (r: CaveResult, k: string) => r.pickups.filter((p) => p.kind === k)
    ok(nv.veins.length === 0 && full.veins.length > 0, `seed ${seed}: skip veins empties only veins`)
    ok(nv.tiles === full.tiles, `seed ${seed}: skip veins keeps tiles`)
    eq([kind(nv, 'resin'), kind(nv, 'plant'), nv.spawns, nv.rngState], [kind(full, 'resin'), kind(full, 'plant'), full.spawns, full.rngState], `seed ${seed}: skip veins keeps resin, plants, spawns`)
    ok(!validateCave(nv).ok, `seed ${seed}: skip veins fails rule 11 (veins >= 24), the reason R-159 exists`)
    ok(np.pickups.length === 0 && np.tiles === full.tiles, `seed ${seed}: skip pickups empties pickups only`)
    eq([np.veins, np.spawns], [full.veins, full.spawns], `seed ${seed}: skip pickups keeps veins and spawns`)
    ok(ns.spawns.length === 0 && ns.tiles === full.tiles, `seed ${seed}: skip spawns empties spawns only`)
    eq([ns.veins, ns.pickups], [full.veins, full.pickups], `seed ${seed}: skip spawns keeps veins and pickups`)
  }
}

// Passes 0-4 of one attempt in CG3 §4 order, from the exported pass functions (independent of carveCore's own bookkeeping).
export type Replay = { L: MacroLayout; g: Uint8Array; keep: number; spanX: number; spanY: number; cells: Int32Array; entranceRow: boolean; rule: string }
export function replay(cs: number): Replay {
  const L = buildMacro(stream(cs, 'macro'), W, H), raw = new Uint8Array(W * H)
  noiseFill(raw, W, H, stream(cs, 'fill'), L.M)
  const g = smooth(raw, W, H)
  carveSpine(g, W, H, L, stream(cs, 'spine'))
  widen(g, W, H); fixDiagonals(g, W, H)
  const { keep } = largestRegion(g, W, H), cells = new Int32Array(MW * MH)
  let x0 = W, x1 = -1, y0 = H, y1 = -1, entranceRow = false
  for (let i = 0; i < g.length; i++) if (!g[i]) {
    const x = i % W, y = Math.floor(i / W)
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    cells[macroCellOf(i, W)]++
    if (y < 18 && macroCellOf(i, W) === L.root) entranceRow = true
  }
  const spanX = x1 - x0 + 1, spanY = y1 - y0 + 1, minCell = Math.min(...cells)
  const rule = keep < 16000 ? 'keep' : spanX < 0.9 * W || spanY < 0.9 * H ? 'bbox' : minCell < CELL_FLOOR_MIN ? 'cellFloor' : !entranceRow ? 'entrance' : ''
  return { L, g, keep, spanX, spanY, cells, entranceRow, rule }
}

// test 11: macro layout, direct on buildMacro (20 seeds)
function macro(): void {
  const pockets: number[][] = [[], [], [], []]
  for (const seed of seeds20) {
    const cs = caveSeed(seed, 0), base = makeRnd(hashSeed(cs, 'cave:macro')), tag = `macro seed ${seed}: `
    let draws = 0
    const rnd: Rnd = { next: () => { draws++; return base.next() }, int: (lo, hi) => { draws++; return base.int(lo, hi) }, state: base.state }
    const L = buildMacro(rnd, W, H)
    ok(draws === 1 + 81 * L.treeDraws + 96 + 47 + L.loops.length, `${tag}'cave:macro' draws ${draws} = 1 + 81 * ${L.treeDraws} + 96 + 47 + ${L.loops.length} (R-110)`)
    if (L.treeDraws < 64) ok(L.loops.length === 2, tag + 'two loop edges unless treeDraws === 64')
    else ok(L.loops.length <= 2, tag + 'R-109: 0-2 loop edges after 64 misses')
    ok(L.edges.length === 47 + L.loops.length, tag + '47 tree edges + loop edges')
    const cellsOf = (e: number): [number, number] => { const a = e < 42 ? Math.floor(e / 7) * 8 + e % 7 : e - 42; return [a, a + (e < 42 ? 1 : 8)] } // R-108
    const isLoop = (e: number): boolean => L.loops.some(([a, b]) => { const [c, d] = cellsOf(e); return a === c && b === d })
    const tree = L.edges.filter((e) => !isLoop(e)), adj: number[][] = Array.from({ length: 48 }, () => [])
    for (const e of tree) { const [a, b] = cellsOf(e); adj[a].push(b); adj[b].push(a) }
    const depth = new Int8Array(48).fill(-1), q = [L.root]
    depth[L.root] = 0
    for (let h = 0; h < q.length; h++) for (const j of adj[q[h]]) if (depth[j] < 0) { depth[j] = depth[q[h]] + 1; q.push(j) }
    ok(tree.length === 47 && q.length === 48, tag + 'tree spans 48 cells with 47 edges')
    ok(L.root >= 0 && L.root < 8, tag + 'root in row 0')
    ok(L.ecc === Math.max(...depth), tag + 'ecc = tree eccentricity from the root')
    ok(L.treeDraws === 64 || (L.ecc >= ECC_MIN && L.ecc <= ECC_MAX), tag + 'ecc window unless treeDraws === 64')
    const free = L.M.reduce((n, v) => n + (v ? 0 : 1), 0)
    ok(free === 48 * 1024 + 64 * L.edges.length, tag + 'free tiles of M = 48 * 1024 + 64 * edges')
    if (L.edges.length === 49) ok(free === 52288, tag + 'free tiles of M = 52 288')
    const a = caveOf(seed).stats.attempts - 1, core = carveCore(caveSeed(seed, a))!
    const p = findPockets(core, buildFields(core), T.cave.pocketDepth)
    for (let z = 1; z <= 4; z++) pockets[z - 1].push(p.filter((x) => x.zone === z).length) // R-116: logged, not asserted
  }
  console.log('cave: pockets per zone over 20 seeds, min/mean ' + pockets.map((v, z) => `z${z + 1} ${Math.min(...v)}/${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join(' '))
}

// test 12: mask draw count: noiseFill consumes exactly w*h draws for any mask and writes g = M || edge || r < 0.45
function maskDraws(): void {
  let state = 77
  for (let i = 0; i < W * H; i++) state = step32(state)[0]
  const masks = [new Uint8Array(W * H), new Uint8Array(W * H).fill(1), buildMacro(makeRnd(5), W, H).M, Uint8Array.from({ length: W * H }, (_, i) => (i * 7919) % 13 < 4 ? 1 : 0)]
  for (const [k, M] of masks.entries()) {
    const rnd = makeRnd(77), g = new Uint8Array(W * H), ref = makeRnd(77)
    noiseFill(g, W, H, rnd, M)
    ok(rnd.state() === state, `mask ${k}: noiseFill consumes exactly w*h draws`)
    for (let i = 0; i < g.length; i++) {
      const x = i % W, r = ref.next()
      if (g[i] !== (M[i] || isEdge(x, (i - x) / W, W, H) || r < 0.45 ? 1 : 0)) throw new Error(`cave check: mask ${k}: g[${i}] = M || edge || r < 0.45`)
    }
  }
}

// test 13: rejection rows, for the 62 seeds; R-114: <= 3 of 62 attempt-0 failures from CELL_FLOOR_MIN
function rejection(): void {
  let cellFails = 0, minAll = Infinity
  const rej: string[] = []
  for (const s of SEEDS) {
    const r = caveOf(s), a = r.stats.attempts - 1
    const acc = replay(caveSeed(s, a)), tag = `seed ${s}: `
    ok(acc.rule === '', `${tag}accepted attempt ${a} passes the rejection rows (failed '${acc.rule}')`)
    ok(acc.keep >= 16000 && acc.spanX >= 0.9 * W && acc.spanY >= 0.9 * H, tag + 'keep >= 16000 and bbox >= 90%')
    ok(acc.cells.every((n) => n >= 150), tag + 'every macro cell >= 150 region floor tiles')
    const ei = r.entrance.ty * W + r.entrance.tx
    ok(macroCellOf(ei, W) === acc.L.root && r.entrance.ty < 18, tag + 'entrance inside the root cell with ty < 18')
    const first = a === 0 ? acc : replay(caveSeed(s, 0))
    if (first.rule === 'cellFloor') cellFails++
    if (first.rule !== '') ok(carveCore(caveSeed(s, 0)) === null, `${tag}attempt 0 failing '${first.rule}' is rejected by carveCore`)
    minAll = Math.min(minAll, ...first.cells)
    if (a > 0) rej.push(`${s}:${first.rule || 'later'}`)
  }
  ok(cellFails <= 3, `R-114: CELL_FLOOR_MIN rejects <= 3 of 62 attempt-0 seeds, got ${cellFails}`)
  console.log(`cave: attempt-0 rejections (seed:rule) ${rej.join(' ')}; CELL_FLOOR_MIN fails ${cellFails}, min cell floor ${minAll}`)
}

// test 13b: fixtures found by scanning seeds 61..400 (not in the 62): attempts that must be rejected, and why (CG3 §5 rows, CG4 §5 rules)
// fixtures are tied to current generator output (seeds 70/74/95/116/103/184/119/124): regenerate after any generator retune
function rejectionFixtures(): void {
  const cases: [number, number, string][] = [[70, 0, 'cellFloor'], [74, 1, 'cellFloor'], [95, 1, 'cellFloor'], [116, 0, 'entrance']]
  for (const [seed, a, rule] of cases) {
    ok(replay(caveSeed(seed, a)).rule === rule, `fixture ${seed}/${a} fails the '${rule}' row`)
    ok(carveCore(caveSeed(seed, a)) === null, `fixture ${seed}/${a} is rejected by carveCore`)
  }
  for (const [seed, a] of [[103, 1], [184, 0]]) ok(carveCore(caveSeed(seed, a)) === null, `fixture ${seed}/${a}: Beacon outside [510, 690] is rejected`)
  const r = generateCave(119), core = carveCore(caveSeed(119, 0)), first = core && populate(core, caveSeed(119, 0), 0)
  ok(first !== null && !validateCave(first).ok, 'fixture 119: attempt 0 populates but fails validateCave (invariant 6)')
  ok(r.stats.attempts === 2 && validateCave(r).ok && !r.stats.fallback, 'fixture 119: generateCave rejects attempt 0 and takes attempt 1')
  // validateCave boundaries (CG4 §5 rule 11 and rule 5 band), on a copy of a valid cave: pickups end with the plants, veins start with the T2 vein
  const v = caveOf(1), plants = v.pickups.filter((p) => p.kind === 'plant').length, n = v.pickups.length
  ok(validateCave({ ...v, pickups: v.pickups.slice(0, n - plants + 6) }).ok && !validateCave({ ...v, pickups: v.pickups.slice(0, n - plants + 5) }).ok, 'rule 11: plants >= 6 boundary')
  ok(validateCave({ ...v, veins: v.veins.slice(0, 24) }).ok && !validateCave({ ...v, veins: v.veins.slice(0, 23) }).ok, 'rule 11: veins >= 24 boundary')
  // the 509 / 691 band edges are tested with real geometry in cave-reject.check.ts; here only a lying beaconDist (!= BFS distance) is covered
  ok(validateCave({ ...v, beaconDist: 691 }).why === 'r5 beacon' && validateCave({ ...v, beaconDist: 509 }).why === 'r5 beacon', "rule 5: a beaconDist that differs from the BFS distance is rejected as 'r5 beacon'")
}

// test 14: loop pair filter and shortcut guard, replayed on passes 0-8 of attempt 0
function pairFilter(): void {
  let tunnels = 0
  for (const seed of [...seeds20, 124]) { // 124: a seed whose attempt 0 refuses a tunnel only because of the shortcut guard
    const R = replay(caveSeed(seed, 0))
    if (R.rule !== '') continue
    const cs = caveSeed(seed, 0), e = placeEntrance(R.g, W, H, R.L.root, stream(cs, 'entrance'))
    if (e < 0) continue
    const d0 = bfs4(R.g, W, H, e), dmax0 = Math.max(...d0)
    const L = pickLoopPairs(R.g, W, H, e, R.L, stream(cs, 'tunnels'))
    const edge = new Set<number>()
    for (const k of R.L.edges) { const a = k < 42 ? Math.floor(k / 7) * 8 + k % 7 : k - 42, b = a + (k < 42 ? 1 : 8); edge.add(a * 48 + b); edge.add(b * 48 + a) }
    for (const [u, v] of L.pairs) {
      const cu = macroCellOf(u, W), cv = macroCellOf(v, W)
      ok(cu === cv || edge.has(cu * 48 + cv), `seed ${seed}: tunnel ${u}-${v} joins the same or graph-adjacent macro cells`)
      tunnels++
    }
    if (L.pairs.length > 0) ok(Math.max(...bfs4(R.g, W, H, e)) >= Math.max(510, 0.95 * dmax0), `seed ${seed}: post-tunnel max D >= max(510, 0.95 Dmax0)`)
    const r = caveOf(seed)
    if (r.stats.attempts === 1) ok(r.stats.loops === L.loops && r.stats.tunnelTiles === L.tunnelTiles, `seed ${seed}: replayed pass 8 equals the result stats`)
  }
  ok(tunnels > 0, 'at least one committed tunnel over 20 seeds')
}

// test 15 (R-163): the fallback ring accepts all 6 pockets at fallbackPocketDepth = 5: 6 chamber plants, one per dark room
function fallbackPockets(): void {
  ok(T.cave.fallbackPocketDepth === 5 && T.cave.pocketDepth === 10, 'tuning keys: fallbackPocketDepth 5, pocketDepth 10')
  for (const s of seeds20) {
    const r = fallbackCave(s), I = info(r), tag = `fallback pockets seed ${s}: `
    const plants = r.pickups.filter((p) => p.kind === 'plant'), rooms = commaParts(r)
    ok(plants.length === 6, `${tag}6 plants (the rule-11 minimum, no slack), got ${plants.length}`)
    ok(rooms.length === 6 && rooms.every((c) => plants.filter((p) => c.includes(tileOf(p))).length === 1), tag + '6 dark rooms with one plant each')
    const t = Uint8Array.from(r.tiles, (c) => c === '#' ? 0 : 1), terrain = { w: W, h: H, t, dist: I.d, beaconMask: new Uint8Array(W * H), beaconDist: r.beaconDist, entrance: I.e, beacon: I.b }
    for (const i of r.chamber) terrain.beaconMask[i] = 1
    const f = buildFields(terrain)
    ok(findPockets(terrain, f, T.cave.fallbackPocketDepth).length === 6, tag + 'findPockets at depth 5 accepts all 6 pockets')
    ok(findPockets(terrain, f, T.cave.pocketDepth).length < 6, tag + 'depth 10 would not (R-163 rationale)')
  }
}

export function run(): void {
  fallbackValid() // test 6
  cacheAgreement() // test 9
  isolation() // test 10
  macro() // test 11
  maskDraws() // test 12
  rejection() // test 13
  rejectionFixtures() // test 13, fixtures
  pairFilter() // test 14
  fallbackPockets() // test 15
  // R-041: CHECK_HEAVY is read here, never at import time (no Node types in src)
  if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CHECK_HEAVY === '1') {
    let fb = 0
    for (let s = 1; s <= 200; s++) if (generateCave(s).stats.fallback) fb++
    ok(fb <= 2, `heavy: fallback === false for >= 99% of seeds 1..200, got ${200 - fb}/200`)
    console.log(`cave: heavy fallback rate ${fb}/200`)
  }
}
