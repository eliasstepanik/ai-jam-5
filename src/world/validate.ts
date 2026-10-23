// Cave validator: invariants 1-14 of CG2 §6.1 as amended by CG4 §5, R-157 (rule 6 cuts), R-158 (rule 7), R-165.
// Purity: read-only on the CaveResult; every field (wall grid, dist, main, wide2, Beacon mask, distB) is recomputed from the
// tiles string, so the check is independent of the generator's internal state. First failing rule returns its stable `why` id.
import type { CaveResult } from '../core/types.ts'
import { MAP_H, MAP_W, TILE } from '../core/state.ts'
import { depthOf, zoneOfDepth } from '../core/score.ts'
import { T } from '../core/tuning.ts'
import { bfs4 } from './bfs.ts'
import { beaconRoomMask } from './gen/places.ts'
import { BD_BASE, PARAMS, scaledMin } from './gen/params.ts'
import type { CaveParams } from './gen/params.ts'
import { buildMain, buildWide2 } from './gen/pockets.ts'
import { MARGIN, SAFE_START, Z4_E_PER_TILE } from './gen/resin.ts'

export { MARGIN, Z4_E_PER_TILE }

type Verdict = { ok: boolean; why: string }
const FAIL = (why: string): Verdict => ({ ok: false, why })

// The ONLY read of the Beacon distance band (R-164): the class band, fallback floor p.fbLo = min(floor(0.9 * lo), 459), CG4 §5.
const bandOf = (res: CaveResult, p: CaveParams): readonly [number, number] =>
  res.stats.fallback ? [p.fbLo, p.bdHi] : [p.bdLo, p.bdHi]

const CLUSTER = 3 // pickups[0..2] = Beacon cluster, large first (populate hand-over)
const CUT_FRACTIONS = [0.25, 0.5, 0.75] // R-157
const CUT_R = 9 // rule 6 slice box radius, Chebyshev tiles from the cut tile (R-157 GAP, see cutKeepsBeacon)
// ponytail: R-157 leaves the cut footprint open; R=9 is the largest box radius that passes all 62 cave-check cores
// (R=10 rejects core seed 2). Multi-attempt measurement, attempts 0..3 over ~40 seeds: rule 6 falsely rejects 2/136
// non-null results (seed 29 attempt 1, seed 5 attempt 3); a false reject costs one of 8 attempts, P(all 8 fail) is
// negligible. Upgrade: derive the radius from corridor width
// class-3 absolute minimums (CG4 §5); the four minimums scale with the Beacon distance via scaledMin (R-164), the two caps stay absolute
const MIN_RESIN = 24, MIN_LARGE = 4, MIN_PLANTS = 6, MIN_VEINS = 24, MAX_PICKUPS = 60, MAX_VEINS = 80
const GAP = { resin: 10, cluster: 3, plant: 12, vein: 4 } as const // CG2 §3.3
const T1_DIST: readonly [number, number] = [7, 20], T2_DIST: readonly [number, number] = [8, 40]
const T3_MAX_DIST = 66, T4_DIST: readonly [number, number] = [14, 40], T4_EUCLID: readonly [number, number] = [8, 16] // widest ranges placeTeach can produce
const E4_PER_BD = 1.163 // mid zone-4 E per path tile (CG4 §5)

const inRange = (v: number, r: readonly [number, number]): boolean => v >= r[0] && v <= r[1]
const cheb = (w: number, a: number, b: number): number =>
  Math.max(Math.abs(a % w - b % w), Math.abs(Math.floor(a / w) - Math.floor(b / w)))
// Pickup/spawn world px -> tile index, -1 off the map.
const tileAt = (x: number, y: number): number => {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE)
  return tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? -1 : ty * MAP_W + tx
}
const allGap = (w: number, tiles: readonly number[], gap: number): boolean => {
  for (let a = 0; a < tiles.length; a++) for (let b = a + 1; b < tiles.length; b++) if (cheb(w, tiles[a], tiles[b]) < gap) return false
  return true
}

// R-157: wall the dist-band slice at m: ALL floor tiles (connected to m or not) with |dist - dist[m]| <= 1 inside the Chebyshev box of
// radius CUT_R around m, then BFS again from the entrance. R-157 leaves the footprint radius a GAP; resolved to CUT_R = 9, the smallest
// radius where all 62 real seeds (56 populate results + 6 teach-null cores) pass and every seed has a cut with detour > 0 (R=8: seed 31
// has none; R=10: core seed 2 fails). One BFS per cut.
function cutKeepsBeacon(g: Uint8Array, t: Uint8Array, dist: Int32Array, m: number, res: CaveResult): boolean {
  const w = MAP_W, blk = g.slice(), mx = m % w, my = (m - mx) / w
  for (let y = Math.max(0, my - CUT_R); y <= Math.min(MAP_H - 1, my + CUT_R); y++) {
    for (let x = Math.max(0, mx - CUT_R); x <= Math.min(w - 1, mx + CUT_R); x++) {
      const i = y * w + x
      if (t[i] && Math.abs(dist[i] - dist[m]) <= 1) blk[i] = 1
    }
  }
  const d = bfs4(blk, w, MAP_H, res.entrance.ty * w + res.entrance.tx)
  return d[res.beacon.ty * w + res.beacon.tx] >= 0
}

export function validateCave(res: CaveResult, p: CaveParams = PARAMS[3]): Verdict {
  const w = MAP_W, h = MAP_H, N = w * h
  // 1 size / alphabet
  if (res.tiles.length !== N) return FAIL('r1 size')
  const t = new Uint8Array(N), g = new Uint8Array(N)
  let floor = 0
  for (let i = 0; i < N; i++) {
    const c = res.tiles.charCodeAt(i) // '#' 35, ',' 44, '.' 46
    if (c === 35) g[i] = 1
    else if (c === 46 || c === 44) { t[i] = c === 44 ? 2 : 1; floor++ } else return FAIL('r1 alphabet')
  }
  // 2 border
  for (let x = 0; x < w; x++) if (t[x] || t[(h - 1) * w + x]) return FAIL('r2 border')
  for (let y = 0; y < h; y++) if (t[y * w] || t[y * w + w - 1]) return FAIL('r2 border')
  // 3 connected
  // range-check tx/ty before any index is computed, so an out-of-range tx cannot wrap into the next row
  const onMap = (p: { tx: number; ty: number }): boolean => Number.isInteger(p.tx) && Number.isInteger(p.ty) && p.tx >= 0 && p.tx < w && p.ty >= 0 && p.ty < h
  if (!onMap(res.entrance)) return FAIL('r4 entrance')
  if (!onMap(res.beacon)) return FAIL('r5 beacon')
  const ent = res.entrance.ty * w + res.entrance.tx, bea = res.beacon.ty * w + res.beacon.tx, bd = res.beaconDist
  if (!t[ent]) return FAIL('r4 entrance')
  const dist = bfs4(g, w, h, ent)
  let reached = 0, maxD = 0
  for (let i = 0; i < N; i++) if (dist[i] >= 0) { reached++; if (dist[i] > maxD) maxD = dist[i] }
  if (reached !== floor) return FAIL('r3 connected')
  // 4 entrance: floor, dist 0, 8 neighbours floor
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!t[ent + dy * w + dx]) return FAIL('r4 entrance')
  // 5 beacon
  if (!t[bea] || dist[bea] !== bd || bd !== maxD) return FAIL('r5 beacon')
  if (!inRange(bd, bandOf(res, p))) return FAIL('r5 band')
  // 6 loops (R-157): at least one of the 25/50/75 % cuts leaves a route to the Beacon
  const main = buildMain(dist, w, ent, bea)
  if (main.length === 0) return FAIL('r6 loops')
  if (!CUT_FRACTIONS.some((p) => cutKeepsBeacon(g, t, dist, main[Math.floor(p * (main.length - 1))], res))) return FAIL('r6 loops')
  // 7 main wide2 (R-158)
  const wide2 = buildWide2(t, w, h), mainMask = new Uint8Array(N)
  for (const m of main) { if (!wide2[m]) return FAIL('r7 wide'); mainMask[m] = 1 }
  // 8 zones monotone along main, first 1, last 4
  let prev = 0
  for (const m of main) {
    const z = zoneOfDepth(depthOf(dist[m], bd))
    if (z < prev || (prev === 0 && z !== 1)) return FAIL('r8 zones')
    prev = z
  }
  if (prev !== 4) return FAIL('r8 zones')
  // 9 items on floor
  const { pickups, veins, spawns } = res
  const pt = pickups.map((p) => tileAt(p.x, p.y))
  for (let k = 0; k < pickups.length; k++) {
    const i = pt[k]
    if (i < 0 || !t[i] || dist[i] < 0 || (pickups[k].kind === 'plant' && t[i] !== 2)) return FAIL('r9 pickup')
  }
  for (const v of veins) {
    const s = v.stand, vt = v.tile
    if (!(s >= 0 && s < N && vt >= 0 && vt < N) || !t[s] || dist[s] < 0 || t[vt]) return FAIL('r9 vein')
    const sx = s % w, vx = vt % w
    if (!((vt === s + w || vt === s - w) || ((vt === s + 1 || vt === s - 1) && Math.abs(sx - vx) === 1))) return FAIL('r9 vein')
  }
  // 10 spacing (§3.3); the Beacon mask exclusion is rule 13
  const st = spawns.map((s) => tileAt(s.x, s.y))
  if (
    pt.some((i) => dist[i] < SAFE_START) ||
    veins.some((v) => dist[v.stand] < SAFE_START) ||
    st.some((i) => i < 0 || dist[i] < SAFE_START)
  ) return FAIL('r10 safe start')
  if (pt.some((i) => !wide2[i])) return FAIL('r10 wide2')
  const resinIdx: number[] = [], plantTiles: number[] = []
  pickups.forEach((p, k) => { if (p.kind === 'resin') resinIdx.push(k); else plantTiles.push(pt[k]) })
  for (let a = 0; a < resinIdx.length; a++) for (let b = a + 1; b < resinIdx.length; b++) {
    const gap = resinIdx[b] < CLUSTER ? GAP.cluster : GAP.resin // resinIdx is ascending, so b < CLUSTER means both are in the cluster
    if (cheb(w, pt[resinIdx[a]], pt[resinIdx[b]]) < gap) return FAIL('r10 resin gap')
  }
  if (!allGap(w, plantTiles, GAP.plant)) return FAIL('r10 plant gap')
  if (!allGap(w, veins.map((v) => v.tile), GAP.vein)) return FAIL('r10 vein gap')
  // 11 counts
  const resin = pickups.filter((p) => p.kind === 'resin')
  // ponytail: the scale basis is max(bd, p.bdLo): a fallback ring may sit below the class band (bd >= p.fbLo) and must still meet the
  // full class-lo minimums, which also keeps class 3 (bdLo 510 >= BD_BASE) byte-identical. Upgrade: scale by the raw bd if short rings need it
  const sb = Math.max(bd, p.bdLo)
  // ponytail: populate places only one large resin per cave below bd 300 (quota rounds to 0), while scaledMin(MIN_LARGE, sb) is 2 from
  // sb 255, so classes 1-2 allow one fewer large resin whenever sb < BD_BASE (class 3, sb >= BD_BASE, unchanged). Upgrade: place 2 large
  // resin per cave in populate when bd < BD_BASE, then drop the allowance
  if (resin.length < scaledMin(MIN_RESIN, sb) || resin.filter((q) => q.size === 'large').length < scaledMin(MIN_LARGE, sb) - (sb < BD_BASE ? 1 : 0) ||
    plantTiles.length < scaledMin(MIN_PLANTS, sb) || veins.length < scaledMin(MIN_VEINS, sb) || pickups.length > MAX_PICKUPS || veins.length > MAX_VEINS ||
    (['sodium', 'copper', 'strontium'] as const).some((m) => !veins.some((v) => v.mineral === m))) return FAIL('r11 counts')
  // 12 teaching T1-T4 (CG2 §4, widest legal ranges)
  const zoneOf = (i: number): number => zoneOfDepth(depthOf(dist[i], bd))
  if (!pickups.some((p, k) => p.kind === 'resin' && p.size === 'small' && mainMask[pt[k]] === 1 && inRange(dist[pt[k]], T1_DIST))) return FAIL('r12 T1')
  if (!veins.some((v) => v.mineral === 'copper' && v.pieces === 2 && zoneOf(v.stand) === 1 && inRange(dist[v.stand], T2_DIST))) return FAIL('r12 T2')
  if (!plantTiles.some((i) => t[i] === 2 && zoneOf(i) === 1 && dist[i] <= T3_MAX_DIST)) return FAIL('r12 T3')
  const lurker = st.some((i, k) => {
    if (spawns[k].kind !== 'lurker') return false
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!t[i + dy * w + dx]) return false
    const e2 = (i % w - res.entrance.tx) ** 2 + (Math.floor(i / w) - res.entrance.ty) ** 2
    return inRange(dist[i], T4_DIST) && e2 >= T4_EUCLID[0] ** 2 && e2 <= T4_EUCLID[1] ** 2
  })
  if (!lurker) return FAIL('r12 T4')
  // 13 Beacon chamber: no item in the mask; cluster = pickups[0..2] (large first), CG4 §1
  // coupling: pickups[0..2] = Beacon cluster is the order gen/populate.ts produces (large first)
  const mask = new Uint8Array(N)
  for (const i of beaconRoomMask(g, w, bea, dist, bd)) mask[i] = 1
  if (pt.some((i) => mask[i]) || veins.some((v) => mask[v.stand]) || st.some((i) => mask[i])) return FAIL('r13 mask item')
  const cl = pickups.slice(0, CLUSTER)
  if (cl.length < CLUSTER || cl.some((p) => p.kind !== 'resin') || cl.filter((p) => p.size === 'large').length !== 1 || cl[0].size !== 'large') return FAIL('r13 cluster')
  for (let k = 0; k < CLUSTER; k++) {
    if (!inRange(dist[pt[k]], [bd - 40, bd - 8]) || main.every((m) => cheb(w, m, pt[k]) > 10)) return FAIL('r13 cluster')
  }
  // 14 winnable (CG4 §5)
  const restore = (p: { size: string }): number => (p.size === 'large' ? T.resin.largeE : T.resin.smallE)
  const distB = bfs4(g, w, h, bea)
  const need = T.beacon.minStartE + MARGIN
  let e60 = 0, e4 = 0, L = 0
  for (let k = 0; k < pickups.length; k++) {
    const p = pickups[k]
    if (p.kind !== 'resin') continue
    if (dist[pt[k]] >= bd - 60) e60 += restore(p)
    if (zoneOf(pt[k]) === 4) e4 += restore(p)
    if (k < CLUSTER) L = Math.max(L, distB[pt[k]])
  }
  if (Math.min(T.flame.energyMax, e60) - Z4_E_PER_TILE * L < need) return FAIL('winnable')
  if (e4 < E4_PER_BD * (bd / 4) + need) return FAIL('winnable')
  return { ok: true, why: '' }
}
