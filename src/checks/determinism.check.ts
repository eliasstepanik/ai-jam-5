// A7 determinism checks. Spec: docs/architecture-determinism.md §7 (rows step32/fnv1a/hashSeed, rand, parseSeed, generateCave, sub-stream
// isolation, replay, cosmetic isolation), R-038 (startRun + step, never update), R-039/R-040 (run(), no node: imports, no side effect
// on import, DOM-free). The grep-guard row of §7 lives in scripts/check-guard.ts (R-039); migrate/computeScore rows are in their own checks.
import type { CaveResult, State } from '../core/types.ts'
import { MAP_H, MAP_W, TILE, init } from '../core/state.ts'
import { fnv1a, hashSeed, makeRnd, rand, step32 } from '../core/rng.ts'
import { SEED_MAX_LEN, parseSeed, sanitizeSeedText } from '../core/seed.ts'
import { bfs4 } from '../world/bfs.ts'
import { carveCore, caveSeed, generateCave } from '../world/generate.ts'
import { populate } from '../world/gen/populate.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'
import { scriptedInput } from './input.ts'

const DT = 1 / 60
const STEPS = 1800
const U32 = 4294967296

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: determinism: ' + msg)
}
const isU32 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n < U32

function vectors(): void {
  ok(fnv1a('') === 0x811c9dc5, 'fnv1a("") is the FNV offset basis')
  ok(fnv1a('a') === 0xe40c292c, 'fnv1a("a") is the published FNV-1a vector')
  // mulberry32 seed 0, first three outputs from the reference implementation (independent of src/core/rng.ts).
  let a = 0
  const out: number[] = []
  for (let i = 0; i < 3; i++) { const r = step32(a); a = r[0]; out.push(r[1]) }
  ok(out.join() === '1144304738,1416247,958946056', 'step32 matches reference mulberry32 for seed 0, got ' + out.join())
  const seen = new Set<number>()
  for (const [seed, tag] of [[0, ''], [0, 'a'], [1, 'a'], [777, 'gameplay'], [777, 'cosmetic'], [4294967295, 'cave:rooms']] as const) {
    const h = hashSeed(seed, tag)
    ok(isU32(h), `hashSeed(${seed}, ${tag}) is a uint32`)
    ok(hashSeed(seed, tag) === h, `hashSeed(${seed}, ${tag}) is pure`)
    seen.add(h)
  }
  ok(seen.size === 6, 'hashSeed separates seeds and tags (no collision in 6 samples)')
  // Regression pins (self-recorded, not independent): a change to the mixing silently re-rolls every saved/shared seed.
  ok(hashSeed(777, 'gameplay') === 201950518 && hashSeed(777, 'cosmetic') === 1535906421, 'hashSeed pinned vectors for seed 777')
}

function randChecks(): void {
  const s = init()
  s.rng.gameplay = hashSeed(1, 'gameplay')
  s.rng.cosmetic = hashSeed(1, 'cosmetic')
  const cos = s.rng.cosmetic
  let sum = 0
  for (let i = 0; i < 10000; i++) {
    const r = rand(s, 'gameplay')
    ok(r >= 0 && r < 1, 'rand in [0, 1), got ' + r)
    sum += r
  }
  const mean = sum / 10000
  ok(mean >= 0.48 && mean <= 0.52, 'rand mean in [0.48, 0.52], got ' + mean)
  ok(s.rng.cosmetic === cos, 'drawing gameplay does not advance the cosmetic stream')
  const r1 = makeRnd(5), r2 = makeRnd(5)
  ok(r1.next() === r2.next() && r1.int(0, 9) === r2.int(0, 9) && r1.state() === r2.state(), 'makeRnd is deterministic in its seed')
}

function seedChecks(): void {
  const rows: [string, string, number][] = [
    ['123', '123', 123],
    ['0007', '0007', 7],
    ['9999999999', '9999999999', fnv1a('9999999999')],
    ['4294967295', '4294967295', 4294967295],
    ['4294967296', '4294967296', fnv1a('4294967296')],
    ['Ember Cave!', 'EmberCave', fnv1a('embercave')],
    ['<script>', 'script', fnv1a('script')],
  ]
  for (const [raw, text, seed] of rows) {
    ok(sanitizeSeedText(raw) === text, `sanitizeSeedText(${JSON.stringify(raw)}) === ${JSON.stringify(text)}`)
    ok(parseSeed(raw) === seed, `parseSeed(${JSON.stringify(raw)}) === ${seed}, got ${parseSeed(raw)}`)
  }
  ok(parseSeed('EMBERcave') === parseSeed('embercave'), 'text seeds are case-insensitive')
  for (const raw of ['', '   ', '!!!', '<>']) ok(sanitizeSeedText(raw) === '', `${JSON.stringify(raw)} sanitises to empty (random-seed case, R-028)`)
  const long = 'x'.repeat(SEED_MAX_LEN + 8)
  ok(sanitizeSeedText(long).length === SEED_MAX_LEN, 'seed text is cut to SEED_MAX_LEN')
  ok(parseSeed(long) === fnv1a('x'.repeat(SEED_MAX_LEN)), 'a long seed hashes its first SEED_MAX_LEN characters')
  const r = makeRnd(99) // deterministic stand-in for "100 random uint32"
  for (let i = 0; i < 100; i++) {
    const n = r.int(0, 65535) * 65536 + r.int(0, 65535)
    ok(isU32(parseSeed(String(n))) && parseSeed(String(n)) === n, `parseSeed(String(${n})) round-trips`)
  }
}

function caveChecks(): void {
  for (const seed of [3, 4294967295]) {
    const a = generateCave(seed), b = generateCave(seed)
    ok(JSON.stringify(a) === JSON.stringify(b), `generateCave(${seed}) twice is deep-equal`)
  }
  for (let seed = 1; seed <= 20; seed++) { // caveOf memoises, so the cave checks in the same process share the generation cost
    const c = caveOf(seed), W = MAP_W, tag = `cave ${seed}: `
    ok(c.tiles.length === MAP_W * MAP_H, tag + 'tiles.length === 76800')
    const g = new Uint8Array(W * MAP_H)
    for (let i = 0; i < g.length; i++) g[i] = c.tiles.charCodeAt(i) === 35 ? 1 : 0 // '#'
    const e = c.entrance.ty * W + c.entrance.tx, b = c.beacon.ty * W + c.beacon.tx, d = bfs4(g, W, MAP_H, e)
    ok(!g[e] && !g[b], tag + 'entrance and Beacon are floor')
    ok(d[b] >= 0 && d[b] === c.beaconDist, tag + 'Beacon reachable, beaconDist is the BFS distance')
    ok(c.beaconDist >= 459, tag + 'beaconDist >= 459 (fallback floor), got ' + c.beaconDist)
    for (const v of c.veins) ok(!g[v.stand] && d[v.stand] >= 0, tag + `vein ${v.mineral} stand is reachable floor`)
    for (const p of c.pickups) {
      const i = Math.floor(p.y / TILE) * W + Math.floor(p.x / TILE)
      ok(!g[i] && d[i] >= 0, tag + `${p.kind} pickup is on reachable floor`)
    }
  }
  // Sub-stream isolation (R-159): populate with one pass skipped keeps every other pass identical. Goes through carveCore + populate
  // because generateCave rejects a skip result (validator rule 11) and would return the fallback ring instead.
  const seed = 7, a = caveOf(seed).stats.attempts - 1, cs = caveSeed(seed, a), core = carveCore(cs)
  ok(core !== null, 'seed 7 carves on its accepted attempt')
  const full = core && populate(core, cs, a)
  ok(full !== null && full.veins.length > 0, 'full populate of seed 7 yields veins')
  const lists = ['veins', 'pickups', 'spawns'] as const
  for (const pass of lists) {
    const r: CaveResult | null = core && populate(core, cs, a, { skip: [pass] })
    ok(r !== null && full !== null, `populate with ${pass} skipped returns a result`)
    if (r === null || full === null) return
    ok(r.tiles === full.tiles && r.rngState === full.rngState, `skipping ${pass} leaves tiles and the spare stream unchanged`)
    ok(r[pass].length === 0 && full[pass].length > 0, `skipping ${pass} empties exactly that list`)
    for (const other of lists.filter((p) => p !== pass))
      ok(JSON.stringify(r[other]) === JSON.stringify(full[other]), `skipping ${pass} leaves ${other} unchanged (sub-stream isolation)`)
  }
}

function fresh(): State {
  const s = init()
  startRun(s, '777', caveOf(parseSeed('777'))) // startRun copies the shared CaveResult
  s.settings.loaded = true // R-042: Node has no localStorage
  return s
}

function replay(s: State): void {
  for (let k = 0; k < STEPS; k++) step(s, scriptedInput(k), DT)
}

// The groups that gameplay owns (determinism §7 cosmetic row): cosmetic fields (hitFlash, monster.seen, fx, cam, ui) are left out.
function gameplay(s: State): string {
  return JSON.stringify({
    player: { ...s.player, hitFlash: 0 }, monsters: s.monsters.map((m) => ({ ...m, seen: false })), rocks: s.rocks, world: s.world,
    phase: s.meta.phase, steps: s.meta.steps, screen: s.meta.screen, gameplay: s.rng.gameplay, veins: s.veins, pickups: s.pickups,
  })
}

function replayChecks(): void {
  const a = fresh(), b = fresh()
  ok(JSON.stringify(a) === JSON.stringify(b), 'two startRun(777) states are identical before stepping')
  replay(a)
  replay(b)
  ok(a.meta.steps > 0, 'the replay actually advanced the simulation')
  ok(JSON.stringify(a) === JSON.stringify(b), `same seed + same scripted input: identical State after ${STEPS} steps`)
  const c = fresh()
  c.rng.cosmetic = (c.rng.cosmetic ^ 0x5bd1e995) >>> 0
  ok(c.rng.cosmetic !== fresh().rng.cosmetic, 'cosmetic stream was perturbed')
  replay(c)
  ok(gameplay(a) === gameplay(c), 'a different cosmetic stream does not change gameplay groups (cosmetic isolation)')
  const d = fresh()
  d.rng.gameplay = (d.rng.gameplay ^ 0x5bd1e995) >>> 0
  replay(d)
  ok(gameplay(a) !== gameplay(d), 'a different gameplay stream does change gameplay (the isolation check can fail)')
}

export function run(): void {
  vectors()
  randChecks()
  seedChecks()
  caveChecks()
  replayChecks()
}
