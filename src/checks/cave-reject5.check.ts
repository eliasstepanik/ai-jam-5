// Cave validator, fix-round-4 negative fixtures (CG4 §7 test 13; quality gate 3 finding "validator rows with no reject fixture"). Same method as
// cave-reject2/4.check.ts: every case edits a deep copy of a valid cave (structuredClone; `tiles` is a string, so a tile edit builds a new string), picks its
// fixture tiles by geometry only (never by validateCave), changes one thing so only the intended rule fires, and asserts the stable reject id next to an
// accepted control. Thresholds come from the spec text, not from validate.ts (R-162):
//   CG2 §6.1 row 1 (tiles.length === w * h = 76 800; alphabet only '#', '.', ','), row 2 (every edge tile is '#'), row 3 (one BFS from the entrance reaches
//   EVERY floor tile), row 4 (entrance floor, all 8 neighbours floor), row 9 (pickup tiles and vein stands are floor with dist >= 0; vein tile is '#' 4-adjacent
//   to its stand; plants on ','), row 10 + §3.3 (vein <-> vein wall tiles >= 4 Chebyshev).
// Unreachable on purpose (no fixture): row 9 'dist >= 0' on a floor tile (row 3 already forces every floor tile to be reached), the horizontal wrap-around of
// the vein adjacency test (a stand at x = 0 or w - 1 is a floor edge tile, row 2 rejects it first), and the `!floor stand` clause (a wall stand has dist -1,
// so the `dist < 0` clause rejects it too): the wall-stand fixture below still pins the combined verdict.
import type { CaveResult } from '../core/types.ts'
import { MAP_H, MAP_W, TILE } from '../core/state.ts'
import { bfs4 } from '../world/bfs.ts'
import { validateCave } from '../world/validate.ts'
import { caveOf } from './caves.ts'
import { SEEDS, cheb, info, ok, tileOf, zoneIn } from './cave.check.ts'
import type { Info } from './cave.check.ts'

const W = MAP_W, H = MAP_H, N = W * H
const copy = (r: CaveResult): CaveResult => structuredClone(r) // never mutate caveOf memo results
const why = (r: CaveResult): string => validateCave(r).why
const px = (tile: number): { x: number; y: number } => ({ x: (tile % W) * TILE + TILE / 2, y: Math.floor(tile / W) * TILE + TILE / 2 })
const N8 = [-W - 1, -W, -W + 1, -1, 0, 1, W - 1, W, W + 1]
const setTile = (r: CaveResult, i: number, c: string): void => { r.tiles = r.tiles.slice(0, i) + c + r.tiles.slice(i + 1) }
const inner = (t: number): boolean => t % W >= 3 && t % W < W - 3 && t >= 3 * W && t < N - 3 * W
const accepted = (r: CaveResult, msg: string): void => ok(validateCave(r).ok, `${msg} is accepted (${why(r)}); regenerate fixtures`)
const rejected = (r: CaveResult, id: string, msg: string): void => ok(why(r) === id, `${msg} is rejected as ${id} (${why(r)}); regenerate fixtures`)
// Run `one` over the 62 seeds until it has exercised `want` of them (it returns false when the seed has no geometry for the fixture).
function sweep(label: string, one: (r: CaveResult, I: Info) => boolean, want = 2): void {
  let n = 0
  for (const s of SEEDS) { if (n >= want) break; const r = caveOf(s); if (one(r, info(r))) n++ }
  ok(n >= 1, `${label}: exercised on at least one seed: regenerate fixtures`)
}
// First tile (index order) that passes `pred`.
function firstTile(pred: (i: number) => boolean): number | undefined {
  for (let i = 0; i < N; i++) if (pred(i)) return i
  return undefined
}
const busy = (r: CaveResult): Set<number> => new Set([...r.pickups.map(tileOf), ...r.spawns.map(tileOf), ...r.veins.map((v) => v.stand), ...r.chamber])

// Row 1: size and alphabet (CG2 §6.1 row 1). A string one tile short, one tile long, one tile off the front and empty is rejected as r1 size; one bad
// character on a wall tile (first tile, last tile, an interior wall) is rejected as r1 alphabet. The bad characters are 'x' and the neighbours of the three
// legal code points ('"' '$' '+' '-' '/'), so a widened alphabet range cannot pass. Controls: the untouched cave, and '.' <-> ',' swaps on item-free floor.
function row1(): void {
  sweep('row 1 size', (r) => {
    accepted(copy(r), 'row 1: the untouched tile string')
    for (const [name, t] of [['one tile short', r.tiles.slice(0, -1)], ['one tile long', r.tiles + '#'], ['one tile off the front', r.tiles.slice(1)], ['empty', '']] as const) {
      const v = copy(r); v.tiles = t
      rejected(v, 'r1 size', `row 1: a tile string ${name}`)
    }
    return true
  }, 1)
  sweep('row 1 alphabet', (r, I) => {
    const mid = firstTile((i) => inner(i) && N8.every((o) => I.g[i + o] === 1))
    if (mid === undefined) return false
    for (const [name, at] of [['first tile', 0], ['last tile', N - 1], ['interior wall', mid]] as const) {
      for (const c of ['x', '"', '$', '+', '-', '/', ' ']) {
        const v = copy(r); setTile(v, at, c)
        rejected(v, 'r1 alphabet', `row 1: character ${JSON.stringify(c)} on the ${name}`)
      }
    }
    const b = busy(r)
    const dot = firstTile((i) => !I.g[i] && r.tiles[i] === '.' && !b.has(i)), comma = firstTile((i) => !I.g[i] && r.tiles[i] === ',' && !b.has(i) && !r.pickups.some((p) => tileOf(p) === i))
    if (dot === undefined || comma === undefined) return false
    const toComma = copy(r); setTile(toComma, dot, ',')
    const toDot = copy(r); setTile(toDot, comma, '.')
    accepted(toComma, 'row 1: a free floor tile swapped from "." to ","')
    accepted(toDot, 'row 1: a free floor tile swapped from "," to "."')
    return true
  }, 1)
}

// Row 2: border (CG2 §6.1 row 2). A floor tile on each of the four corners and on the middle of each of the four sides is rejected as r2 border (row 2
// runs before the connectivity row, so the orphan tile cannot trip r3 first). Control: the untouched cave, whose whole edge is wall.
function row2(): void {
  sweep('row 2 border', (r, I) => {
    ok(I.g[0] === 1 && I.g[N - 1] === 1 && I.g[W - 1] === 1 && I.g[N - W] === 1, 'row 2: the generated cave has wall corners: regenerate fixtures')
    accepted(copy(r), 'row 2: a cave whose edge is all wall')
    const at: [string, number][] = [['top-left corner', 0], ['top-right corner', W - 1], ['bottom-left corner', N - W], ['bottom-right corner', N - 1],
      ['top side', W >> 1], ['bottom side', N - W + (W >> 1)], ['left side', (H >> 1) * W], ['right side', (H >> 1) * W + W - 1]]
    for (const [name, i] of at) for (const c of ['.', ',']) {
      const v = copy(r); setTile(v, i, c)
      rejected(v, 'r2 border', `row 2: a floor ${JSON.stringify(c)} on the ${name}`)
    }
    return true
  }, 1)
}

// Row 3: connectivity (CG2 §6.1 row 3). One wall tile deep in the rock (all 8 neighbours wall) turned to floor, and a two-tile pocket the same way, are
// orphan regions: rejected as r3 connected. Control: a wall tile with exactly one floor 4-neighbour that is at least 2 below the Beacon distance, turned to
// floor, extends the cave by one connected tile and is accepted.
function row3(): void {
  sweep('row 3 connected', (r, I) => {
    const one = firstTile((i) => inner(i) && N8.every((o) => I.g[i + o] === 1))
    const two = firstTile((i) => inner(i) && [-W - 1, -W, -W + 1, -W + 2, -1, 0, 1, 2, W - 1, W, W + 1, W + 2].every((o) => I.g[i + o] === 1))
    const nb = (i: number): number[] => [i - W, i + W, i - 1, i + 1].filter((t) => !I.g[t])
    const ext = firstTile((i) => inner(i) && I.g[i] === 1 && nb(i).length === 1 && I.d[nb(i)[0]] >= 0 && I.d[nb(i)[0]] <= I.bd - 2)
    if (one === undefined || two === undefined || ext === undefined) return false
    const a = copy(r); setTile(a, one, '.')
    const b = copy(r); setTile(b, two, '.'); setTile(b, two + 1, '.')
    const c = copy(r); setTile(c, ext, '.')
    accepted(c, 'row 3: one new floor tile joined to the cave')
    rejected(a, 'r3 connected', 'row 3: one isolated floor tile')
    rejected(b, 'r3 connected', 'row 3: an isolated two-tile floor pocket')
    return true
  }, 1)
}

// Row 4: entrance (CG2 §6.1 row 4). The entrance tile itself and each of its 8 neighbours turned to wall is rejected as r4 entrance. A neighbour is only
// knocked out when a 4-neighbour BFS from the entrance on the edited map still reaches every other floor tile, so row 3 stays quiet (selection by geometry).
// Control: the untouched cave, whose entrance has all 8 neighbours floor.
function row4(): void {
  for (const o of N8) {
    sweep(`row 4 entrance offset ${o}`, (r, I) => {
      accepted(copy(r), 'row 4: an entrance with 8 floor neighbours')
      const t = I.e + o
      if (o !== 0) {
        const g = I.g.slice(); g[t] = 1
        const d = bfs4(g, W, H, I.e)
        let floor = 0, reach = 0
        for (let i = 0; i < N; i++) { if (!g[i]) floor++; if (d[i] >= 0) reach++ }
        if (floor !== reach) return false
      }
      const v = copy(r); setTile(v, t, '#')
      rejected(v, 'r4 entrance', o === 0 ? 'row 4: an entrance tile turned to wall' : `row 4: an entrance neighbour (offset ${o}) turned to wall`)
      return true
    }, 1)
  }
}

// A plant that is not the T3 plant (zone >= 2) and the plants that stay where they are (same helper as cave-reject4).
function movablePlant(r: CaveResult, I: Info): { k: number; others: number[] } | null {
  const plants = r.pickups.map((p, k) => ({ p, k })).filter(({ p }) => p.kind === 'plant')
  const mv = plants.find(({ p }) => zoneIn(I, tileOf(p)) >= 2)
  return mv ? { k: mv.k, others: plants.filter(({ k }) => k !== mv.k).map(({ p }) => tileOf(p)) } : null
}
// Move pickup k onto tile t and paint t with `c` (walls and distances unchanged).
function moveTo(r: CaveResult, k: number, t: number, c: string | null): CaveResult {
  const v = copy(r)
  v.pickups[k] = { ...v.pickups[k], ...px(t) }
  if (c !== null) setTile(v, t, c)
  return v
}
// A vein appended to the cave (id after the last one).
function withVein(r: CaveResult, tile: number, stand: number): CaveResult {
  const v = copy(r)
  v.veins.push({ id: r.veins.length, mineral: 'sodium', tile, stand, pieces: 1 })
  return v
}
// Wall tile usable as a new vein tile: deep enough in the map, >= 4 Chebyshev from every vein tile (rule 10 vein gap).
const freeWall = (r: CaveResult, I: Info, t: number): boolean => inner(t) && I.g[t] === 1 && r.veins.every((x) => cheb(x.tile, t) >= 4)

// Row 9, pickups (CG2 §6.1 row 9): a plant on a '.' floor tile is rejected as r9 pickup, the same plant on a ',' tile is accepted (tile picked by geometry:
// wide2, dist >= 6, zone >= 2, outside the Beacon mask, >= 12 from the other plants, so rules 10-13 stay quiet); a plant and a resin on a wall tile are rejected.
function row9Pickups(): void {
  sweep('row 9 pickup', (r, I) => {
    const pl = movablePlant(r, I), mask = new Set(r.chamber), b = busy(r)
    if (!pl) return false
    const t = firstTile((i) => !I.g[i] && i !== I.b && !mask.has(i) && !b.has(i) && I.wide2[i] === 1 && I.d[i] >= 6 && zoneIn(I, i) >= 2 && pl.others.every((o) => cheb(o, i) >= 12))
    const wall = firstTile((i) => inner(i) && N8.every((o) => I.g[i + o] === 1))
    const resin = r.pickups.findIndex((p) => p.kind === 'resin' && p.size === 'small')
    if (t === undefined || wall === undefined || resin < 0) return false
    accepted(moveTo(r, pl.k, t, ','), 'row 9: a plant on a "," tile')
    rejected(moveTo(r, pl.k, t, '.'), 'r9 pickup', 'row 9: a plant on a "." floor tile')
    rejected(moveTo(r, pl.k, wall, null), 'r9 pickup', 'row 9: a plant on a wall tile')
    rejected(moveTo(r, resin, wall, null), 'r9 pickup', 'row 9: a resin on a wall tile')
    return true
  })
}

// Row 9, veins (CG2 §6.1 row 9): the vein tile is '#' and 4-adjacent to its stand, the stand is floor. Each case appends a sodium vein at a free stand
// (dist >= 8, outside every item tile and the mask, so rules 10-13 stay quiet). Accepted: the wall tile left, right, above or below the stand. Rejected as
// r9 vein: the vein tile on a diagonal of the stand, two tiles from it, or on a floor tile; the stand on a wall tile (a 4-neighbour of the vein tile).
function row9Veins(): void {
  const stand = (r: CaveResult, I: Info, wtOf: (s: number) => number | undefined): [number, number] | null => {
    const b = busy(r)
    const s = firstTile((i) => !I.g[i] && inner(i) && I.d[i] >= 8 && !b.has(i) && wtOf(i) !== undefined)
    return s === undefined ? null : [s, wtOf(s)!]
  }
  const case9 = (label: string, r: CaveResult, I: Info, wtOf: (s: number) => number | undefined, good: boolean, wall = false): boolean => {
    const p = stand(r, I, wtOf)
    if (!p) return false
    const [s, wt] = p
    let v = withVein(r, wt, s)
    if (wall) v = withVein(r, wt, [wt - W, wt + W, wt - 1, wt + 1].find((t) => t !== s && I.g[t] === 1)!)
    if (good) accepted(v, `row 9: ${label}`); else rejected(v, 'r9 vein', `row 9: ${label}`)
    return true
  }
  const side = (r: CaveResult, I: Info, ds: number[]) => (s: number): number | undefined => ds.map((d) => s + d).find((t) => freeWall(r, I, t))
  const one = (name: string, d: number, good: boolean): void => sweep(`row 9 vein ${name}`, (r, I) => case9(`a vein tile ${name} its stand`, r, I, side(r, I, [d]), good))
  one('left of', -1, true); one('right of', 1, true); one('above', -W, true); one('below', W, true)
  one('up-left of', -W - 1, false); one('up-right of', -W + 1, false); one('down-left of', W - 1, false); one('down-right of', W + 1, false)
  one('two left of', -2, false); one('two right of', 2, false); one('two above', -2 * W, false); one('two below', 2 * W, false)
  sweep('row 9 vein on floor', (r, I) => case9('a vein tile on a floor tile', r, I, (s) => [s - 1, s + 1, s - W, s + W].find((t) => !I.g[t] && r.veins.every((x) => cheb(x.tile, t) >= 4)), false))
  sweep('row 9 vein wall stand', (r, I) => case9('a vein stand on a wall tile', r, I, side(r, I, [-1, 1, -W, W]), false, true))
}

// Row 10 vein gap (CG2 §3.3: vein <-> vein wall tiles >= 4 Chebyshev). A sodium vein is appended at a free wall tile next to an existing vein tile at offset
// (dx, dy), its stand a free floor 4-neighbour at dist >= 8 outside the mask; every other vein tile is >= 4 away so only that pair counts. Offsets (4, 0), (0, 4),
// (4, 4) are accepted; (3, 0), (0, 3), (3, 3) are rejected as r10 vein gap ((3, 3) is Chebyshev 3 but Euclid 4.2, so a Euclid or Manhattan rule would pass it).
function veinGap(): void {
  const at = (r: CaveResult, I: Info, dx: number, dy: number): CaveResult | null => {
    const b = busy(r)
    for (const x of r.veins) {
      const t = x.tile + dy * W + dx
      if (!inner(t) || I.g[t] !== 1 || r.veins.some((o) => o !== x && cheb(o.tile, t) < 4)) continue
      const s = [t - W, t + W, t - 1, t + 1].find((q) => !I.g[q] && I.d[q] >= 8 && !b.has(q))
      if (s !== undefined) return withVein(r, t, s)
    }
    return null
  }
  const pairs: [number, number, number, number][] = [[4, 0, 3, 0], [0, 4, 0, 3], [4, 4, 3, 3]]
  for (const [ax, ay, bx, by] of pairs) {
    sweep(`vein gap (${bx}, ${by})`, (r, I) => {
      const good = at(r, I, ax, ay), bad = at(r, I, bx, by)
      if (!good || !bad) return false
      accepted(good, `vein gap: a vein at offset (${ax}, ${ay}) from another vein`)
      rejected(bad, 'r10 vein gap', `vein gap: a vein at offset (${bx}, ${by}) from another vein`)
      return true
    }, 1)
  }
}

export function run(): void {
  row1()
  row2()
  row3()
  row4()
  row9Pickups()
  row9Veins()
  veinGap()
}
