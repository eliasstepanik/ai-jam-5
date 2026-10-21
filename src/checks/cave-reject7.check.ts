// Cave validator, fix-round-12 negative fixtures (retrospect: four validator guards with no reject fixture). Same method as cave-reject5.check.ts: every case
// edits a deep copy of a valid cave (structuredClone), selects its fixture tiles by geometry only (never by validateCave), changes one thing so only the intended
// rule fires, and asserts the exact stable reject id next to an accepted control. Thresholds come from the spec text, not from validate.ts (R-162):
//   CG2 §6.1 row 4 (entrance on the map, floor, 8 floor neighbours), row 5 (Beacon on the map; dist(Beacon) = beaconDist = max dist), row 10 (spawns on the map,
//   >= 6 path tiles from the entrance), row 11 (each mineral >= 1 vein).
import type { CaveResult } from '../core/types.ts'
import { MAP_H, MAP_W, TILE } from '../core/state.ts'
import { validateCave } from '../world/validate.ts'
import { caveOf } from './caves.ts'
import { SEEDS, info, ok, zoneIn } from './cave.check.ts'
import type { Info } from './cave.check.ts'

const W = MAP_W, H = MAP_H, N = W * H
const copy = (r: CaveResult): CaveResult => structuredClone(r) // never mutate caveOf memo results
const why = (r: CaveResult): string => validateCave(r).why
const px = (tile: number): { x: number; y: number } => ({ x: (tile % W) * TILE + TILE / 2, y: Math.floor(tile / W) * TILE + TILE / 2 })
const setTile = (r: CaveResult, i: number, c: string): void => { r.tiles = r.tiles.slice(0, i) + c + r.tiles.slice(i + 1) }
const inner = (t: number): boolean => t % W >= 3 && t % W < W - 3 && t >= 3 * W && t < N - 3 * W
const accepted = (r: CaveResult, msg: string): void => ok(validateCave(r).ok, `${msg} is accepted (${why(r)}); regenerate fixtures`)
const rejected = (r: CaveResult, id: string, msg: string): void => ok(why(r) === id, `${msg} is rejected as ${id} (${why(r)}); regenerate fixtures`)
function sweep(label: string, one: (r: CaveResult, I: Info) => boolean, want = 2): void {
  let n = 0
  for (const s of SEEDS) { if (n >= want) break; const r = caveOf(s); if (one(r, info(r))) n++ }
  ok(n >= 1, `${label}: exercised on at least one seed: regenerate fixtures`)
}
function firstTile(pred: (i: number) => boolean): number | undefined {
  for (let i = 0; i < N; i++) if (pred(i)) return i
  return undefined
}

// Row 5, farthest tile (CG2 §6.1 row 5: dist(Beacon) = beaconDist = max dist). A dead-end tile is carved onto a wall tile whose only floor 4-neighbour f has
// dist(f) = k, so the new tile sits at dist k + 1 and rules 1-4 stay intact. k = beaconDist: the Beacon is no longer the maximum, rejected as r5 beacon.
// k = beaconDist - 1: the new tile ties the Beacon, the maximum is still beaconDist, accepted (spec says max, so a tie is legal).
function farthest(): void {
  const dead = (r: CaveResult, I: Info, k: number): CaveResult | null => {
    const nb = (i: number): number[] => [i - W, i + W, i - 1, i + 1].filter((q) => !I.g[q])
    const t = firstTile((i) => inner(i) && I.g[i] === 1 && nb(i).length === 1 && I.d[nb(i)[0]] === k)
    if (t === undefined) return null
    const v = copy(r); setTile(v, t, '.')
    return v
  }
  sweep('row 5 farthest tile', (r, I) => {
    const past = dead(r, I, I.bd), tie = dead(r, I, I.bd - 1)
    if (!past || !tie) return false
    accepted(copy(r), 'row 5: the untouched cave (Beacon is the farthest tile)')
    accepted(tie, 'row 5: an extra floor tile at exactly the Beacon distance (tie)')
    rejected(past, 'r5 beacon', 'row 5: an extra floor tile one step beyond the Beacon')
    return true
  })
}

// Row 11, each mineral present (CG2 §6.1 row 11). Relabelling every vein of one mineral as another keeps the vein count and all positions, so only the
// "each mineral >= 1 vein" clause fires (r11 runs before the teaching rows): no sodium vein, no copper vein. Control: the untouched cave.
function minerals(): void {
  for (const [gone, into] of [['sodium', 'strontium'], ['copper', 'sodium']] as const) {
    sweep(`row 11 no ${gone} vein`, (r) => {
      const v = copy(r)
      v.veins.forEach((x) => { if (x.mineral === gone) x.mineral = into })
      if (v.veins.length !== r.veins.length || v.veins.some((x) => x.mineral === gone) || !r.veins.some((x) => x.mineral === gone)) return false
      accepted(copy(r), `row 11: a cave with ${gone} veins`)
      rejected(v, 'r11 counts', `row 11: a cave without any ${gone} vein`)
      return true
    }, 1)
  }
}

// Rows 4/5, off-map coordinates (CG2 §6.1 rows 4, 5). An entrance or Beacon with tx = -1 or tx = w (map width) is rejected as r4 entrance / r5 beacon. The
// aliasing cases are the discriminating ones: tx + w with ty - 1 (and tx - w with ty + 1) indexes the SAME tile as the real one, so an unguarded flat index
// would accept them; the verdict must come from the range check alone. Control: the untouched point.
function offMap(): void {
  sweep('rows 4/5 off-map', (r) => {
    accepted(copy(r), 'rows 4/5: an on-map entrance and Beacon')
    for (const [key, id] of [['entrance', 'r4 entrance'], ['beacon', 'r5 beacon']] as const) {
      const p = r[key]
      for (const [name, tx, ty] of [['tx = -1', -1, p.ty], ['tx = w', W, p.ty], ['tx + w, ty - 1 (aliases the real tile)', p.tx + W, p.ty - 1],
        ['tx - w, ty + 1 (aliases the real tile)', p.tx - W, p.ty + 1], ['ty = -1', p.tx, -1], ['ty = h', p.tx, H]] as const) {
        const v = copy(r); v[key] = { tx, ty }
        rejected(v, id, `rows 4/5: ${key} with ${name}`)
      }
    }
    return true
  }, 1)
}

// Row 10, safe start with an off-map spawn (CG2 §6.1 row 10: spawns lie on the map, >= 6 path tiles from the entrance). A stalker at x = -16, x = -1, x = w * TILE,
// y = -16 or y = h * TILE has no tile: rejected as r10 safe start. Control: the same stalker on a tile at path dist >= 6 (zone >= 2, outside the mask) is accepted.
function offMapSpawn(): void {
  sweep('row 10 off-map spawn', (r, I) => {
    const mask = new Set(r.chamber), t = firstTile((i) => !I.g[i] && !mask.has(i) && I.d[i] >= 6 && zoneIn(I, i) >= 2)
    if (t === undefined) return false
    const at = (x: number, y: number): CaveResult => { const v = copy(r); v.spawns.push({ kind: 'stalker', x, y }); return v }
    accepted(at(px(t).x, px(t).y), 'row 10: an on-map stalker spawn')
    for (const [name, x, y] of [['x = -16', -16, 100], ['x = -1', -1, 100], ['x = w * TILE', W * TILE, 100], ['y = -16', 100, -16], ['y = h * TILE', 100, H * TILE]] as const) {
      rejected(at(x, y), 'r10 safe start', `row 10: a stalker spawn at ${name}`)
    }
    return true
  }, 1)
}

export function run(): void {
  farthest()
  minerals()
  offMap()
  offMapSpawn()
}
