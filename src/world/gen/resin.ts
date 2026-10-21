// Cave generator: shared slot helpers and the whole 'cave:resin' pass (Beacon cluster, chamber bundles, zone resin, rule-14b smalls).
// Spec: docs/architecture-cave-generation-2.md §3.3-§3.4, architecture-cave-generation-4.md §1-§3, R-117, R-153, R-161.
// Purity: operates on the work copies in PopCtx, never mutates them, draws only from the passed Rnd, never reads veins.
import type { Rnd } from '../../core/rng.ts'
import type { Pickup, PickupKind } from '../../core/types.ts'
import { TILE } from '../../core/state.ts'
import { T } from '../../core/tuning.ts'
import type { Fields, Pocket } from './pockets.ts'

export const SAFE_START = 6
export const Z4_E_PER_TILE = 1.15, MARGIN = 15
// Longest Beacon->cluster path for which rule 14a can hold (the cluster alone gives E60 = 100): 39.
// ponytail: cluster candidates limited to distB <= L_MAX (rule 14a needs it; without it 8/62 seeds fail 14a);
// replace by a joint 14a-aware cluster pick if bd/energy tuning changes
export const L_MAX = Math.floor((T.flame.energyMax - T.beacon.minStartE - MARGIN) / Z4_E_PER_TILE)

const TRIES = 24, WINDOW = 8, FRONT = 0.6, MAX_EXTRA = 3
const DENS = { // CG4 §1: density per 100 path tiles, 2-decimal literals, zones 1..4
  nearSmall: [2.0, 2.67, 3.33, 2.67], nearLarge: [0, 0, 0.67, 0.67],
  offSmall: [2.0, 2.0, 1.33, 0.67], offLarge: [0, 0.67, 0.67, 0.67],
} as const
const cnt = (d: readonly number[], bd: number): number[] => d.map((x) => quota(x, bd))

export type PopCtx = {
  w: number; h: number
  t: Uint8Array // work copy: widened, chambers ',' written, T3 carve applied
  dist: Int32Array // work copy, equals bfs4 of t from the entrance
  bd: number // core.beaconDist
  zone: Uint8Array // zoneOfDepth(depthOf(dist[i], bd)) per tile, 0 for wall/unreachable
  f: Fields // the same object teach received
  beaconMask: Uint8Array
  distB: Int32Array // bfs4 from the Beacon on the final grid (cluster L filter)
}

export const quota = (density: number, bd: number): number => Math.floor(density * (bd / 4) / 100 + 0.5 + 1e-9) // R-153

export function cheb(w: number, a: number, b: number): number {
  const ax = a % w, bx = b % w
  return Math.max(Math.abs(ax - bx), Math.abs((a - ax) / w - (b - bx) / w))
}

// picks up to n tiles from cands (index order) with Chebyshev spacing vs taken; 24 tries per slot (CG2 §3.3 verbatim)
export function pickSpaced(rnd: Rnd, w: number, cands: number[], n: number, gap: number, taken: number[]): number[] {
  const out: number[] = []
  for (let k = 0; k < n && cands.length > 0; k++) {
    for (let t = 0; t < 24; t++) {
      const c = cands[rnd.int(0, cands.length - 1)], cx = c % w, cy = (c - cx) / w
      if (taken.every((o) => Math.max(Math.abs(o % w - cx), Math.abs(((o - (o % w)) / w) - cy)) >= gap)) {
        out.push(c); taken.push(c); break
      }
    }
  }
  return out
}

// Front-loaded near-path slot (R-117): always exactly 24 draws (an empty range draws int(0, 0)). `near` = candidate pool of
// the zone (the caller cuts it at 60 % of the zone); range = near tiles with dist in [target - 8, target + 8].
// Best = minimal |dist - target| among tries passing spacing, tie = lowest try index. -1 = empty.
export function nearSlot(rnd: Rnd, c: PopCtx, near: readonly number[], target: number, gap: number, taken: number[]): number {
  const win = near.filter((i) => c.dist[i] >= target - WINDOW && c.dist[i] <= target + WINDOW)
  let best = -1, bestD = Infinity
  for (let k = 0; k < TRIES; k++) {
    const cand = win[rnd.int(0, Math.max(0, win.length - 1))]
    if (cand === undefined || !taken.every((o) => cheb(c.w, o, cand) >= gap)) continue
    const d = Math.abs(c.dist[cand] - target)
    if (d < bestD) { bestD = d; best = cand }
  }
  if (best >= 0) taken.push(best)
  return best
}

// One draw: bob = rnd.next() * 2 PI, right after the tile was chosen. Pixel centre as grid.tileToWorld.
export function mkPickup(c: PopCtx, i: number, kind: PickupKind, size: 'small' | 'large', rnd: Rnd): Pickup {
  const tx = i % c.w, ty = (i - tx) / c.w
  return { id: 0, kind, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, bob: rnd.next() * 2 * Math.PI, size }
}

// 1 where a tile lies within Chebyshev r of a main tile
function mainReach(c: PopCtx, r: number): Uint8Array {
  const m = new Uint8Array(c.t.length)
  for (const x of c.f.main) {
    const mx = x % c.w, my = (x - mx) / c.w
    for (let y = Math.max(0, my - r); y <= Math.min(c.h - 1, my + r); y++) {
      for (let xx = Math.max(0, mx - r); xx <= Math.min(c.w - 1, mx + r); xx++) m[y * c.w + xx] = 1
    }
  }
  return m
}

// Returns the resin pickups WITHOUT the teaching resin t1 (T1 is only taken/zone-1-counted here): cluster first (large, small,
// small), then chamber bundles, zone resin, rule-14b extras. null = cluster or rule 14b failed.
export function placeResin(c: PopCtx, rnd: Rnd, chambers: readonly Pocket[], t1: number): Pickup[] | null {
  const { w, t, dist, zone, f, bd, beaconMask: mask } = c
  const out: Pickup[] = [], tiles: number[] = []
  const add = (i: number, size: 'small' | 'large'): void => { out.push(mkPickup(c, i, 'resin', size, rnd)); tiles.push(i) }

  const cluster = (r: number, lo: number, hi: number): number[] => {
    const reach = mainReach(c, r), cands: number[] = []
    for (let i = 0; i < t.length; i++) {
      if (t[i] > 0 && f.wide2[i] && !mask[i] && reach[i] && c.distB[i] <= L_MAX && dist[i] >= lo && dist[i] <= hi) cands.push(i)
    }
    return pickSpaced(rnd, w, cands, 3, 3, [])
  }
  let cl = cluster(6, bd - 28, bd - 10)
  if (cl.length < 3) cl = cluster(10, bd - 40, bd - 8) // CG4 §3 relax once
  if (cl.length < 3) return null
  cl.forEach((i, k) => add(i, k === 0 ? 'large' : 'small'))
  const taken = [...cl, t1] // cluster pairs gap 3 (above); every other pair gap 10

  const qNS = cnt(DENS.nearSmall, bd), qNL = cnt(DENS.nearLarge, bd), qOS = cnt(DENS.offSmall, bd), qOL = cnt(DENS.offLarge, bd)
  const placedOS = [0, 0, 0, 0], placedOL = [0, 0, 0, 0]
  const ok = (i: number): boolean => t[i] > 0 && !!f.wide2[i] && dist[i] >= SAFE_START && !mask[i]
  const near: number[][] = [[], [], [], []], off: number[][] = [[], [], [], []]
  // near pool is cut at zStart + 60 % of Z: that is the min(target + 8, zStart + 0.6 Z) upper limit of plan-2 §R
  const nearHi = (zi: number): number => Math.ceil(zi * bd / 4) + FRONT * bd / 4
  for (let i = 0; i < t.length; i++) {
    if (zone[i] === 0 || !ok(i)) continue
    if (!f.nearMain[i]) off[zone[i] - 1].push(i)
    else if (dist[i] <= nearHi(zone[i] - 1)) near[zone[i] - 1].push(i)
  }

  // chamber bundles (non-teach chambers in chosen order): large in zones 3-4 while the off-large quota has room, else small
  for (const p of chambers) {
    const zi = p.zone - 1
    const large = p.zone >= 3 && placedOL[zi] < qOL[zi]
    if (!large && placedOS[zi] >= qOS[zi]) continue
    // off-path only (CG4 §1, §2); tile zone = pocket zone, so quotas stay per tile zone
    const got = pickSpaced(rnd, w,
      p.tiles.filter((i) => ok(i) && !f.nearMain[i] && zone[i] === p.zone), 1, 10, taken)
    if (got.length === 0) continue
    add(got[0], large ? 'large' : 'small')
    if (large) placedOL[zi]++; else placedOS[zi]++
  }

  // near slot k of n in zone zi (0-based)
  const slot = (zi: number, k: number): number => {
    const n = qNS[zi] + qNL[zi], Z = bd / 4, zs = Math.ceil(zi * Z), target = zs + (k + 0.5) / n * FRONT * Z
    return nearSlot(rnd, c, near[zi], target, 10, taken)
  }
  const offPath = (zi: number, count: number, size: 'small' | 'large'): void => {
    for (let k = 0; k < count; k++) {
      const got = pickSpaced(rnd, w, off[zi], 1, 10, taken)
      if (got.length > 0) add(got[0], size)
    }
  }
  for (let zi = 0; zi < 4; zi++) {
    const n = qNS[zi] + qNL[zi], kL = Math.floor(n / 2)
    if (qNL[zi] > 0) { const i = slot(zi, kL); if (i >= 0) add(i, 'large') }
    offPath(zi, qOL[zi] - placedOL[zi], 'large')
    for (let k = 0; k < n; k++) {
      if (qNL[zi] > 0 && k === kL) continue
      if (zi === 0 && k === 0) continue // T1 fills zone-1 slot 0
      const i = slot(zi, k); if (i >= 0) add(i, 'small')
    }
    offPath(zi, qOS[zi] - placedOS[zi], 'small')
  }

  // rule 14b: zone-4 energy; add up to 3 zone-4 near smalls on the front-loaded slots k = 0, 1, 2
  const e4 = (): number => tiles.reduce((s, i, k) => s + (zone[i] === 4 ? (out[k].size === 'large' ? T.resin.largeE : T.resin.smallE) : 0), 0)
  const need = 1.163 * (bd / 4) + T.beacon.minStartE + MARGIN
  for (let k = 0; k < MAX_EXTRA && e4() < need; k++) { const i = slot(3, k); if (i >= 0) add(i, 'small') }
  return e4() >= need ? out : null
}
