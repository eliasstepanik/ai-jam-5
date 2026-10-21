// Cave validator, more negative branches (CG4 §7 test 13, fixtures; quality gate 2 finding "branches without a negative fixture"). Same method as
// cave-reject.check.ts: every case edits a deep copy of a valid cave, picks its fixture tiles by geometry only (never by validateCave), and asserts the
// stable reject id of validateCave next to an accepted control one step inside the bound. Thresholds come from the spec text, not from validate.ts (R-162):
//   CG2 §6.1 row 7 (every main tile wide2), row 13 (mask tiles hold no item), CG2 §3.3 (resin >= 10, plant >= 12, cluster >= 3 Chebyshev),
//   CG2 §4 T1 row (fallback range [7, 20]), T4 row (fallback range [14, 40], Euclid 8..16 from the entrance), CG4 §3 (cluster window), §5 row 14a (L <= 39).
// CG2 §6.1 row 8 (zones monotone, first 1, last 4) has no fixture on purpose: main is the BFS walk Beacon -> entrance, so dist rises by exactly 1 per tile,
// depth never falls, and rules 4/5 pin dist 0 at the entrance (zone 1) and dist = beaconDist at the Beacon (depth 40, zone 4). No cave can fail row 8.
import type { CaveResult } from '../core/types.ts'
import { MAP_H, MAP_W, TILE } from '../core/state.ts'
import { bfs4 } from '../world/bfs.ts'
import { validateCave } from '../world/validate.ts'
import { caveOf } from './caves.ts'
import { SEEDS, cheb, info, ok, tileOf, zoneIn } from './cave.check.ts'
import type { Info } from './cave.check.ts'

const W = MAP_W, H = MAP_H
const copy = (r: CaveResult): CaveResult => structuredClone(r) // never mutate caveOf memo results
const why = (r: CaveResult): string => validateCave(r).why
const px = (tile: number): { x: number; y: number } => ({ x: (tile % W) * TILE + TILE / 2, y: Math.floor(tile / W) * TILE + TILE / 2 })
const N8 = [-W - 1, -W, -W + 1, -1, 0, 1, W - 1, W, W + 1]
// Run `one` over the 62 seeds until it has exercised `want` of them (it returns false when the seed has no geometry for the fixture).
function sweep(label: string, one: (r: CaveResult, I: Info) => boolean, want = 2): void {
  let n = 0
  for (const s of SEEDS) { if (n >= want) break; const r = caveOf(s); if (one(r, info(r))) n++ }
  ok(n >= 1, `${label}: exercised on at least one seed: regenerate fixtures`)
}
// Tiles at Chebyshev distance exactly g from tile c, inside the playable map.
function ring(c: number, g: number): number[] {
  const out: number[] = [], cx = c % W, cy = Math.floor(c / W)
  for (let dy = -g; dy <= g; dy++) for (let dx = -g; dx <= g; dx++) {
    const x = cx + dx, y = cy + dy
    if (Math.max(Math.abs(dx), Math.abs(dy)) === g && x >= 2 && x < W - 2 && y >= 2 && y < H - 2) out.push(y * W + x)
  }
  return out
}
const used = (r: CaveResult): Set<number> => new Set([...r.pickups.map(tileOf), ...r.spawns.map(tileOf), ...r.veins.map((v) => v.stand)])
const setTile = (r: CaveResult, i: number, c: string): void => { r.tiles = r.tiles.slice(0, i) + c + r.tiles.slice(i + 1) }
const smallResin = (r: CaveResult): CaveResult['pickups'][number] => r.pickups.find((p) => p.kind === 'resin' && p.size === 'small')!

// Row 7: every main tile is wide2. Walling both tiles on one axis next to a main tile (west + east, or north + south) leaves each of the four 2x2 blocks
// around it with a wall, so that tile is single-wide. The walled tiles are floor off the main path, free of items, outside the Beacon mask, and the
// cave must stay connected with the Beacon still the farthest tile (so rules 3 and 5 cannot fire first).
function wideRule(): void {
  const wall = (r: CaveResult, I: Info): CaveResult | null => {
    const mask = new Set(r.chamber), main = new Set(I.main), busy = used(r)
    for (const m of I.main) {
      if (I.d[m] < 8 || I.d[m] > I.bd - 8) continue
      for (const step of [1, W]) {
        const a = m - step, b = m + step
        if ([a, b].some((t) => I.g[t] || main.has(t) || mask.has(t) || busy.has(t))) continue
        const g = I.g.slice(); g[a] = 1; g[b] = 1
        const d = bfs4(g, W, H, I.e)
        let floor = 0, reach = 0, far = 0
        for (let i = 0; i < g.length; i++) { if (!g[i]) floor++; if (d[i] >= 0) { reach++; far = Math.max(far, d[i]) } }
        if (reach !== floor || far !== I.bd) continue
        const v = copy(r); setTile(v, a, '#'); setTile(v, b, '#')
        return v
      }
    }
    return null
  }
  sweep('rule 7', (r, I) => {
    const v = wall(r, I)
    if (!v) return false
    ok(validateCave(r).ok, 'rule 7: the unchanged cave is accepted (control)')
    ok(why(v) === 'r7 wide', `rule 7: a main tile without 2-wide clearance is rejected as r7 wide (${why(v)})`)
    return true
  })
}

// Row 13: mask tiles hold no item. A sodium vein whose stand is a floor tile inside the Beacon mask (r.chamber, CG1 chamber mask) is rejected as r13 mask
// item; the same vein standing far from the Beacon (path distance to it >= 60) is accepted. The vein tile is a wall 4-adjacent to the stand, >= 4
// (Chebyshev) from every other vein tile, so rules 9, 10 and 11 stay quiet.
function veinMask(): void {
  const addVein = (r: CaveResult, I: Info, stand: number): CaveResult | null => {
    const wt = [stand - W, stand + W, stand - 1, stand + 1].find((t) => I.g[t] === 1 && t % W > 0 && t % W < W - 1 && r.veins.every((x) => cheb(x.tile, t) >= 4))
    if (wt === undefined) return null
    const v = copy(r)
    v.veins.push({ id: r.veins.length, mineral: 'sodium', tile: wt, stand, pieces: 1 })
    return v
  }
  sweep('rule 13 vein stand', (r, I) => {
    const inside = r.chamber.filter((i) => !I.g[i] && I.d[i] >= 6).map((i) => addVein(r, I, i)).find((v) => v !== null)
    let outside: CaveResult | null = null
    for (let i = 0; i < W * H && !outside; i++) if (!I.g[i] && I.dB[i] >= 60 && I.d[i] >= 6) outside = addVein(r, I, i)
    if (!inside || !outside) return false
    ok(validateCave(outside).ok, 'rule 13: a vein standing far from the Beacon mask is accepted (control)')
    ok(why(inside) === 'r13 mask item', `rule 13: a vein stand inside the Beacon mask is rejected as r13 mask item (${why(inside)})`)
    return true
  })
}

// Row 12, T1: a small resin on a main tile with dist in [7, 20] (CG2 §4: [7, 11], widened to [7, 20] when no tile qualifies). Every small resin on main
// within dist 21 is dropped (k >= 3, so the cluster stays), then one fresh small resin is put on main[at] (main[j] has dist j), >= 10 from every other resin.
function t1Bound(): void {
  const edit = (r: CaveResult, I: Info, at: number): CaveResult | null => {
    const main = new Set(I.main), mask = new Set(r.chamber), t = I.main[at]
    if (I.d[t] !== at || mask.has(t) || !I.wide2[t] || used(r).has(t)) return null
    const v = copy(r)
    v.pickups = v.pickups.filter((p, k) => k < 3 || p.kind !== 'resin' || p.size !== 'small' || !main.has(tileOf(p)) || I.d[tileOf(p)] > 21)
    if (v.pickups.some((p) => p.kind === 'resin' && cheb(tileOf(p), t) < 10)) return null
    v.pickups.push({ ...smallResin(r), id: 0, ...px(t) })
    return v.pickups.filter((p) => p.kind === 'resin').length >= 24 ? v : null
  }
  sweep('T1 bound', (r, I) => {
    const at = edit(r, I, 20), past = edit(r, I, 21)
    if (!at || !past) return false
    ok(validateCave(at).ok, `T1: the only T1 resin at dist 20 is accepted (${why(at)}); regenerate fixtures`)
    ok(why(past) === 'r12 T1', `T1: the only T1 resin at dist 21 is rejected as r12 T1 (${why(past)}); regenerate fixtures`)
    return true
  })
}

// Row 12, T4: a lurker on a floor tile with 8 floor neighbours, dist in [14, 24] (CG2 §4; the fallback row widens it to [14, 40]), Euclid 8..16 tiles from
// the entrance, off main. All other lurkers are dropped; one lurker goes to a tile at dist exactly 40 (accepted) / 41 (rejected as r12 T4).
function t4Bound(): void {
  const edit = (r: CaveResult, I: Info, at: number): CaveResult | null => {
    const main = new Set(I.main), mask = new Set(r.chamber), ex = r.entrance.tx, ey = r.entrance.ty
    for (let i = 0; i < W * H; i++) {
      if (I.d[i] !== at || main.has(i) || mask.has(i) || N8.some((o) => I.g[i + o])) continue
      const e2 = (i % W - ex) ** 2 + (Math.floor(i / W) - ey) ** 2
      if (e2 < 64 || e2 > 256) continue
      const v = copy(r)
      v.spawns = v.spawns.filter((s) => s.kind !== 'lurker')
      v.spawns.push({ kind: 'lurker', ...px(i) })
      return v
    }
    return null
  }
  sweep('T4 bound', (r, I) => {
    const at = edit(r, I, 40), past = edit(r, I, 41)
    if (!at || !past) return false
    ok(validateCave(at).ok, `T4: the only lurker at dist 40 is accepted (${why(at)}); regenerate fixtures`)
    ok(why(past) === 'r12 T4', `T4: the only lurker at dist 41 is rejected as r12 T4 (${why(past)}); regenerate fixtures`)
    return true
  })
}

// Rule 10, cluster gap (CG2 §3.3: inside the Beacon cluster >= 3 Chebyshev). pickups[2] moves onto a tile at Chebyshev exactly 3 (accepted) / 2
// (rejected as r10 resin gap) from pickups[1] and >= 3 from pickups[0]. The tile keeps every other rule quiet: wide2, outside the mask, dist in
// [bd - 40, bd - 8], within 10 of main (CG4 §3), Beacon path distance <= 39 (rule 14a, L = 40 is the first failing value), >= 10 from non-cluster resin.
function clusterGap(): void {
  const edit = (r: CaveResult, I: Info, gap: number): CaveResult | null => {
    const mask = new Set(r.chamber), p0 = tileOf(r.pickups[0]), p1 = tileOf(r.pickups[1])
    const t = ring(p1, gap).find((i) => !I.g[i] && I.wide2[i] && !mask.has(i) && I.d[i] >= I.bd - 40 && I.d[i] <= I.bd - 8 && I.dB[i] <= 39 &&
      cheb(p0, i) >= 3 && I.main.some((m) => cheb(m, i) <= 10) && r.pickups.every((p, k) => k < 3 || p.kind !== 'resin' || cheb(tileOf(p), i) >= 10))
    if (t === undefined) return null
    const v = copy(r)
    v.pickups[2] = { ...v.pickups[2], ...px(t) }
    return v
  }
  sweep('cluster gap', (r, I) => {
    const at = edit(r, I, 3), past = edit(r, I, 2)
    if (!at || !past) return false
    ok(validateCave(r).ok && r.pickups.slice(0, 3).every((p) => p.kind === 'resin'), 'cluster gap: the unchanged cave is accepted and pickups[0..2] are resin (control)')
    ok(validateCave(at).ok, `cluster gap: two cluster resin exactly 3 tiles apart are accepted (${why(at)}); regenerate fixtures`)
    ok(why(past) === 'r10 resin gap', `cluster gap: two cluster resin 2 tiles apart are rejected as r10 resin gap (${why(past)}); regenerate fixtures`)
    return true
  })
}

// Rule 10, plant gap (CG2 §3.3: plant <-> plant >= 12 Chebyshev). A plant that cannot be the T3 plant (zone >= 2) moves onto a floor tile (painted ','
// so rule 9 holds, walls and distances unchanged) whose nearest other plant is exactly 12 (accepted) / 11 (rejected as r10 plant gap) away.
function plantGap(): void {
  const edit = (r: CaveResult, I: Info, gap: number): CaveResult | null => {
    const mask = new Set(r.chamber), plants = r.pickups.map((p, k) => ({ p, k })).filter(({ p }) => p.kind === 'plant')
    const mv = plants.find(({ p }) => zoneIn(I, tileOf(p)) >= 2)
    if (!mv) return null
    const others = plants.filter(({ k }) => k !== mv.k).map(({ p }) => tileOf(p))
    for (const q of others) {
      const t = ring(q, gap).find((i) => !I.g[i] && I.wide2[i] && I.d[i] >= 6 && !mask.has(i) && others.every((o) => cheb(o, i) >= gap))
      if (t === undefined) continue
      const v = copy(r)
      v.pickups[mv.k] = { ...v.pickups[mv.k], ...px(t) }
      setTile(v, t, ',')
      return v
    }
    return null
  }
  sweep('plant gap', (r, I) => {
    const at = edit(r, I, 12), past = edit(r, I, 11)
    if (!at || !past) return false
    ok(validateCave(r).ok, 'plant gap: the unchanged cave is accepted (control)')
    ok(validateCave(at).ok, `plant gap: two plants exactly 12 tiles apart are accepted (${why(at)}); regenerate fixtures`)
    ok(why(past) === 'r10 plant gap', `plant gap: two plants 11 tiles apart are rejected as r10 plant gap (${why(past)}); regenerate fixtures`)
    return true
  })
}

// Row 8 pin: dist along main is 0, 1, ..., beaconDist (one BFS step per tile), so the zones are monotone, first 1 and last 4 on every valid cave.
// This is the reason no reject fixture exists: the row cannot fire once rules 4 and 5 hold (equivalent mutant, reported, not hidden).
function zonesPin(): void {
  for (const s of SEEDS) {
    const r = caveOf(s), I = info(r), z = I.main.map((m) => zoneIn(I, m))
    ok(I.main.every((m, j) => I.d[m] === j) && I.d[I.main[I.main.length - 1]] === I.bd, `rule 8 seed ${s}: main dist runs 0..beaconDist`)
    ok(z[0] === 1 && z[z.length - 1] === 4 && z.every((v, j) => j === 0 || v >= z[j - 1]), `rule 8 seed ${s}: zones along main are monotone, first 1, last 4`)
  }
}

export function run(): void {
  zonesPin()
  wideRule()
  veinMask()
  t1Bound()
  t4Bound()
  clusterGap()
  plantGap()
}
