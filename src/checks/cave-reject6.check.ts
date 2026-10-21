// Cave validator, fix-round-5 negative fixtures (CG4 §7 test 13; retrospect finding "validator clauses with no reject fixture"). Same method as
// cave-reject2/4.check.ts: every case edits a deep copy of a valid cave (structuredClone), picks its fixture tiles by geometry only (never by validateCave),
// changes one thing so only the intended rule fires, and asserts the exact stable reject id next to an accepted control. Thresholds come from the spec text,
// not from validate.ts (R-162):
//   CG2 §4: T1 small resin on a main tile, dist [7, 11] (fallback [7, 20]); T2 copper vein, 2 pieces, zone 1, stand dist [12, 20] (fallback [8, 40]);
//   T4 lurker on a floor tile with ALL 8 neighbours floor, dist [14, 24].
//   CG2 §3.3 (safe start dist >= 6); CG2 §6.1 row 13 + CG4 §3 (cluster = 1 large + 2 small, dist [bd - 40, bd - 8] after the relaxation, a resin kind) and
//   CG4 §5 row 14a (L <= 39: with energyMax 100, minStartE 40, MARGIN 15 and Z4_E_PER_TILE 1.15, L = 40 gives 100 - 46 = 54 < 55, so 'winnable' fires).
// No fixture on purpose: T3 (cave.check.ts t3Bound pins the plant clause and its 66 / 67 bound); zone-1 clause of T2 (dist <= 40 is always zone 1 because bd >= 459, zone 2 starts at depth 10), `cl.length < 3`
// of row 13 (row 11 already forces >= 24 resin), the zero-large `!== 1` half (row 13's `cl[0]` large clause rejects it too).
import type { CaveResult, MineralId } from '../core/types.ts'
import { MAP_H, MAP_W, TILE } from '../core/state.ts'
import { validateCave } from '../world/validate.ts'
import { caveOf } from './caves.ts'
import { SEEDS, cheb, info, ok, tileOf } from './cave.check.ts'
import type { Info } from './cave.check.ts'

const W = MAP_W, H = MAP_H
const copy = (r: CaveResult): CaveResult => structuredClone(r) // never mutate caveOf memo results
const why = (r: CaveResult): string => validateCave(r).why
const px = (tile: number): { x: number; y: number } => ({ x: (tile % W) * TILE + TILE / 2, y: Math.floor(tile / W) * TILE + TILE / 2 })
const N8 = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1]
const setTile = (r: CaveResult, i: number, c: string): void => { r.tiles = r.tiles.slice(0, i) + c + r.tiles.slice(i + 1) }
const tileUsed = (r: CaveResult, t: number): boolean => r.pickups.some((p) => tileOf(p) === t) || r.spawns.some((s) => tileOf(s) === t) || r.veins.some((v) => v.stand === t)
const accepted = (r: CaveResult, msg: string): void => ok(validateCave(r).ok, `${msg} is accepted (${why(r)}); regenerate fixtures`)
const rejected = (r: CaveResult, id: string, msg: string): void => ok(why(r) === id, `${msg} is rejected as ${id} (${why(r)}); regenerate fixtures`)
// Run `one` over the 62 seeds until it has exercised `want` of them (it returns false when the seed has no geometry for the fixture).
function sweep(label: string, one: (r: CaveResult, I: Info) => boolean, want = 2): void {
  let n = 0
  for (const s of SEEDS) { if (n >= want) break; const r = caveOf(s); if (one(r, info(r))) n++ }
  ok(n >= 1, `${label}: exercised on at least one seed: regenerate fixtures`)
}
// First interior tile (index order) that is floor, off the Beacon tile, and passes `pred`.
function firstTile(I: Info, pred: (i: number) => boolean): number | undefined {
  for (let i = 0; i < W * H; i++) if (!I.g[i] && i !== I.b && pred(i)) return i
  return undefined
}

// Row 12, T4 (CG2 §4): the lurker tile has ALL 8 neighbours floor. The lurker stands on a tile (dist [14, 24], off main, outside the mask, Euclid 8..16 from the
// entrance, so every other T4 clause holds) that has exactly one walled neighbour at offset `wall` (rejected as r12 T4); `null` = no walled neighbour (control).
// One sweep per neighbour offset: a check that skips any of the 8 offsets is caught.
function t4Neighbours(): void {
  const edit = (r: CaveResult, I: Info, wall: number | null): CaveResult | null => {
    const main = new Set(I.main), mask = new Set(r.chamber), ex = r.entrance.tx, ey = r.entrance.ty
    const t = firstTile(I, (i) => {
      const q = (i % W - ex) ** 2 + (Math.floor(i / W) - ey) ** 2, walls = N8.filter((o) => I.g[i + o])
      if (I.d[i] < 14 || I.d[i] > 24 || main.has(i) || mask.has(i) || q < 64 || q > 256) return false
      return wall === null ? walls.length === 0 : walls.length === 1 && walls[0] === wall
    })
    if (t === undefined) return null
    const v = copy(r)
    v.spawns = v.spawns.filter((s) => s.kind !== 'lurker')
    v.spawns.push({ kind: 'lurker', ...px(t) })
    return v
  }
  for (const o of N8) {
    sweep(`T4 walled neighbour ${o}`, (r, I) => {
      const open = edit(r, I, null), shut = edit(r, I, o)
      if (!open || !shut) return false
      accepted(open, 'T4 neighbours: the only lurker with 8 floor neighbours')
      rejected(shut, 'r12 T4', `T4 neighbours: the only lurker with one walled neighbour (offset ${o})`)
      return true
    }, 1)
  }
}

// Row 12, T2 (CG2 §4: copper vein, 2 pieces, stand dist [12, 20], fallback [8, 40], zone 1). Every other 2-piece copper vein is cut to 1 piece (still copper); the
// first one moves to a free wall whose stand sits at dist `at` and gets `mineral` / `pieces`. Null when no copper vein would remain (row 11 would fire).
function t2Edit(r: CaveResult, I: Info, at: number, mineral: MineralId = 'copper', pieces = 2): CaveResult | null {
  const mask = new Set(r.chamber), cu = r.veins.map((v, k) => ({ v, k })).filter(({ v }) => v.mineral === 'copper' && v.pieces === 2)
  if (!cu.length) return null
  const others = r.veins.filter((_, k) => k !== cu[0].k)
  for (let s = 0; s < W * H; s++) {
    if (I.g[s] || I.d[s] !== at || mask.has(s)) continue
    const wt = [s - W, s + W, s - 1, s + 1].find((t) => I.g[t] === 1 && t % W > 0 && t % W < W - 1 && t >= W && t < W * (H - 1) && others.every((x) => cheb(x.tile, t) >= 4))
    if (wt === undefined) continue
    const v = copy(r)
    for (const { k } of cu) v.veins[k].pieces = 1
    v.veins[cu[0].k] = { ...v.veins[cu[0].k], tile: wt, stand: s, mineral, pieces }
    return v.veins.some((x) => x.mineral === 'copper') ? v : null
  }
  return null
}
function t2Fixtures(): void {
  // lower bound: fallback [8, 40]; a stand at dist 7 passes safe start (>= 6), so only T2 can reject it
  sweep('T2 lower bound', (r, I) => {
    const at = t2Edit(r, I, 8), below = t2Edit(r, I, 7)
    if (!at || !below) return false
    accepted(at, 'T2: the only 2-piece copper vein standing at dist 8')
    rejected(below, 'r12 T2', 'T2: the only 2-piece copper vein standing at dist 7')
    return true
  })
  for (const m of ['sodium', 'strontium'] as const) {
    sweep(`T2 mineral ${m}`, (r, I) => {
      const cu = t2Edit(r, I, 16), other = t2Edit(r, I, 16, m)
      if (!cu || !other) return false
      accepted(cu, 'T2: the only 2-piece vein at dist 16 is copper')
      rejected(other, 'r12 T2', `T2: the only 2-piece vein at dist 16 is ${m}, not copper`)
      return true
    })
  }
  sweep('T2 pieces', (r, I) => {
    const two = t2Edit(r, I, 16), one = t2Edit(r, I, 16, 'copper', 1)
    if (!two || !one) return false
    accepted(two, 'T2: the only copper vein at dist 16 carries 2 pieces')
    rejected(one, 'r12 T2', 'T2: the only copper vein at dist 16 carries 1 piece')
    return true
  })
}

// Row 12, T1 (CG2 §4: SMALL resin on a MAIN tile, dist [7, 11], fallback [7, 20]). Every small resin on main within dist 21 is dropped (k >= 3 keeps the
// cluster), then one resin of `size` goes on main[9] (`onMain`) or on the first off-main wide2 tile at dist 9, >= 10 from every other resin. Only that
// resin can be the T1 resin, so the main clause and the small clause are each the single reason for a reject.
function t1Edit(r: CaveResult, I: Info, size: 'small' | 'large', onMain: boolean): CaveResult | null {
  const main = new Set(I.main), mask = new Set(r.chamber)
  const v = copy(r)
  v.pickups = v.pickups.filter((p, k) => k < 3 || p.kind !== 'resin' || p.size !== 'small' || !main.has(tileOf(p)) || I.d[tileOf(p)] > 21)
  const t = onMain ? I.main[9] : firstTile(I, (i) => I.d[i] === 9 && !main.has(i))
  if (t === undefined || I.d[t] !== 9 || mask.has(t) || !I.wide2[t] || tileUsed(r, t)) return null
  if (v.pickups.some((p) => p.kind === 'resin' && cheb(tileOf(p), t) < 10)) return null
  const tpl = r.pickups.find((p) => p.kind === 'resin')!
  v.pickups.push({ ...tpl, id: 0, size, ...px(t) })
  return v.pickups.length <= 60 && v.pickups.filter((p) => p.kind === 'resin').length >= 24 ? v : null
}
function t1Fixtures(): void {
  sweep('T1 main', (r, I) => {
    const on = t1Edit(r, I, 'small', true), off = t1Edit(r, I, 'small', false)
    if (!on || !off) return false
    accepted(on, 'T1: the only small resin at dist 9 stands on the main path')
    rejected(off, 'r12 T1', 'T1: the only small resin at dist 9 stands off the main path')
    return true
  })
  sweep('T1 small', (r, I) => {
    const small = t1Edit(r, I, 'small', true), large = t1Edit(r, I, 'large', true)
    if (!small || !large) return false
    accepted(small, 'T1: the only resin at main dist 9 is small')
    rejected(large, 'r12 T1', 'T1: the only resin at main dist 9 is large')
    return true
  })
}

// Row 13, cluster band (CG4 §3: dist [bd - 40, bd - 8] after the relaxation; §5 row 14a needs L <= 39). pickups[2] (a small cluster resin) moves to the first
// wide2 tile at dist `d` outside the mask, within Chebyshev 10 of main, >= 3 from the other cluster items, >= 10 from the other resin. The upper limit is tested
// at bd - 8 (accepted) / bd - 7 (r13 cluster). The lower limit bd - 40 forces L >= 40 (every Beacon path is >= bd - dist long), so its first failing verdict
// is 'winnable' from row 14a (row 13 let it through) and bd - 41 is rejected earlier as r13 cluster; bd - 39 with distB <= 39 is the accepted control.
function clusterEdit(r: CaveResult, I: Info, d: number): CaveResult | null {
  const mask = new Set(r.chamber), p0 = tileOf(r.pickups[0]), p1 = tileOf(r.pickups[1])
  const t = firstTile(I, (i) => I.d[i] === d && (d <= I.bd - 40 || I.dB[i] <= 39) && !!I.wide2[i] && !mask.has(i) && !tileUsed(r, i) && cheb(p0, i) >= 3 && cheb(p1, i) >= 3 &&
    I.main.some((m) => cheb(m, i) <= 10) && r.pickups.every((p, k) => k < 3 || p.kind !== 'resin' || cheb(tileOf(p), i) >= 10))
  if (t === undefined) return null
  const v = copy(r)
  v.pickups[2] = { ...v.pickups[2], ...px(t) }
  return v
}
function clusterBand(): void {
  sweep('cluster upper band', (r, I) => {
    const at = clusterEdit(r, I, I.bd - 8), past = clusterEdit(r, I, I.bd - 7)
    if (!at || !past) return false
    accepted(at, 'cluster band: a cluster resin at dist bd - 8')
    rejected(past, 'r13 cluster', 'cluster band: a cluster resin at dist bd - 7')
    return true
  })
  sweep('cluster lower band', (r, I) => {
    const near = clusterEdit(r, I, I.bd - 39), edge = clusterEdit(r, I, I.bd - 40), past = clusterEdit(r, I, I.bd - 41)
    if (!near || !edge || !past) return false
    accepted(near, 'cluster band: a cluster resin at dist bd - 39 (distB <= 39)')
    rejected(edge, 'winnable', 'cluster band: a cluster resin at dist bd - 40 (passes row 13, distB >= 40 fails row 14a)')
    rejected(past, 'r13 cluster', 'cluster band: a cluster resin at dist bd - 41')
    return true
  })
}

// Row 13, cluster content (CG4 §3 / §5 row 13: "3 resin, 1 large"). Slots pickups[0..2]: two large resin -> reject; no large resin -> reject (needs a spare large
// elsewhere so row 11 stays quiet); a plant in a cluster slot (repainted ',' so row 9 holds, resin count stays >= 24, plant gap >= 12) -> reject.
function clusterContent(): void {
  sweep('cluster two large', (r) => {
    const v = copy(r)
    v.pickups[2].size = 'large'
    ok(r.pickups.slice(0, 3).filter((p) => p.size === 'large').length === 1, 'cluster content: the unchanged cluster holds exactly one large resin: regenerate fixtures')
    accepted(r, 'cluster content: exactly one large resin in the cluster')
    rejected(v, 'r13 cluster', 'cluster content: two large resin in the cluster')
    return true
  }, 1)
  sweep('cluster no large', (r) => {
    if (r.pickups.filter((p) => p.size === 'large').length < 5) return false
    const v = copy(r)
    v.pickups[0].size = 'small'
    rejected(v, 'r13 cluster', 'cluster content: no large resin in the cluster')
    return true
  }, 1)
  sweep('cluster plant', (r) => {
    const t = tileOf(r.pickups[2]), plants = r.pickups.filter((p) => p.kind === 'plant')
    if (r.pickups.filter((p) => p.kind === 'resin').length < 25 || !plants.every((p) => cheb(tileOf(p), t) >= 12)) return false
    const v = copy(r)
    v.pickups[2].kind = 'plant'
    setTile(v, t, ',')
    accepted(r, 'cluster content: a resin in cluster slot 2')
    rejected(v, 'r13 cluster', 'cluster content: a plant in cluster slot 2')
    return true
  }, 1)
}

export function run(): void {
  t4Neighbours()
  t2Fixtures()
  t1Fixtures()
  clusterBand()
  clusterContent()
}
