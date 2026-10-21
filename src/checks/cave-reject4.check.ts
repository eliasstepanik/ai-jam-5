// Cave validator, fix-round-3 negative fixtures (CG4 §7 test 13; quality gate 3 finding "validator clauses with no reject fixture"). Same method as
// cave-reject2.check.ts: every case edits a deep copy of a valid cave, picks its fixture tiles by geometry only (never by validateCave), changes one thing
// so only the intended rule fires, and asserts the stable reject id next to an accepted control one step inside the bound. Thresholds come from the spec
// text, not from validate.ts (R-162):
//   CG2 §3.3 (safe start: no item, vein or spawn with dist < 6), CG2 §6.1 row 13 (mask tiles hold no item), CG2 §4 (T1 [7, 11] widened to [7, 20],
//   T2 copper x2 fallback dist [8, 40] in zone 1, T4 lurker dist [14, 24] widened to [14, 40], Euclid 8..16 tiles from the entrance, devourer/stalker are not T4).
import type { CaveResult, MonsterKind } from '../core/types.ts'
import { MAP_H, MAP_W, TILE } from '../core/state.ts'
import { validateCave } from '../world/validate.ts'
import { caveOf } from './caves.ts'
import { SEEDS, cheb, info, ok, tileOf, zoneIn } from './cave.check.ts'
import type { Info } from './cave.check.ts'

const W = MAP_W, H = MAP_H
const copy = (r: CaveResult): CaveResult => structuredClone(r) // never mutate caveOf memo results
const why = (r: CaveResult): string => validateCave(r).why
const px = (tile: number): { x: number; y: number } => ({ x: (tile % W) * TILE + TILE / 2, y: Math.floor(tile / W) * TILE + TILE / 2 })
const N8 = [-W - 1, -W, -W + 1, -1, 0, 1, W - 1, W, W + 1]
const setTile = (r: CaveResult, i: number, c: string): void => { r.tiles = r.tiles.slice(0, i) + c + r.tiles.slice(i + 1) }
const smallResin = (r: CaveResult): CaveResult['pickups'][number] => r.pickups.find((p) => p.kind === 'resin' && p.size === 'small')!
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
// A plant that cannot be the T3 plant (zone >= 2) and the plants that stay where they are.
function movablePlant(r: CaveResult, I: Info): { k: number; others: number[] } | null {
  const plants = r.pickups.map((p, k) => ({ p, k })).filter(({ p }) => p.kind === 'plant')
  const mv = plants.find(({ p }) => zoneIn(I, tileOf(p)) >= 2)
  return mv ? { k: mv.k, others: plants.filter(({ k }) => k !== mv.k).map(({ p }) => tileOf(p)) } : null
}
// Move that plant onto tile t (painted ',' so rule 9 holds; walls and distances unchanged).
function plantTo(r: CaveResult, k: number, t: number): CaveResult {
  const v = copy(r)
  v.pickups[k] = { ...v.pickups[k], ...px(t) }
  setTile(v, t, ',')
  return v
}
// Append a sodium vein: wall tile 4-adjacent to the stand, >= 4 Chebyshev from every other vein tile (rule 10 vein gap), so rules 9-11 stay quiet.
function addVein(r: CaveResult, I: Info, stand: number): CaveResult | null {
  const wt = [stand - W, stand + W, stand - 1, stand + 1].find((t) => I.g[t] === 1 && t % W > 0 && t % W < W - 1 && r.veins.every((x) => cheb(x.tile, t) >= 4))
  if (wt === undefined) return null
  const v = copy(r)
  v.veins.push({ id: r.veins.length, mineral: 'sodium', tile: wt, stand, pieces: 1 })
  return v
}
// Append an extra spawn of `kind` (a stalker is no T4 lurker, so T4 stays satisfied by the existing lurker).
function addSpawn(r: CaveResult, t: number): CaveResult {
  const v = copy(r)
  v.spawns.push({ kind: 'stalker', ...px(t) })
  return v
}

// Row 13 / rule 10, items. mask tiles hold no item (CG2 §6.1 row 13, §3.3 'nothing inside beaconMask'): a plant (pickup), a stalker spawn, each placed on a
// floor tile of r.chamber (not the Beacon tile) is rejected as r13 mask item; the same item on a tile outside the mask is accepted. The plant is one that
// is not the T3 plant, >= 12 from every other plant, on a wide2 tile in zone >= 2 (the Beacon end), so rules 9, 10 and 12 stay quiet.
function maskItems(): void {
  sweep('rule 13 pickup', (r, I) => {
    const mask = new Set(r.chamber), pl = movablePlant(r, I)
    if (!pl) return false
    const pick = (inside: boolean): number | undefined => firstTile(I, (i) => mask.has(i) === inside && I.wide2[i] === 1 && I.d[i] >= 6 && zoneIn(I, i) >= 2 && pl.others.every((o) => cheb(o, i) >= 12))
    const inT = pick(true), outT = pick(false)
    if (inT === undefined || outT === undefined) return false
    ok(validateCave(plantTo(r, pl.k, outT)).ok, `rule 13: a plant outside the Beacon mask is accepted (${why(plantTo(r, pl.k, outT))}); regenerate fixtures`)
    ok(why(plantTo(r, pl.k, inT)) === 'r13 mask item', `rule 13: a plant inside the Beacon mask is rejected as r13 mask item (${why(plantTo(r, pl.k, inT))}); regenerate fixtures`)
    return true
  })
  sweep('rule 13 spawn', (r, I) => {
    const mask = new Set(r.chamber)
    const pick = (inside: boolean): number | undefined => firstTile(I, (i) => mask.has(i) === inside && I.d[i] >= 6 && zoneIn(I, i) >= 2)
    const inT = pick(true), outT = pick(false)
    if (inT === undefined || outT === undefined) return false
    ok(validateCave(addSpawn(r, outT)).ok, `rule 13: a spawn outside the Beacon mask is accepted (${why(addSpawn(r, outT))}); regenerate fixtures`)
    ok(why(addSpawn(r, inT)) === 'r13 mask item', `rule 13: a spawn inside the Beacon mask is rejected as r13 mask item (${why(addSpawn(r, inT))}); regenerate fixtures`)
    return true
  })
}

// Rule 10, safe start (CG2 §3.3: no item, vein or spawn with dist < 6 path tiles; 'teaching ranges start at 7'). One fixture per item kind, each on a tile
// at path distance exactly 6 (accepted) / 5 (rejected as r10 safe start): the plant is a non-T3 plant moved onto a wide2 ','
// tile outside the mask, >= 12 from the other plants; the vein is a sodium vein on a free wall; the spawn is an extra stalker.
function safeStart(): void {
  const open = (r: CaveResult, I: Info, d: number, extra: (i: number) => boolean): number | undefined => {
    const mask = new Set(r.chamber)
    return firstTile(I, (i) => I.d[i] === d && !mask.has(i) && extra(i))
  }
  sweep('safe start pickup', (r, I) => {
    const pl = movablePlant(r, I)
    if (!pl) return false
    const at = open(r, I, 6, (i) => I.wide2[i] === 1 && pl.others.every((o) => cheb(o, i) >= 12))
    const past = open(r, I, 5, (i) => I.wide2[i] === 1 && pl.others.every((o) => cheb(o, i) >= 12))
    if (at === undefined || past === undefined) return false
    ok(validateCave(plantTo(r, pl.k, at)).ok, `safe start: a plant at dist 6 is accepted (${why(plantTo(r, pl.k, at))}); regenerate fixtures`)
    ok(why(plantTo(r, pl.k, past)) === 'r10 safe start', `safe start: a plant at dist 5 is rejected as r10 safe start (${why(plantTo(r, pl.k, past))}); regenerate fixtures`)
    return true
  })
  sweep('safe start vein', (r, I) => {
    const at = open(r, I, 6, (i) => addVein(r, I, i) !== null), past = open(r, I, 5, (i) => addVein(r, I, i) !== null)
    if (at === undefined || past === undefined) return false
    ok(validateCave(addVein(r, I, at)!).ok, `safe start: a vein standing at dist 6 is accepted (${why(addVein(r, I, at)!)}); regenerate fixtures`)
    ok(why(addVein(r, I, past)!) === 'r10 safe start', `safe start: a vein standing at dist 5 is rejected as r10 safe start (${why(addVein(r, I, past)!)}); regenerate fixtures`)
    return true
  })
  sweep('safe start spawn', (r, I) => {
    const at = open(r, I, 6, () => true), past = open(r, I, 5, () => true)
    if (at === undefined || past === undefined) return false
    ok(validateCave(addSpawn(r, at)).ok, `safe start: a spawn at dist 6 is accepted (${why(addSpawn(r, at))}); regenerate fixtures`)
    ok(why(addSpawn(r, past)) === 'r10 safe start', `safe start: a spawn at dist 5 is rejected as r10 safe start (${why(addSpawn(r, past))}); regenerate fixtures`)
    return true
  })
}

// Row 12, T1 lower bound (CG2 §4: [7, 11], widened to [7, 20]). Same construction as cave-reject2 t1Bound: every small resin on main within dist 21 is
// dropped (k >= 3 keeps the cluster), then one fresh small resin goes on main[at] (main[j] has dist j), >= 10 from every other resin. dist 7 / 6.
function t1Lower(): void {
  const edit = (r: CaveResult, I: Info, at: number): CaveResult | null => {
    const main = new Set(I.main), mask = new Set(r.chamber), t = I.main[at]
    if (I.d[t] !== at || mask.has(t) || !I.wide2[t] || tileUsed(r, t)) return null
    const v = copy(r)
    v.pickups = v.pickups.filter((p, k) => k < 3 || p.kind !== 'resin' || p.size !== 'small' || !main.has(tileOf(p)) || I.d[tileOf(p)] > 21)
    if (v.pickups.some((p) => p.kind === 'resin' && cheb(tileOf(p), t) < 10)) return null
    v.pickups.push({ ...smallResin(r), id: 0, ...px(t) })
    return v.pickups.filter((p) => p.kind === 'resin').length >= 24 ? v : null
  }
  sweep('T1 lower bound', (r, I) => {
    const at = edit(r, I, 7), below = edit(r, I, 6)
    if (!at || !below) return false
    ok(validateCave(at).ok, `T1: the only T1 resin at dist 7 is accepted (${why(at)}); regenerate fixtures`)
    ok(why(below) === 'r12 T1', `T1: the only T1 resin at dist 6 is rejected as r12 T1 (${why(below)}); regenerate fixtures`)
    return true
  })
}
const tileUsed = (r: CaveResult, t: number): boolean => r.pickups.some((p) => tileOf(p) === t) || r.spawns.some((s) => tileOf(s) === t) || r.veins.some((v) => v.stand === t)

// Row 12, T2 upper bound (CG2 §4 fallback: any wall with a floor neighbour, dist in [8, 40], zone 1). Every other 2-piece copper vein is cut to 1 piece
// (still copper, so each mineral keeps a vein and the vein count is unchanged); the first T2 vein moves to a free wall whose stand sits at dist 40 / 41.
function t2Upper(): void {
  const edit = (r: CaveResult, I: Info, at: number): CaveResult | null => {
    const mask = new Set(r.chamber), cu = r.veins.map((v, k) => ({ v, k })).filter(({ v }) => v.mineral === 'copper' && v.pieces === 2)
    if (!cu.length) return null
    const others = r.veins.filter((_, k) => k !== cu[0].k)
    for (let s = 0; s < W * H; s++) {
      if (I.g[s] || I.d[s] !== at || mask.has(s) || zoneIn(I, s) !== 1) continue
      const wt = [s - W, s + W, s - 1, s + 1].find((t) => I.g[t] === 1 && t % W > 0 && t % W < W - 1 && t >= W && t < W * (H - 1) && others.every((x) => cheb(x.tile, t) >= 4))
      if (wt === undefined) continue
      const v = copy(r)
      for (const { k } of cu) v.veins[k].pieces = 1
      v.veins[cu[0].k] = { ...v.veins[cu[0].k], tile: wt, stand: s, pieces: 2 }
      return v
    }
    return null
  }
  sweep('T2 upper bound', (r, I) => {
    const at = edit(r, I, 40), past = edit(r, I, 41)
    if (!at || !past) return false
    ok(validateCave(at).ok, `T2: the only 2-piece copper vein standing at dist 40 is accepted (${why(at)}); regenerate fixtures`)
    ok(why(past) === 'r12 T2', `T2: the only 2-piece copper vein standing at dist 41 is rejected as r12 T2 (${why(past)}); regenerate fixtures`)
    return true
  })
}

// Row 12, T4 (CG2 §4): the lurker stands on a floor tile with 8 floor neighbours, off main, outside the mask, dist in [14, 24] (widened to [14, 40]), Euclid
// 8..16 tiles from the entrance; lurker is the only T4 kind. `edit` drops every lurker and puts one of `kind` on the first tile with dist `d` (range) and
// squared entrance distance `e2` (range). Squared integers keep the 8 / 16 limits exact: 64 and 256 are the inclusive limits, 63 and 257 the first rejects.
function t4Fixtures(): void {
  const edit = (r: CaveResult, I: Info, d: [number, number], e2: [number, number], kind: MonsterKind = 'lurker'): CaveResult | null => {
    const main = new Set(I.main), mask = new Set(r.chamber), ex = r.entrance.tx, ey = r.entrance.ty
    const t = firstTile(I, (i) => {
      const q = (i % W - ex) ** 2 + (Math.floor(i / W) - ey) ** 2
      return I.d[i] >= d[0] && I.d[i] <= d[1] && !main.has(i) && !mask.has(i) && N8.every((o) => !I.g[i + o]) && q >= e2[0] && q <= e2[1]
    })
    if (t === undefined) return null
    const v = copy(r)
    v.spawns = v.spawns.filter((s) => s.kind !== 'lurker')
    v.spawns.push({ kind, ...px(t) })
    return v
  }
  const pair = (label: string, lo: CaveResult | null, bad: CaveResult | null, okMsg: string, badMsg: string): boolean => {
    if (!lo || !bad) return false
    ok(validateCave(lo).ok, `${label}: ${okMsg} is accepted (${why(lo)}); regenerate fixtures`)
    ok(why(bad) === 'r12 T4', `${label}: ${badMsg} is rejected as r12 T4 (${why(bad)}); regenerate fixtures`)
    return true
  }
  const P: [number, number] = [14, 24], F: [number, number] = [14, 40], E: [number, number] = [64, 256]
  sweep('T4 lower bound', (r, I) => pair('T4 dist', edit(r, I, [14, 14], E), edit(r, I, [13, 13], E), 'the only lurker at dist 14', 'the only lurker at dist 13'))
  sweep('T4 Euclid 16', (r, I) => pair('T4 Euclid', edit(r, I, P, [256, 256]), edit(r, I, P, [257, 288]), 'the only lurker at Euclid 16', 'the only lurker at Euclid > 16'))
  // No seed offers squared distance 64 and a reject below 64 together (tile supply), so the exact-8 accept and the <8 reject run on their own seeds;
  // the reject seed carries its own control one step inside (squared distance 64..100).
  sweep('T4 Euclid 8 exact', (r, I) => {
    const lo = edit(r, I, F, [64, 64])
    if (lo) ok(validateCave(lo).ok, `T4 Euclid: the only lurker at Euclid 8 is accepted (${why(lo)}); regenerate fixtures`)
    return lo !== null
  }, 1)
  sweep('T4 Euclid 8', (r, I) => pair('T4 Euclid', edit(r, I, F, [64, 100]), edit(r, I, F, [49, 63]), 'the only lurker at Euclid 8..10', 'the only lurker at Euclid < 8'), 1)
  sweep('T4 kind', (r, I) => {
    const lurker = edit(r, I, P, E), stalker = edit(r, I, P, E, 'stalker'), devourer = edit(r, I, P, E, 'devourer')
    if (!lurker || !stalker || !devourer) return false
    ok(validateCave(lurker).ok, `T4 kind: a lurker on the T4 tile is accepted (${why(lurker)}); regenerate fixtures`)
    ok(why(stalker) === 'r12 T4', `T4 kind: a stalker on the T4 tile is rejected as r12 T4 (${why(stalker)}); regenerate fixtures`)
    ok(why(devourer) === 'r12 T4', `T4 kind: a devourer on the T4 tile is rejected as r12 T4 (${why(devourer)}); regenerate fixtures`)
    return true
  })
}

export function run(): void {
  maskItems()
  safeStart()
  t1Lower()
  t2Upper()
  t4Fixtures()
}
