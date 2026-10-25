// Cave generator, populate step: R-158 widening, rooms, teaching objects, veins, resin (resin.ts), plants, CaveResult assembly.
// Spec: docs/architecture-cave-generation-2.md §2-§4, architecture-cave-generation-4.md §1-§3, R-111, R-152, R-158, R-159.
// Purity: the CaveCore is never written (work copies only); every random draw comes from makeRnd(hashSeed(cs, tag)) made in populate.
// skip empties output arrays (or the room list). For 'veins', 'pickups' and 'spawns' the draws and null decisions of every other
// pass stay identical (R-159); 'rooms' does not keep that guarantee (see the ponytail note in populate).
// DEFAULT deviation 1, import edges not listed in docs/architecture-modules-world.md §3 (populate row): populate.ts also imports
// ../bfs.ts, ./carve.ts, ./places.ts and core/state (MINERALS, TILE), besides pockets, teach, resin and the other core modules.
// resin.ts imports core/state (TILE) as well. validate.ts imports ./gen/resin.ts (Z4_E_PER_TILE, MARGIN, SAFE_START), not populate.ts.
// No cycle: order is pockets -> teach -> resin -> populate; validate imports resin only (of the populate chain).
// DEFAULT deviation 2, attempt count and rejection: stats.attempts is a + 1, so the fallback (populate called with a = 8, R-165)
// reports 9 attempts. widenMain returning null rejects the attempt: populate returns null (ceiling: see the ponytail note in widenMain).
import type { CaveCore, CaveResult, GenOpts, MineralId, Pickup, Vein, Zone } from '../../core/types.ts'
import type { Rnd } from '../../core/rng.ts'
import { hashSeed, makeRnd } from '../../core/rng.ts'
import { MINERALS, TILE } from '../../core/state.ts'
import { depthOf, zoneOfDepth } from '../../core/score.ts'
import { T } from '../../core/tuning.ts'
import { bfs4 } from '../bfs.ts'
import { isEdge } from './carve.ts'
import { beaconRoomMask } from './places.ts'
import { buildFields, findPockets, pickChambers, refreshWide2 } from './pockets.ts'
import type { Fields, Terrain } from './pockets.ts'
import { placeTeach } from './teach.ts'
import { SAFE_START, cheb, mkPickup, pickSpaced, placeResin, quota } from './resin.ts'
import type { PopCtx } from './resin.ts'

export { SAFE_START, pickSpaced } from './resin.ts'

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const // E, S, W, N: all have authored ore overlays
const BLOCKS = [[0, 0], [-1, 0], [0, -1], [-1, -1]] as const // 2x2 blocks containing a tile
const PLANT_GAP = 12, VEIN_GAP = 4, WIDEN_ROUNDS = 3
const DENS = { plants: [1.33, 1.33, 2.0, 2.0], veins: [6.67, 6.0, 5.33, 4.67] } as const // CG4 §1, per 100 path tiles
const PIECES = [1, 1, 2, 2] as const // CG2 §3.1, by zone; a chamber vein always has 2
const WEIGHTS = [[0.55, 0.35, 0.10], [0.45, 0.35, 0.20], [0.35, 0.35, 0.30], [0.30, 0.30, 0.40]] as const // CG2 §3.2

// CG2 §3.2: one draw, cumulative compare in MINERALS order; strontium if float sums stay below u.
export function pickMineral(rnd: Rnd, z: Zone): MineralId {
  const u = rnd.next(), wts = WEIGHTS[z - 1]
  let acc = 0
  for (let k = 0; k < MINERALS.length; k++) { acc += wts[k]; if (u < acc) return MINERALS[k] }
  return MINERALS[MINERALS.length - 1]
}

const wallGrid = (t: Uint8Array): Uint8Array => t.map((v) => (v ? 0 : 1))

// R-158: every main tile must be wide2. Carves the 2x2 block with the fewest walls around each offender (floor only is added,
// R-049), re-BFS, and keeps all old distances. null = a distance changed, the Beacon moved or it did not converge.
function widenMain(core: CaveCore, c: Terrain): Fields | null {
  const { w, h } = core
  let f = buildFields(c)
  for (let round = 0; round <= WIDEN_ROUNDS; round++) {
    if (f.main.every((m) => f.wide2[m])) return f
    // ponytail: at most 3 widening rounds, then the attempt is rejected (null); upgrade: carve a 2-wide corridor along main directly
    if (round === WIDEN_ROUNDS) return null
    const changed: number[] = []
    for (const m of f.main) {
      if (f.wide2[m]) continue
      const mx = m % w, my = (m - mx) / w
      let best: number[] | null = null, bestWalls = 5
      for (const [ox, oy] of BLOCKS) {
        const bx = mx + ox, by = my + oy
        if (isEdge(bx, by, w, h) || isEdge(bx + 1, by, w, h) || isEdge(bx, by + 1, w, h) || isEdge(bx + 1, by + 1, w, h)) continue
        const walls = [by * w + bx, by * w + bx + 1, (by + 1) * w + bx, (by + 1) * w + bx + 1].filter((i) => c.t[i] === 0)
        if (walls.length < bestWalls) { bestWalls = walls.length; best = walls }
      }
      if (!best) return null
      for (const i of best) { c.t[i] = 1; changed.push(i) }
      refreshWide2(f.wide2, c.t, w, h, changed)
    }
    const nd = bfs4(wallGrid(c.t), w, h, core.entrance)
    let top = 0
    for (let i = 0; i < nd.length; i++) {
      if (core.dist[i] >= 0 && nd[i] !== core.dist[i]) return null
      if (nd[i] > top) top = nd[i]
    }
    if (nd[core.beacon] !== core.beaconDist || top > core.beaconDist) return null
    c.dist.set(nd)
    f = buildFields(c)
  }
  return null
}

type VeinRec = { tile: number; stand: number; mineral: MineralId; pieces: number; zone: Zone; teach: boolean }

// 'cave:veins:<z>', zones 1..4. Candidates: interior wall tiles with a usable floor 4-neighbour of zone z (first in E,S,W,N is the stand).
function placeVeins(c: PopCtx, cs: number, chambers: readonly { zone: Zone; tiles: number[] }[], t2: VeinRec): VeinRec[] {
  const { w, h, t, dist, zone, beaconMask } = c
  const out: VeinRec[] = [t2], taken = [t2.tile], bd = c.bd
  for (let z = 1 as Zone; z <= 4; z++) {
    const rnd = makeRnd(hashSeed(cs, 'cave:veins:' + z)), cands: number[] = [], standOf = new Map<number, number>()
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== 0 || isEdge(i % w, (i - (i % w)) / w, w, h)) continue
      const x = i % w, y = (i - x) / w
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (t[j] > 0 && dist[j] >= SAFE_START && !beaconMask[j] && zone[j] === z) { cands.push(i); standOf.set(i, j); break }
      }
    }
    const mine: { tile: number; pieces: number }[] = []
    let placed = z === 1 ? 1 : 0 // the T2 vein counts toward zone 1 (R-165 Q8)
    for (const p of chambers) {
      if (p.zone !== z) continue
      const inside = new Set<number>(p.tiles)
      for (const tile of pickSpaced(rnd, w, cands.filter((i) => inside.has(standOf.get(i)!)), 1, VEIN_GAP, taken)) { mine.push({ tile, pieces: 2 }); placed++ }
    }
    for (const tile of pickSpaced(rnd, w, cands, Math.max(0, quota(DENS.veins[z - 1], bd) - placed), VEIN_GAP, taken)) mine.push({ tile, pieces: PIECES[z - 1] })
    for (const m of mine) out.push({ tile: m.tile, stand: standOf.get(m.tile)!, mineral: pickMineral(rnd, z), pieces: m.pieces, zone: z, teach: false })
  }
  guaranteeMinerals(out)
  return out
}

// CG2 §3.2 guarantee pass (no draw): a missing mineral replaces the last-placed vein (not T2) of the deepest zone with >= 2 veins
// whose own mineral still has >= 2 veins, so the switch never creates a new zero.
// ponytail: guarantee pass only moves a vein whose mineral still has >= 2 veins, skips the T2 vein and looks only at the deepest zone
// with >= 2 veins; if rule 11 rejects attempts for a missing mineral, widen the search to shallower zones
function guaranteeMinerals(veins: VeinRec[]): void {
  for (const m of MINERALS) {
    if (veins.some((v) => v.mineral === m)) continue
    for (let z = 4; z >= 1; z--) {
      const inZone = veins.filter((v) => v.zone === z)
      if (inZone.length < 2) continue
      const swap = inZone.filter((v) => !v.teach).reverse().find((v) => veins.filter((o) => o.mineral === v.mineral).length >= 2)
      if (swap) swap.mineral = m
      break
    }
  }
}

// 'cave:plants': T3 plant (deepest wide2 tile of the teach patch), chamber plants zone 4..1 (>= 12 apart), then quota fill per zone 4..1.
function placePlants(c: PopCtx, cs: number, patch: readonly number[], chambers: readonly { zone: Zone; tiles: number[] }[]): Pickup[] | null {
  const { w, t, dist, zone, f, beaconMask, bd } = c
  const rnd = makeRnd(hashSeed(cs, 'cave:plants')), taken: number[] = [], out: Pickup[] = []
  const deepest = (tiles: readonly number[], dark: boolean): number =>
    tiles.reduce((b, i) => (f.wide2[i] && t[i] > (dark ? 1 : 0) && (b < 0 || dist[i] > dist[b]) ? i : b), -1)
  const add = (i: number): void => { taken.push(i); out.push(mkPickup(c, i, 'plant', 'small', rnd)) }
  const t3 = deepest(patch, false)
  if (t3 < 0) return null
  add(t3)
  for (const p of [...chambers].sort((a, b) => b.zone - a.zone)) {
    const d = deepest(p.tiles, true)
    if (d >= 0 && taken.every((o) => cheb(w, o, d) >= PLANT_GAP)) add(d)
  }
  for (let z = 4; z >= 1; z--) {
    const need = quota(DENS.plants[z - 1], bd) - taken.filter((i) => zone[i] === z).length
    if (need <= 0) continue
    const cands: number[] = []
    for (let i = 0; i < t.length; i++) if (t[i] === 2 && f.wide2[i] && dist[i] >= SAFE_START && !beaconMask[i] && zone[i] === z) cands.push(i)
    for (const i of pickSpaced(rnd, w, cands, need, PLANT_GAP, taken)) out.push(mkPickup(c, i, 'plant', 'small', rnd))
  }
  return out
}

export function populate(core: CaveCore, cs: number, a: number, opts: GenOpts = {}): CaveResult | null {
  const { w, h, beaconDist: bd } = core, skip = opts.skip ?? []
  const c: Terrain = { w, h, t: core.t.slice(), dist: core.dist.slice(), beaconMask: core.beaconMask, beaconDist: bd, entrance: core.entrance, beacon: core.beacon }
  const f = widenMain(core, c)
  if (!f) return null
  const pockets = findPockets(c, f, core.stats.fallback ? T.cave.fallbackPocketDepth : T.cave.pocketDepth)
  // ponytail: skip 'rooms' passes no pockets to pickChambers, which changes the teach plan and everything after it (unlike veins/pickups/spawns,
  // whose draws stay isolated); GenOpts only lists it, no test uses it
  const ch = pickChambers(c, makeRnd(hashSeed(cs, 'cave:rooms')), skip.includes('rooms') ? [] : pockets)
  const teachRnd = makeRnd(hashSeed(cs, 'cave:teach')), plan = placeTeach(c, f, teachRnd, ch.teach)
  if (!plan) return null
  const { t, dist } = c, N = t.length, zone = new Uint8Array(N), grid = wallGrid(t)
  for (let i = 0; i < N; i++) if (t[i] > 0 && dist[i] >= 0) zone[i] = zoneOfDepth(depthOf(dist[i], bd))
  const ctx: PopCtx = { w, h, t, dist, bd, zone, f, beaconMask: core.beaconMask, distB: bfs4(grid, w, h, core.beacon) }
  const t1 = mkPickup(ctx, plan.resin, 'resin', 'small', teachRnd) // 4th draw of the teach stream (bob)
  const rooms = ch.chosen.filter((p) => p !== ch.teach)

  const v = plan.vein
  const veins = placeVeins(ctx, cs, rooms, { tile: v.tile, stand: v.stand, mineral: v.mineral, pieces: v.pieces, zone: 1, teach: true })
  const resin = placeResin(ctx, makeRnd(hashSeed(cs, 'cave:resin')), rooms, plan.resin)
  if (!resin) return null
  const plants = placePlants(ctx, cs, plan.patch, rooms)
  if (!plants) return null

  const pt = (i: number) => ({ tx: i % w, ty: (i - (i % w)) / w })
  const at = (i: number) => ({ x: (i % w) * TILE + TILE / 2, y: Math.floor(i / w) * TILE + TILE / 2 })
  const vein = (r: VeinRec): Vein => ({ id: 0, mineral: r.mineral, tile: r.tile, stand: r.stand, pieces: r.pieces })
  return {
    tiles: Array.from(t, (x) => '#.,'[x]).join(''),
    entrance: pt(core.entrance), exit: pt(core.entrance), beacon: pt(core.beacon), beaconDist: bd,
    chamber: beaconRoomMask(grid, w, core.beacon, dist, bd),
    veins: skip.includes('veins') ? [] : veins.map(vein),
    pickups: skip.includes('pickups') ? [] : [...resin.slice(0, 3), t1, ...resin.slice(3), ...plants], // cluster first (rule 13)
    spawns: skip.includes('spawns') ? [] : [{ kind: 'lurker', ...at(plan.lurker) }],
    stats: { ...core.stats, attempts: a + 1, floor: t.reduce((n, x) => n + (x > 0 ? 1 : 0), 0) },
    rngState: makeRnd(hashSeed(cs, 'cave:spare')).state(),
  }
}
