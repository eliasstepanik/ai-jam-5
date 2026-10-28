// Cave depth classes check (R-164, KB notes/ai-jam-5-cave-depth-tuning, architecture-rulings-3 §7): for every class 1..4 the cave of a
// seed validates under its own class params, the fallback ring validates per class, the band / attempt-0 rate / determinism hold, and the
// params table has its documented rows. Default = every 5th seed of the cave.check SEEDS list (13 seeds per class); CHECK_HEAVY=1 = all 62.
// Written from R-164 and the 62-seed probe numbers, never from generator bodies. L0-L3 imports only.
import type { CaveResult } from '../core/types.ts'
import { MAP_H, MAP_W } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { generateCave } from '../world/generate.ts'
import { fallbackCave } from '../world/gen/fallback.ts'
import { PARAMS, paramsOf, scaledMin } from '../world/gen/params.ts'
import type { DepthClass } from '../world/gen/params.ts'
import { validateCave } from '../world/validate.ts'
import { caveOf } from './caves.ts'
import { SEEDS, ok } from './cave.check.ts'

const CLASSES: readonly DepthClass[] = [1, 2, 3, 4]
// ponytail: a stride subset, not the first 12: seeds 0..3 are the slow ones for class 1 (7/12 on attempt 0 vs 48/62 overall). Upgrade: CHECK_HEAVY.
const DEFAULT_STRIDE = 5
// Measured over all 62 seeds, attempt-0 successes (attempts === 1, no fallback): class 1 48, class 2 52, class 3 56, class 4 52.
// Floors are fractions of N: 0.6 for the short and long classes (measured 0.77-0.84), 0.75 for the default class (measured 0.90).
const FLOOR_FRAC: Record<DepthClass, number> = { 1: 0.6, 2: 0.6, 3: 0.75, 4: 0.6 }

// Cheap content hash: tiles + Beacon distance + spare rng state + item counts (a different class changes at least the tiles).
const hashOf = (r: CaveResult): number =>
  fnv1a(`${r.tiles}|${r.beaconDist}|${r.rngState}|${r.pickups.length}|${r.veins.length}|${r.spawns.length}`)

function heavy(): boolean {
  // R-041: CHECK_HEAVY is read here, never at import time (no Node types in src)
  return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CHECK_HEAVY === '1'
}

// params rows (test 6): class 3 = the documented pre-class constants, class coercion, rule-11 minimum scaling
function paramRows(): void {
  const p3 = PARAMS[3]
  ok(p3.eccMin === 12 && p3.eccMax === 14, 'class 3 ecc 12-14')
  ok(p3.bdLo === 510 && p3.bdHi === 690 && p3.fbLo === 459, 'class 3 band 510-690, fallback floor 459')
  ok(p3.cols === 8 && p3.rows === 6 && p3.rampS === 80, 'class 3 grid 8x6, rampS 80')
  const bands: Record<DepthClass, number[]> = { 1: [220, 340, 198], 2: [340, 460, 306], 3: [510, 690, 459], 4: [690, 860, 459] } // R-164: bdLo, bdHi, fbLo
  for (const c of CLASSES) ok([PARAMS[c].bdLo, PARAMS[c].bdHi, PARAMS[c].fbLo].join() === bands[c].join(), `class ${c} band / fallback floor row ${bands[c]}`)
  for (const c of CLASSES) ok(PARAMS[c].depthClass === c && paramsOf(c) === PARAMS[c], `PARAMS[${c}] keyed by its own class`)
  const coerced: [number | undefined, number][] = [[undefined, 3], [NaN, 3], [Infinity, 3], [9, 4], [0, 1], [2.6, 3], [-5, 1]]
  for (const [x, want] of coerced) ok(paramsOf(x).depthClass === want, `paramsOf(${x}) is class ${want}, got ${paramsOf(x).depthClass}`)
  ok(scaledMin(24, 510) === 24 && scaledMin(24, 255) === 12 && scaledMin(24, 690) === 24, 'scaledMin: 24@510, 12@255, 24@690 (capped at the absolute)')
  // floor, not round: 24*230/510 = 10.82 -> 10, 24*460/510 = 21.65 -> 21, 4*330/510 = 2.59 -> 2 (round would give 11, 22, 3)
  ok(scaledMin(24, 230) === 10 && scaledMin(24, 460) === 21 && scaledMin(4, 330) === 2, 'scaledMin floors: 24@230 is 10, 24@460 is 21, 4@330 is 2')
}

// tests 1-4 per class: valid under its own class, ring valid, beacon band, attempt-0 floor
function perClass(seeds: readonly number[]): void {
  const n = seeds.length
  for (const c of CLASSES) {
    const p = paramsOf(c)
    let a0 = 0, fb = 0, lo = Infinity, hi = 0
    for (const s of seeds) {
      const r = caveOf(s, c), v = validateCave(r, p), tag = `class ${c} seed ${s}: `
      ok(v.ok, tag + `valid under its params (${v.why})`)
      const bd = r.beaconDist, [bandLo, bandHi] = r.stats.fallback ? [p.fbLo, p.bdHi] : [p.bdLo, p.bdHi]
      ok(bd >= bandLo && bd <= bandHi, tag + `beaconDist ${bd} in [${bandLo}, ${bandHi}] (fallback ${r.stats.fallback})`)
      ok(r.stats.beaconDist === bd && r.tiles.length === MAP_W * MAP_H, tag + 'stats.beaconDist and tiles size')
      if (r.stats.fallback) fb++
      else if (r.stats.attempts === 1) a0++
      lo = Math.min(lo, bd); hi = Math.max(hi, bd)
      const ring = fallbackCave(s, p) // throws when the ring is rejected; the explicit verdict is the assertion
      ok(validateCave(ring, p).ok && ring.stats.fallback === true, tag + 'fallback ring valid under its class')
      ok(ring.beaconDist >= p.fbLo && ring.beaconDist <= p.bdHi, tag + `ring beaconDist ${ring.beaconDist} in [${p.fbLo}, ${p.bdHi}]`)
    }
    const floor = Math.ceil(FLOOR_FRAC[c] * n)
    ok(a0 >= floor, `class ${c}: >= ${floor} of ${n} end on attempt 0, got ${a0}`)
    console.log(`cave-class: class ${c}: ${a0}/${n} attempt 0, ${fb} fallback, bd ${lo}..${hi}`)
  }
}

// test 5: the memoised caveOf equals a fresh generateCave per class; the classes differ from each other
function determinism(): void {
  for (const c of CLASSES) for (const s of [SEEDS[0], SEEDS[1]]) {
    ok(hashOf(caveOf(s, c)) === hashOf(generateCave(s, { depthClass: c })), `class ${c} seed ${s}: caveOf equals a fresh generateCave`)
  }
  const hashes = new Set(CLASSES.map((c) => hashOf(caveOf(1, c))))
  ok(hashes.size === 4, `seed 1: the 4 classes give 4 distinct caves, got ${hashes.size}`)
}

// Copy of r keeping the first n resin pickups (plants and order untouched); the dropped ones are the tail, never the Beacon cluster.
const withResin = (r: CaveResult, n: number): CaveResult => {
  let seen = 0
  return { ...r, pickups: r.pickups.filter((q) => q.kind !== 'resin' || seen++ < n) }
}
const resinOf = (r: CaveResult): number => r.pickups.filter((q) => q.kind === 'resin').length

// test 7: rule 11 scales the count minimums by sb = max(beaconDist, p.bdLo). The ring beacon distances (231/383/515/792) never fall below
// their own class floor, so only a derived fixture tells max(bd, bdLo) from the mutants sb = bd and sb = bdLo.
function scaleBasis(): void {
  const lo = PARAMS[1], mid = PARAMS[2]
  // (a) bd below the floor: the class-1 ring (bd 231 in [lo.fbLo, lo.bdLo]) checked with class-2 params but the class-1 fallback floor.
  // sb = bdLo = 340 asks 16 resin and 16 veins, sb = bd = 231 only 10 and 10; the ring has 16 resin (playtest-tuning-1 §3,
  // trimmed to need1 - 1 below) and 13 veins, so r11 fires only if bdLo is the basis.
  const ring1raw = fallbackCave(1, lo), below = { ...mid, fbLo: lo.fbLo }
  const need1 = scaledMin(24, mid.bdLo)
  const ring1 = withResin(ring1raw, need1 - 1)
  ok(ring1.beaconDist >= below.fbLo && ring1.beaconDist < mid.bdLo, `scale (a): ring bd ${ring1.beaconDist} is under bdLo ${mid.bdLo}, over fbLo ${below.fbLo}`)
  ok(scaledMin(24, ring1.beaconDist) <= resinOf(ring1) && resinOf(ring1) < need1, `scale (a): ${resinOf(ring1)} resin sit between min@bd and min@bdLo ${need1}`)
  ok(validateCave(ring1, below).why === 'r11 counts', `scale (a): bd under the floor scales by bdLo, got ${validateCave(ring1, below).why}`)
  ok(validateCave(ring1, lo).ok, 'scale (a): control, the same ring is valid under its own class')
  // (b) bd above the floor: the class-2 ring (bd 383 > bdLo 340) scales by bd; sb = bdLo would let n - 1 resin through
  const ring2 = fallbackCave(1, mid), need2 = scaledMin(24, ring2.beaconDist)
  ok(ring2.beaconDist > mid.bdLo && need2 > scaledMin(24, mid.bdLo) && resinOf(ring2) >= need2, `scale (b): bd ${ring2.beaconDist} over bdLo, floor ${need2} > ${scaledMin(24, mid.bdLo)}`)
  ok(validateCave(withResin(ring2, need2), mid).ok, `scale (b): ${need2} resin (exactly the floor at bd) is valid`)
  ok(validateCave(withResin(ring2, need2 - 1), mid).why === 'r11 counts', `scale (b): ${need2 - 1} resin fail r11 (bdLo basis would pass them)`)
}

export function caveClassChecks(): void {
  const t0 = performance.now()
  paramRows()
  scaleBasis()
  perClass(heavy() ? SEEDS : SEEDS.filter((_, i) => i % DEFAULT_STRIDE === 0))
  determinism()
  console.log(`cave-class: ok (${Math.round(performance.now() - t0)} ms)`)
}
