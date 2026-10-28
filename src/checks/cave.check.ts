// Cave generator check, part 1: CG4 §7 tests 1-5, 7, 8 (tests 6, 9-15 live in cave-extra.check.ts). Written from the spec text and the
// exported signatures (R-162); expectations come from CG2/CG4/rulings, never from reading generator bodies.
// Rulings used: R-107 (budgets), R-111 (attempt seeding), R-153 (quota formula), R-115/R-160 (mainLoop), R-165 (fallback attempt 8).
import type { CaveResult, Pickup } from '../core/types.ts'
import { MAP_H, MAP_W, TILE } from '../core/state.ts'
import { hashSeed } from '../core/rng.ts'
import { parseSeed } from '../core/seed.ts'
import { depthOf, zoneOfDepth } from '../core/score.ts'
import { T } from '../core/tuning.ts'
import { bfs4 } from '../world/bfs.ts'
import { carveCore, caveSeed, finalizeCave, generateCave } from '../world/generate.ts'
import { hasAlternativeRoute } from '../world/gen/loops.ts'
import { populate } from '../world/gen/populate.ts'
import { quota } from '../world/gen/resin.ts'
import { validateCave } from '../world/validate.ts'
import { caveOf, primeCave } from './caves.ts'

export function ok(cond: boolean, msg: string): void { if (!cond) throw new Error('cave check: ' + msg) }
export const eq = (a: unknown, b: unknown, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), msg)
export const SEEDS: readonly number[] = [0, ...Array.from({ length: 60 }, (_, i) => i + 1), 4294967295] // CG4 §7 test 2: 62 seeds
const W = MAP_W, H = MAP_H

// Everything the tests derive from a result's tiles string alone (independent of generator state).
export type Info = { g: Uint8Array; e: number; b: number; d: Int32Array; dB: Int32Array; main: number[]; wide2: Uint8Array; near: Uint8Array; bd: number }
const infos = new WeakMap<CaveResult, Info>()
export function info(r: CaveResult): Info {
  const hit = infos.get(r)
  if (hit) return hit
  const g = new Uint8Array(W * H)
  for (let i = 0; i < g.length; i++) g[i] = r.tiles.charCodeAt(i) === 35 ? 1 : 0
  const e = r.entrance.ty * W + r.entrance.tx, b = r.beacon.ty * W + r.beacon.tx
  const d = bfs4(g, W, H, e), dB = bfs4(g, W, H, b), main: number[] = [], wide2 = new Uint8Array(W * H), near = new Uint8Array(W * H)
  for (let c = b; c !== e;) { // CG2 §2: main = from the Beacon step to the first E,S,W,N neighbour with dist - 1
    main.push(c)
    const n = [c + 1, c + W, c - 1, c - W].find((j) => !g[j] && d[j] === d[c] - 1)
    if (n === undefined) throw new Error('cave check: main walk broke at ' + c)
    c = n
  }
  main.push(e); main.reverse()
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const i = y * W + x
    if (!g[i] && !g[i + 1] && !g[i + W] && !g[i + W + 1]) wide2[i] = wide2[i + 1] = wide2[i + W] = wide2[i + W + 1] = 1
  }
  for (const m of main) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) near[m + dy * W + dx] = 1 // Chebyshev <= 3
  const v = { g, e, b, d, dB, main, wide2, near, bd: r.beaconDist }
  infos.set(r, v)
  return v
}
export const tileOf = (p: { x: number; y: number }): number => Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE)
export const zoneIn = (I: Info, i: number): number => zoneOfDepth(depthOf(I.d[i], I.bd))
export const cheb = (a: number, b: number): number => Math.max(Math.abs(a % W - b % W), Math.abs(Math.floor(a / W) - Math.floor(b / W)))

// CG4 §3: the Beacon cluster = the 3 resin nearest the Beacon by path: 1 large + 2 small, dist in [bd-40, bd-8], >= 3 apart, outside the mask.
export function cluster(r: CaveResult, I: Info, label: string): Pickup[] {
  const c = r.pickups.filter((p) => p.kind === 'resin').sort((a, b) => I.dB[tileOf(a)] - I.dB[tileOf(b)]).slice(0, 3)
  ok(c.length === 3 && c.filter((p) => p.size === 'large').length === 1, label + ': cluster is 1 large + 2 small resin')
  const mask = new Set(r.chamber)
  for (const p of c) {
    const i = tileOf(p)
    ok(I.d[i] >= I.bd - 40 && I.d[i] <= I.bd - 8, label + ': cluster dist in [bd-40, bd-8]')
    ok(!mask.has(i), label + ': cluster outside the Beacon chamber')
  }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) ok(cheb(tileOf(c[a]), tileOf(c[b])) >= 3, label + ': cluster items >= 3 apart')
  return c
}

// Fields that must be identical for the same seed (test 1).
const sameCave = (a: CaveResult, b: CaveResult, msg: string): void => {
  ok(a.tiles === b.tiles, msg + ': tiles')
  eq([a.veins, a.pickups, a.spawns, a.rngState, a.stats.ecc, a.stats.treeDraws], [b.veins, b.pickups, b.spawns, b.rngState, b.stats.ecc, b.stats.treeDraws], msg)
}

// test 1: same seed identical (CG4 §7 test 1)
function sameSeed(): void {
  const a = generateCave(1234), b = generateCave(1234)
  sameCave(a, b, 'generateCave(1234) twice')
  eq(a, b, 'generateCave(1234) twice, whole result')
  const e = parseSeed('EmberCave')
  ok(Number.isInteger(e) && e >= 0 && e <= 4294967295, 'parseSeed text gives a uint32')
  sameCave(generateCave(e), generateCave(parseSeed('EmberCave')), "parseSeed('EmberCave') twice")
  ok(validateCave(generateCave(e)).ok, "parseSeed('EmberCave') cave valid")
  ok(a.tiles !== generateCave(1235).tiles, 'different seeds give different caves')
}

// R-111: caveSeed(seed, a) = a === 0 ? seed >>> 0 : hashSeed(seed >>> 0, 'cave:' + a), pinned independently of caveSeed's own code.
function seedingPin(): void {
  for (const s of [0, 7, 1234, 4294967295]) {
    ok(caveSeed(s, 0) === s, `caveSeed(${s}, 0) is the seed itself`)
    for (let a = 1; a < 8; a++) ok(caveSeed(s, a) === hashSeed(s, 'cave:' + a), `caveSeed(${s}, ${a}) = hashSeed(seed, 'cave:${a}')`)
  }
  ok(caveSeed(-1, 0) === 4294967295 && caveSeed(2 ** 32 + 5, 0) === 5, 'caveSeed wraps the seed with >>> 0')
}

// Replays attempt a of the R-111 sequence: the result must be what generateCave returned (first valid attempt wins).
function retrace(seed: number, r: CaveResult): void {
  const k = r.stats.attempts
  for (let a = 0; a < k; a++) {
    const cs = caveSeed(seed, a), core = carveCore(cs), res = core && populate(core, cs, a)
    if (a < k - 1) { ok(!res || !validateCave(res).ok, `seed ${seed}: attempt ${a} was valid but not taken`); continue }
    if (!res) throw new Error(`cave check: seed ${seed}: attempt ${a} gave no result but stats.attempts is ${k}`)
    ok(res.tiles === r.tiles, `seed ${seed}: result is attempt ${a} (stats.attempts ${k})`)
    eq([res.veins, res.pickups, res.spawns, res.rngState], [r.veins, r.pickups, r.spawns, r.rngState], `seed ${seed}: attempt ${a} placement`)
    ok(res.stats.attempts === k && r.rngState === hashSeed(cs, 'cave:spare') >>> 0, `seed ${seed}: attempts / cave:spare state`)
  }
}

// test 2: 62 seeds valid, >= 50 on attempt 0, none uses the fallback; logs ecc, treeDraws, beaconDist per seed
function validSeeds(): void {
  let first = 0
  const line: string[] = []
  SEEDS.forEach((s, k) => {
    const r = caveOf(s), v = validateCave(r)
    ok(v.ok, `seed ${s} valid (${v.why})`)
    ok(!r.stats.fallback, `seed ${s} did not use the fallback`)
    ok(r.tiles.length === W * H && /^[#.,]+$/.test(r.tiles), `seed ${s} tiles size and alphabet`)
    ok(r.exit.tx === r.entrance.tx && r.exit.ty === r.entrance.ty, `seed ${s} exit equals entrance`)
    ok(r.stats.attempts >= 1 && r.stats.attempts <= 8, `seed ${s} attempts 1..8`)
    ok(r.stats.beaconDist === r.beaconDist, `seed ${s} stats.beaconDist`)
    ok(r.stats.ecc >= 12 && r.stats.ecc <= 14 || r.stats.treeDraws === 64, `seed ${s} ecc window`)
    if (k % 20 === 0) eq(generateCave(s), r, `seed ${s}: fresh generateCave equals the memoised result`) // 4 seeds; the memo is the timed run
    if (r.stats.attempts === 1) first++
    if (r.stats.attempts > 1 || s >= 1 && s <= 4) retrace(s, r)
    ok(carveCore(caveSeed(s, r.stats.attempts - 1))?.beaconDist === r.beaconDist, `seed ${s}: the accepted attempt carves the reported beaconDist`)
    line.push(`${s}:${r.stats.ecc}/${r.stats.treeDraws}/${r.beaconDist}`)
  })
  ok(first >= 50, `>= 50 of 62 end on attempt 0, got ${first}`)
  console.log(`cave: ${first}/62 on attempt 0; seed:ecc/treeDraws/beaconDist`)
  for (let i = 0; i < line.length; i += 8) console.log('cave: ' + line.slice(i, i + 8).join(' '))
}

// test 3: loops exist (invariant 6 inside validateCave + stats.loops >= 2); mainLoop is the once-per-cave R-115 stat
function loops(): void {
  for (const s of SEEDS) {
    const r = caveOf(s), I = info(r)
    ok(r.stats.loops >= 2, `seed ${s}: stats.loops >= 2, got ${r.stats.loops}`)
    ok(validateCave(r).ok, `seed ${s}: invariant 6 (validateCave)`)
    ok(r.stats.mainLoop === hasAlternativeRoute(I.g, W, H, I.e, I.b), `seed ${s}: stats.mainLoop = hasAlternativeRoute(entrance, Beacon)`)
  }
  const raw = caveOf(2), again = finalizeCave(raw)
  ok(again !== raw && again.stats !== raw.stats, 'finalizeCave returns a copy')
  eq(again, raw, 'finalizeCave is idempotent on an accepted cave')
}

// test 4: Beacon reachable with exactly beaconDist steps in [510, 690]
function beacon(): void {
  for (const s of SEEDS) {
    const r = caveOf(s), I = info(r)
    ok(r.beacon.tx >= 0 && !I.g[I.b], `seed ${s}: Beacon on floor`)
    ok(I.d[I.b] === r.beaconDist, `seed ${s}: BFS entrance -> Beacon = beaconDist (${I.d[I.b]} vs ${r.beaconDist})`)
    ok(r.beaconDist >= 510 && r.beaconDist <= 690, `seed ${s}: beaconDist in [510, 690], got ${r.beaconDist}`)
    ok(Math.max(...I.d) === r.beaconDist, `seed ${s}: beaconDist is the maximum distance`)
    ok(I.d[I.e] === 0, `seed ${s}: entrance distance 0`)
    ok(r.chamber.every((v, k) => k === 0 || r.chamber[k - 1] < v) && r.chamber.includes(I.b), `seed ${s}: chamber ascending and holds the Beacon`)
  }
}

// test 5: zones monotone along main, covering 1..4
function zones(): void {
  for (const s of SEEDS) {
    const r = caveOf(s), I = info(r), seen = new Set<number>()
    let prev = 0
    for (const i of I.main) {
      const z = zoneIn(I, i)
      ok(z >= prev, `seed ${s}: zone never decreases along main`)
      prev = z; seen.add(z)
    }
    eq([...seen].sort(), [1, 2, 3, 4], `seed ${s}: main covers zones 1..4`)
    ok(I.main.length === r.beaconDist + 1 && zoneIn(I, I.main[0]) === 1 && zoneIn(I, I.b) === 4, `seed ${s}: main runs entrance -> Beacon`)
  }
}

// playtest-tuning-1 §3 density literals (owner override of CG4 §1; per 100 path tiles) and the printed table rows (near small, near large, off small, off large, plants, veins).
const DENS = [[2.0, 2.67, 3.33, 3.33], [0, 0.67, 1.0, 1.33], [1.33, 1.33, 1.33, 1.33], [0, 0.67, 1.0, 1.0], [1.33, 1.33, 2.0, 2.0], [6.67, 6.0, 5.33, 4.67]]
const TABLE: Record<number, number[][]> = {
  510: [[3, 3, 4, 4], [0, 1, 1, 2], [2, 2, 2, 2], [0, 1, 1, 1], [2, 2, 3, 3], [9, 8, 7, 6]],
  600: [[3, 4, 5, 5], [0, 1, 2, 2], [2, 2, 2, 2], [0, 1, 2, 2], [2, 2, 3, 3], [10, 9, 8, 7]],
  690: [[3, 5, 6, 6], [0, 1, 2, 2], [2, 2, 2, 2], [0, 1, 2, 2], [2, 2, 3, 3], [12, 10, 9, 8]],
}
const restore = (p: Pickup): number => p.size === 'large' ? T.resin.largeE : T.resin.smallE

// test 7: placement counts, totals, front-loading, cluster, rule 14, teaching ranges, wide2, safe start
function placement(): void {
  for (const bd of [510, 600, 690]) DENS.forEach((row, k) => row.forEach((dens, z) => {
    const n = Math.floor(dens * (bd / 4) / 100 + 0.5 + 1e-9) // R-153 spelled out, then the exported quota() against the printed table
    ok(n === TABLE[bd][k][z] && quota(dens, bd) === n, `quota pin bd ${bd} row ${k} zone ${z + 1}`)
  }))
  ok(quota(6.67, 510) === 9, 'pinned case: 6.67 * 127.5 / 100 = 8.50425 rounds to 9')
  for (const s of SEEDS) {
    const r = caveOf(s), I = info(r), bd = I.bd, Z = bd / 4, cl = cluster(r, I, `seed ${s}`), tag = `seed ${s}: `
    const cnt = DENS.map(() => [0, 0, 0, 0, 0]), want = DENS.map((row) => row.map((d) => quota(d, bd)))
    for (const p of r.pickups) {
      const i = tileOf(p), z = zoneIn(I, i), isCl = cl.includes(p)
      ok(I.wide2[i] === 1 && I.d[i] >= 6 && !I.g[i], tag + 'pickup on wide2 floor and dist >= 6')
      ok(r.chamber.includes(i) === false, tag + 'no pickup in the Beacon chamber')
      if (p.kind === 'plant') { cnt[4][z]++; ok(r.tiles[i] === ',', tag + 'plants sit on , tiles'); continue }
      if (isCl) continue
      const nearP = I.near[i] === 1
      cnt[(nearP ? 0 : 2) + (p.size === 'large' ? 1 : 0)][z]++
      if (nearP) ok(I.d[i] <= (z - 1) * Z + 0.6 * Z, `${tag}near-path resin dist ${I.d[i]} inside the first 60% of zone ${z}`)
    }
    for (const v of r.veins) { ok(I.d[v.stand] >= 6 && !I.g[v.stand], tag + 'vein stand floor, dist >= 6'); cnt[5][zoneIn(I, v.stand)]++ }
    for (const sp of r.spawns) ok(I.d[tileOf(sp)] >= 6, tag + 'spawn dist >= 6')
    for (let k = 0; k < 6; k++) for (let z = 1; z <= 4; z++) {
      const extra = k === 0 && z === 4 ? 3 : 0 // rule 14b may add up to 3 zone-4 near-path smalls (CG4 §3)
      ok(cnt[k][z] <= want[k][z - 1] + extra, `${tag}row ${k} zone ${z}: ${cnt[k][z]} <= formula ${want[k][z - 1]}`)
    }
    for (const k of [3, 5]) for (let z = 1; z <= 4; z++) ok(cnt[k][z] === want[k][z - 1], `${tag}row ${k} zone ${z} equals the table (${cnt[k][z]} vs ${want[k][z - 1]})`)
    // playtest-tuning-1 §3: nearLarge quota is 2 in zones 3-4; a near slot can legitimately fail spacing vs the Beacon
    // cluster when the path folds back (seed 19), so row 1 keeps the cap above plus this floor instead of equality.
    for (let z = 2; z <= 4; z++) ok(cnt[1][z] >= Math.min(1, want[1][z - 1]), `${tag}row 1 zone ${z}: at least one near large where the quota has one (${cnt[1][z]} vs ${want[1][z - 1]})`)
    const resin = r.pickups.filter((p) => p.kind === 'resin'), plants = r.pickups.length - resin.length
    ok(resin.length >= 24 && resin.filter((p) => p.size === 'large').length >= 4 && plants >= 6, tag + 'rule 11 resin / large / plants minimums')
    ok(r.veins.length >= 24 && r.veins.length <= 80 && r.pickups.length <= 60, tag + 'rule 11 veins and pickups bounds')
    for (const m of ['sodium', 'copper', 'strontium']) ok(r.veins.some((v) => v.mineral === m), tag + 'each mineral has a vein')
    // rule 14 (CG4 §5), constants quoted from the spec text
    const e60 = resin.filter((p) => I.d[tileOf(p)] >= bd - 60).reduce((a, p) => a + restore(p), 0), L = Math.max(...cl.map((p) => I.dB[tileOf(p)]))
    ok(Math.min(T.flame.energyMax, e60) - 1.15 * L >= T.beacon.minStartE + 15, tag + 'rule 14a')
    const e4 = resin.filter((p) => zoneIn(I, tileOf(p)) === 4).reduce((a, p) => a + restore(p), 0)
    ok(e4 >= 1.163 * (bd / 4) + T.beacon.minStartE + 15, tag + 'rule 14b')
    teaching(r, I, tag)
  }
}

// CG2 §4 (ranges widened as in the fallback column): T1 small resin, T2 copper vein x2, T3 dark patch plant, T4 lurker.
function teaching(r: CaveResult, I: Info, tag: string): void {
  ok(r.pickups.some((p) => p.kind === 'resin' && p.size === 'small' && I.d[tileOf(p)] >= 7 && I.d[tileOf(p)] <= 20 && I.near[tileOf(p)] === 1), tag + 'T1 small resin, dist 7..20, near main')
  ok(r.veins.some((v) => v.mineral === 'copper' && v.pieces === 2 && I.d[v.stand] >= 8 && I.d[v.stand] <= 40 && zoneIn(I, v.stand) === 1), tag + 'T2 copper vein, 2 pieces')
  // T3 distance: carve window [15, 60] (R-156, rulings-3 §7; supersedes CG2 §4 local BFS <= 34 and SAE1 §5 path 7-24) + at most 6 carve steps = [15, 66]
  ok(r.pickups.some((p) => p.kind === 'plant' && r.tiles[tileOf(p)] === ',' && zoneIn(I, tileOf(p)) === 1 && I.d[tileOf(p)] >= 15 && I.d[tileOf(p)] <= 66), tag + 'T3 plant in a zone-1 dark patch, dist 15..66')
  const sp = r.spawns[0], i = sp && tileOf(sp)
  ok(r.spawns.length === 1 && sp.kind === 'lurker', tag + 'T4 exactly one lurker spawn')
  ok(I.d[i] >= 14 && I.d[i] <= 40 && [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1].every((o) => !I.g[i + o]), tag + 'T4 dist 14..40, all 8 neighbours floor')
  const eu = Math.hypot(i % W - I.e % W, Math.floor(i / W) - Math.floor(I.e / W))
  ok(eu >= 8 && eu <= 16, tag + 'T4 Euclid 8..16 tiles from the entrance, got ' + eu.toFixed(1))
}

// T3 upper bound at the validator (66 = R-156 carve window end 60 + 6 carve steps). Generated caves never sit on it, so edit a clone:
// the first zone-1 dark-patch plant moves onto a floor tile painted ',' at BFS dist exactly `at`; the other zone-1 dark-patch plants move onto
// ',' tiles painted in zone 2+ (so none of them is a T3 plant). Walls, hence every distance, are unchanged. dist 66 validates, 67 fails r12 T3.
function t3Bound(): void {
  const edit = (r: CaveResult, I: Info, at: number): CaveResult | null => {
    const t3 = r.pickups.flatMap((p, k) => (p.kind === 'plant' && r.tiles[tileOf(p)] === ',' && zoneIn(I, tileOf(p)) === 1 ? [k] : []))
    if (!t3.length) return null
    const q = structuredClone(r), c = [...r.tiles], mask = new Set(r.chamber), used = r.pickups.filter((p, k) => p.kind === 'plant' && !t3.includes(k)).map(tileOf)
    const free = (i: number): boolean => !mask.has(i) && c[i] !== '#' && I.wide2[i] === 1 && I.d[i] >= 6 && used.every((o) => cheb(o, i) >= 12)
    for (const [n, k] of t3.entries()) { // GAP.plant 12 to every other plant
      let t = -1
      for (let i = 0; i < c.length && t < 0; i++) if (free(i) && (n === 0 ? I.d[i] === at && zoneIn(I, i) === 1 : zoneIn(I, i) >= 2)) t = i
      if (t < 0) return null
      used.push(t); c[t] = ','
      q.pickups[k].x = (t % W + 0.5) * TILE; q.pickups[k].y = (Math.floor(t / W) + 0.5) * TILE
    }
    q.tiles = c.join('')
    return q
  }
  let tried = 0
  for (const seed of SEEDS) {
    const r = caveOf(seed), I = info(r), at = edit(r, I, 66), past = edit(r, I, 67)
    if (!at || !past) continue
    ok(validateCave(at).ok, `seed ${seed}: the only T3 plant at dist 66 validates (${validateCave(at).why}); regenerate fixtures`)
    ok(validateCave(past).why === 'r12 T3', `seed ${seed}: the only T3 plant at dist 67 fails rule 12 T3 (${validateCave(past).why}); regenerate fixtures`)
    tried++
  }
  ok(tried >= 1, 'T3 bound exercised on at least one seed (regenerate fixtures)')
}

// test 8 (R-107): 62 direct generations (not the memo; each result then primes the memo, so later tests skip regenerating): total < 6 000 ms, max single < 200 ms; logs mean and p95
function timeBudget(): void {
  const out: CaveResult[] = [], ms: number[] = []
  let total = 0
  generateCave(100000) // untimed warm-up on a non-timed seed: R-107 budgets are steady-state, the first call pays JIT
  for (const s of SEEDS) {
    const t0 = performance.now()
    const r = generateCave(s)
    const dt = performance.now() - t0
    out.push(r); primeCave(s, r)
    ms.push(dt); total += dt
  }
  const sorted = ms.slice().sort((a, b) => a - b), max = sorted[sorted.length - 1], p95 = sorted[Math.floor(0.95 * (sorted.length - 1))]
  console.log(`cave: 62 generations ${total.toFixed(0)} ms, mean ${(total / 62).toFixed(1)}, p95 ${p95.toFixed(1)}, max ${max.toFixed(1)}`)
  ok(total < 6000, `62 generations < 6000 ms, got ${total.toFixed(0)}`)
  ok(max < 200, `max single generation < 200 ms, got ${max.toFixed(1)}`)
  ok(out.filter((r) => r.stats.attempts === 1).length >= 50, '>= 50 of 62 on attempt 0 (R-107)')
}

export function run(): void {
  timeBudget() // test 8 (first: primes the caveOf memo)
  seedingPin()
  sameSeed() // test 1
  validSeeds() // test 2
  loops(); beacon(); zones() // tests 3, 4, 5
  placement() // test 7
  t3Bound() // test 7, T3 range
}
