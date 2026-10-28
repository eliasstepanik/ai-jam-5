// Cave generator, last two carve acceptance rows (CG4 §7 test 13; CG2 A22 / R-114): 'loops < 2' and 'entrance in the root cell with ty < 18'.
// Selection is by geometry and stats from the exported passes (replay of passes 0-4, then placeEntrance, pickLoopPairs, placeBeacon), never by
// carveCore; carveCore is asserted last. Fixtures were found by scanning seeds 0..16000 x attempts 0..3: regenerate after any generator retune.
import { MAP_H, MAP_W } from '../core/state.ts'
import { hashSeed, makeRnd } from '../core/rng.ts'
import { BEACON_DIST_BAND, macroCellOf } from '../world/gen/macro.ts'
import { placeBeacon, placeEntrance } from '../world/gen/places.ts'
import { pickLoopPairs } from '../world/gen/loops.ts'
import { sculpt } from '../world/gen/sculpt.ts'
import { carveCore, caveSeed } from '../world/generate.ts'
import { replay } from './cave-extra.check.ts'
import { ok } from './cave.check.ts'

const W = MAP_W, H = MAP_H
const stream = (cs: number, tag: string) => makeRnd(hashSeed(cs, 'cave:' + tag))

// Rows other than the one under test, from the exported pieces. rootMinY: smallest ty of any floor tile in the root macro cell.
function rows(seed: number, a: number): { early: boolean; rootMinY: number; loops: number; beaconOk: boolean } {
  const cs = caveSeed(seed, a), R = replay(cs)
  let rootMinY = H
  for (let i = 0; i < R.g.length; i++) if (!R.g[i] && macroCellOf(i, W) === R.L.root) rootMinY = Math.min(rootMinY, Math.floor(i / W))
  const early = R.keep >= 16000 && R.spanX >= 0.9 * W && R.spanY >= 0.9 * H && R.cells.every((n) => n >= 150) // keep, bbox, cell floor
  const e = placeEntrance(R.g, W, H, R.L.root, stream(cs, 'entrance'))
  if (e < 0) return { early, rootMinY, loops: -1, beaconOk: false }
  const loops = pickLoopPairs(R.g, W, H, e, R.L, stream(cs, 'tunnels')).loops, B = (sculpt(R.g, W, H, e, hashSeed(cs, 'cave:sculpt')), placeBeacon(R.g, W, H, e))
  return { early, rootMinY, loops, beaconOk: !!B && B.beaconDist >= BEACON_DIST_BAND[0] && B.beaconDist <= BEACON_DIST_BAND[1] }
}

export function run(): void {
  // (a) loops row: exactly 1 loop, every other row passes -> rejected; 2 loops, all rows pass -> accepted (seed/attempt pairs)
  for (const [seed, a] of [[3567, 2], [6047, 3], [9133, 2]]) {
    const r = rows(seed, a), tag = `loops fixture ${seed}/${a}: `
    ok(r.early && r.rootMinY < 18 && r.loops === 1 && r.beaconOk, tag + `only the loops row fails (regenerate fixtures): ${JSON.stringify(r)}`)
    ok(carveCore(caveSeed(seed, a)) === null, tag + 'exactly 1 loop is rejected by carveCore')
  }
  for (const [seed, a] of [[2011, 0], [1122, 1], [1469, 1]]) {
    const r = rows(seed, a), core = carveCore(caveSeed(seed, a)), tag = `loops control ${seed}/${a}: `
    ok(r.early && r.rootMinY < 18 && r.loops === 2 && r.beaconOk, tag + `all rows pass with exactly 2 loops (regenerate fixtures): ${JSON.stringify(r)}`)
    ok(core !== null && core.stats.loops === 2, tag + '2 loops is accepted by carveCore')
  }
  // (b) entrance row (carveCore's 'y < 18' test and placeEntrance's pool bound of 18 rows both reject ty 18, so each bound alone is covered by the other
  //     for ty 18; the pair is pinned from both sides by these fixtures): the root cell has floor only from ty 18 down -> no entrance candidate -> rejected; ty 17 -> accepted with entrance ty < 18
  for (const [seed, a] of [[493, 1], [616, 2], [627, 0]]) {
    const r = rows(seed, a), tag = `entrance fixture ${seed}/${a}: `
    ok(r.early && r.rootMinY === 18, tag + `root cell starts at ty 18, other early rows pass (regenerate fixtures): ${JSON.stringify(r)}`)
    ok(carveCore(caveSeed(seed, a)) === null, tag + 'no root-cell floor with ty < 18 is rejected by carveCore')
  }
  for (const [seed, a] of [[1568, 1], [2011, 0], [2386, 3]]) {
    const r = rows(seed, a), core = carveCore(caveSeed(seed, a)), tag = `entrance control ${seed}/${a}: `
    ok(r.early && r.rootMinY === 17 && r.loops >= 2 && r.beaconOk, tag + `root cell starts at ty 17, all other rows pass (regenerate fixtures): ${JSON.stringify(r)}`)
    ok(core !== null && Math.floor(core.entrance / W) < 18, tag + 'ty 17 is accepted with entrance ty < 18')
  }
}
