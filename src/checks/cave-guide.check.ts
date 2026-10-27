// Cave overhaul G1: core/cave-guide.ts guide fields on synthetic grids. Later chunks (G2 purpose, G4 draft, G7b generated caves) append sections below.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { buildGuide, guideFields } from '../core/cave-guide.ts'
import type { GuideFields } from '../core/cave-guide.ts'
import { clearCaches, getDepthField } from '../world/caches.ts'
import { caveOf } from './caves.ts'
import { SEEDS } from './cave.check.ts'
import { CAVE_DRESSING, dressingAt, dressingWall } from '../core/cave-props.ts'
import { POOL_NAMES, WALL_POOL_NAMES, classAt, onRoute, purposeDef, purposeWall } from '../core/cave-purpose.ts'

const ok = (c: boolean, why: string): void => { if (!c) throw new Error('cave guide: ' + why) }

// ---- section 1: synthetic grids ('#' wall, 'E' entrance, 'B' beacon, anything else floor) ----
type Grid = { name: string; rows: string[]; tiles: string; w: number; h: number; e: number; b: number }
function grid(name: string, rows: string[]): Grid {
  const w = rows[0].length, tiles = rows.join('').replace(/[EB]/g, '.')
  ok(rows.every((r) => r.length === w), name + ': ragged rows')
  const flat = rows.join('')
  return { name, rows, tiles, w, h: rows.length, e: flat.indexOf('E'), b: flat.indexOf('B') }
}
const GRIDS: Grid[] = [
  grid('corridor', ['#########', '#E.....B#', '#########']),
  grid('tee', ['#############', '#E.........B#', '###.#########', '###.#########', '###.#########', '###.#########', '###.#########', '#############']),
  grid('loop', ['#########', '#E......#', '#.#####.#', '#.#####.#', '#......B#', '#########']), // two equal routes: main takes the lowest-index parent
  grid('room', ['#########', '#E......#', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#......B#', '#########']),
]
const at = (g: Grid, x: number, y: number): number => y * g.w + x
const build = (g: Grid): GuideFields => buildGuide(g.tiles, g.w, g.h, g.e, g.b)

function brute(g: Grid, from: number): number[] { // independent BFS with an explicit neighbour list
  const d = new Array<number>(g.w * g.h).fill(-1), q = [from]
  d[from] = 0
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % g.w, y = (i - x) / g.w
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * g.w + nx
      if (nx >= 0 && ny >= 0 && nx < g.w && ny < g.h && g.tiles[j] !== '#' && d[j] < 0) { d[j] = d[i] + 1; q.push(j) }
    }
  }
  return d
}

function distances(g: Grid): void {
  const f = build(g), de = brute(g, g.e), db = brute(g, g.b)
  ok(Array.from(f.depth).join() === de.join(), g.name + ': depth equals an independent BFS from the entrance')
  ok(Array.from(f.distB).join() === db.join(), g.name + ': distB equals an independent BFS from the beacon')
  ok(f.beaconDist === de[g.b] && f.depth[g.e] === 0 && f.distB[g.b] === 0, g.name + ': beaconDist and zero anchors')
  for (let i = 0; i < f.depth.length; i++) ok((g.tiles[i] === '#') === (f.depth[i] < 0), g.name + ': depth -1 exactly on walls (grids are connected)')
}

function route(g: Grid): void {
  const f = build(g)
  let n = 0, i = g.b
  for (let k = 0; k < f.main.length; k++) n += f.main[k]
  ok(n === f.beaconDist + 1, g.name + ': main has beaconDist + 1 tiles, got ' + n)
  ok(f.main[g.b] === 1 && f.main[g.e] === 1, g.name + ': main holds beacon and entrance')
  for (let steps = 0; i !== g.e; steps++) {
    ok(steps <= f.beaconDist, g.name + ': descent terminates')
    const x = i % g.w, nb = [i - g.w, i - 1, i + 1, i + g.w].filter((j, k) => j >= 0 && j < f.main.length && (k !== 1 || x > 0) && (k !== 2 || x + 1 < g.w))
    const next = nb.filter((j) => f.main[j] === 1 && f.depth[j] === f.depth[i] - 1)
    ok(next.length === 1, g.name + ': exactly one main step lowers depth by 1 at tile ' + i)
    i = next[0]
  }
  for (let k = 0; k < f.main.length; k++) if (f.main[k]) ok(f.depth[k] + f.distB[k] === f.beaconDist, g.name + ': main tile ' + k + ' lies on a shortest route')
}

function wallDist(g: Grid): void {
  const f = build(g), walls: number[] = []
  for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === '#') walls.push(i)
  for (let i = 0; i < g.tiles.length; i++) {
    const x = i % g.w, y = (i - x) / g.w
    let best = Math.min(x + 1, y + 1, g.w - x, g.h - y)
    for (const j of walls) best = Math.min(best, Math.abs(j % g.w - x) + Math.abs(Math.floor(j / g.w) - y))
    ok(f.wd[i] === (g.tiles[i] === '#' ? 0 : best), g.name + ': wd at tile ' + i + ' is ' + f.wd[i] + ', want ' + (g.tiles[i] === '#' ? 0 : best))
  }
}

function d01(g: Grid): void {
  const f = build(g)
  for (let i = 0; i < f.d01.length; i++) ok(f.d01[i] >= 0 && f.d01[i] <= 1, g.name + ': d01 in [0,1]')
  ok(f.d01[g.e] === 0 && f.d01[g.b] === 1, g.name + ': d01 is 0 at the entrance and 1 at the beacon')
  for (let i = 0; i < f.d01.length; i++) if (f.depth[i] >= 0) ok(f.d01[i] === Math.fround(Math.min(1, f.depth[i] / f.beaconDist)), g.name + ': d01 = depth / beaconDist')
}

function tips(): void {
  const [corridor, tee, loop, room] = GRIDS
  const set = (g: Grid): string => { const t = build(g).deadTip, o: number[] = []; for (let i = 0; i < t.length; i++) if (t[i]) o.push(i); return o.join() }
  ok(set(tee) === String(at(tee, 3, 6)), 'tee: the only dead-end tip is the stem end, got ' + set(tee))
  ok(set(corridor) === '', 'corridor: entrance end and beacon end are not tips, got ' + set(corridor))
  ok(set(loop) === '', 'loop: the loop closure is not a dead end, got ' + set(loop))
  ok(set(room) === '', 'room: open room has no tip, got ' + set(room))
  const stem2 = grid('stem2', ['#############', '#E.........B#', '###..########', '###..########', '###..########', '###..########', '###..########', '#############'])
  ok(set(stem2) === String(at(stem2, 4, 6)), 'stem2: a 2-wide dead end keeps one tip at its far corner, got ' + set(stem2))
}

function room(): void {
  const g = GRIDS[3], f = build(g)
  for (let y = 1; y <= 7; y++) for (let x = 1; x <= 7; x++) ok(f.wd[at(g, x, y)] === Math.min(x, y, 8 - x, 8 - y), 'room: wd grows from the walls at ' + x + ',' + y)
  ok(f.main[at(g, 7, 4)] === 1 && f.main[at(g, 4, 7)] === 0, 'room: ties break to the lowest index (up before left)')
  const l = GRIDS[2], m = build(l)
  ok(m.main[at(l, 7, 2)] === 1 && m.main[at(l, 1, 2)] === 0, 'loop: equal routes, main takes the lowest-index arm (right side)')
}

function same(a: GuideFields, b: GuideFields): boolean {
  return a.beaconDist === b.beaconDist && (['depth', 'distB', 'main', 'wd', 'deadTip', 'd01'] as const).every((k) => a[k].join() === b[k].join())
}

function memo(): void {
  const g = GRIDS[1], a = guideFields(g.tiles, g.w, g.h, g.e, g.b)
  ok(same(a, build(g)) && same(build(g), build(g)), 'tee: deterministic twice, accessor equals the builder')
  ok(guideFields(g.tiles, g.w, g.h, g.e, g.b) === a, 'tee: accessor reuses one build per cave')
  ok(guideFields(g.tiles, g.w, g.h, g.e, g.b + 1) !== a, 'tee: other endpoints rebuild')
  ok(guideFields(GRIDS[0].tiles, GRIDS[0].w, GRIDS[0].h, GRIDS[0].e, GRIDS[0].b).beaconDist === 6, 'corridor: accessor rebuilds for another cave')
}

function metric(): void { // same distances as the world cache the render side already uses
  for (const g of GRIDS) {
    const s: State = init()
    Object.assign(s.world, { w: g.w, h: g.h, tiles: g.tiles, tilesHash: fnv1a(g.tiles), entrance: { tx: g.e % g.w, ty: Math.floor(g.e / g.w) } })
    clearCaches()
    ok(Array.from(getDepthField(s)).join() === Array.from(build(g).depth).join(), g.name + ': depth equals getDepthField')
  }
  clearCaches()
}

function real(): void { // one generated cave: the invariants hold at full size
  const c = caveOf(61), w = 320, e = c.entrance.ty * w + c.entrance.tx, b = c.beacon.ty * w + c.beacon.tx
  const f = guideFields(c.tiles, w, 240, e, b)
  ok(f.beaconDist === c.beaconDist && f.depth[b] === c.beaconDist, 'real: beaconDist matches the generator')
  let n = 0
  for (let i = 0; i < f.main.length; i++) { n += f.main[i]; ok(f.d01[i] >= 0 && f.d01[i] <= 1, 'real: d01 in [0,1]') }
  ok(n === c.beaconDist + 1, 'real: main has beaconDist + 1 tiles')
  ok(same(f, buildGuide(c.tiles, w, 240, e, b)), 'real: accessor equals a fresh build')
}

// ---- section 2 (G2): purposeful props on generated caves ----
type Tally = { slots: number; placed: number; crumbs: number; honest: number; landmarks: number; mainLen: number; byClass: string }
const PURPOSE_SEEDS = SEEDS
const W = 320, H = 240

function tally(seed: number): Tally {
  const c = caveOf(seed), e = c.entrance.ty * W + c.entrance.tx, b = c.beacon.ty * W + c.beacon.tx, f = guideFields(c.tiles, W, H, e, b)
  const t: Tally = { slots: 0, placed: 0, crumbs: 0, honest: 0, landmarks: 0, mainLen: c.beaconDist + 1, byClass: '' }
  const by: Record<string, number> = {}
  for (let y = 1; y < H - 1; y += 3) for (let x = 1; x < W - 1; x += 3) {
    if (dressingAt(c.tiles, W, H, x, y, seed) < 0) continue
    const i = y * W + x, cls = classAt(f, i, seed), def = purposeDef(f, x, y, seed)
    t.slots++
    if (def < 0) continue
    t.placed++
    by[cls] = (by[cls] ?? 0) + 1
    ok(CAVE_DRESSING[def].layer !== 'wall' && (!CAVE_DRESSING[def].water || cls === 'wet'), 'seed ' + seed + ': ' + cls + ' def ' + def + ' is a ground frame, water only for wet')
    if (cls === 'crumb') { t.crumbs++; t.honest += onRoute(f, x, y) ? 1 : 0 }
    if (cls === 'landmark') { t.landmarks++; ok(onRoute(f, x, y), 'seed ' + seed + ': landmarks sit on the main route') }
  }
  t.byClass = Object.keys(by).sort().map((k) => k + ':' + by[k]).join(',')
  return t
}

function pools(): void {
  for (const [cls, names] of Object.entries(POOL_NAMES)) {
    ok(names.length > 0, 'pool ' + cls + ' is not empty')
    for (const n of names) {
      const d = CAVE_DRESSING.find((x) => x.name === n)
      ok(!!d && d.layer !== 'wall', 'pool ' + cls + ': ' + n + ' is a ground frame of CAVE_DRESSING')
      ok(d!.water === (cls === 'wet' && n.includes('puddle')), 'pool ' + cls + ': ' + n + ' water flag')
    }
  }
  for (const n of Object.values(WALL_POOL_NAMES).flat()) ok(CAVE_DRESSING.some((d) => d.name === n && d.layer === 'wall'), 'wall pool: ' + n + ' is a wall frame of CAVE_DRESSING')
}

function purpose(): void {
  const all = PURPOSE_SEEDS.map(tally)
  ok(all.length === SEEDS.length, 'purpose: all ' + SEEDS.length + ' seeds')
  ok(JSON.stringify(all) === JSON.stringify(PURPOSE_SEEDS.map(tally)), 'purpose: deterministic when run twice')
  let crumbs = 0, honest = 0
  all.forEach((t, k) => {
    const seed = PURPOSE_SEEDS[k], share = t.crumbs ? t.honest / t.crumbs : 0, ratio = t.landmarks ? t.mainLen / t.landmarks : Infinity
    ok(t.placed > 0 && t.placed < t.slots, 'seed ' + seed + ': purposeDef thins the slots (' + t.placed + ' of ' + t.slots + ')')
    // ponytail: each cave has only about 5-17 crumbs, so the per-seed share is noisy (0.25..1.00 measured): wide bound, only for caves with >= 5 crumbs; the aggregate below is the real pin. Upgrade: raise the per-seed sample.
    if (t.crumbs >= 5) ok(share >= 0.2 && share <= 1, 'seed ' + seed + ': honest crumb share ' + share.toFixed(3) + ' in [0.2, 1] (' + t.honest + '/' + t.crumbs + ')')
    ok(ratio >= 12 && ratio <= 60, 'seed ' + seed + ': main length / landmarks ' + ratio.toFixed(1) + ' in [12, 60] (' + t.mainLen + '/' + t.landmarks + ')')
    crumbs += t.crumbs; honest += t.honest
  })
  ok(honest / crumbs >= 0.55 && honest / crumbs <= 0.75, 'purpose: aggregated honest crumb share ' + (honest / crumbs).toFixed(3) + ' in [0.55, 0.75] (' + honest + '/' + crumbs + ')')
}

function depthMatch(): void { // guide depth is the metric render's depth01 uses: equals the world cache on 5 generated caves
  for (const seed of PURPOSE_SEEDS.slice(0, 5)) {
    const c = caveOf(seed), s: State = init()
    Object.assign(s.world, { w: W, h: H, tiles: c.tiles, tilesHash: fnv1a(c.tiles), entrance: c.entrance, beacon: c.beacon, beaconDist: c.beaconDist })
    clearCaches()
    const f = guideFields(c.tiles, W, H, c.entrance.ty * W + c.entrance.tx, c.beacon.ty * W + c.beacon.tx), d = getDepthField(s)
    ok(f.depth.length === d.length && f.depth.every((v, i) => v === d[i]), 'seed ' + seed + ': guide depth equals getDepthField')
  }
  clearCaches()
}

function walls(): void { // purposeWall: dressingWall gate stays, def comes from the wall pools, pure
  const f = guideFields(caveOf(61).tiles, W, H, caveOf(61).entrance.ty * W + caveOf(61).entrance.tx, caveOf(61).beacon.ty * W + caveOf(61).beacon.tx)
  let gated = 0, kept = 0, repl = 0
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (f.depth[y * W + x] >= 0) continue
    const base = dressingWall(x, y, 61), d = purposeWall(f, x, y, 61)
    ok(d === purposeWall(f, x, y, 61), 'walls: deterministic at ' + x + ',' + y)
    if (!base) { ok(d === null, 'walls: no wall prop where dressingWall has none'); continue }
    gated++
    if (d) { ok(d.layer === 'wall', 'walls: wall frame only'); if (d === base) kept++; else repl++ }
  }
  ok(gated > 0 && kept > 0 && repl > 0 && kept + repl < gated, 'walls: gate ' + gated + ', kept ' + kept + ', remapped ' + repl + ' (some rejected, some remapped)')
}

export function run(): void {
  for (const g of GRIDS) { distances(g); route(g); wallDist(g); d01(g) }
  tips()
  room()
  memo()
  metric()
  real()
  pools()
  depthMatch()
  purpose()
  walls()
  console.log('cave-guide: ok (' + GRIDS.length + ' synthetic grids + 1 generated cave + purpose on ' + PURPOSE_SEEDS.length + ' seeds)')
}
