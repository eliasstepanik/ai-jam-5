// L3 systems: run lifecycle (start, chunked cave generation, end, win/lose). Spec: docs/architecture-modules-systems.md S3,
// architecture-systems.md §3, architecture-state-2.md §10 steps 1-7, architecture-systems-4.md §3.1, architecture-scoring-and-save.md §5,
// chunked generation architecture-scale-and-economy.md §4 (SAE1) / architecture-cave-generation-3.md §7, fallback warning
// architecture-cave-generation-2.md §6 step 6, R-001, R-035, R-037, R-111, R-160, R-165.
// Storage: endRun ends with commitBest(s), genStep saves the settings (lastSeed) right after startRun (R-168).
import type { CaveResult, State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { initPlayer, MAP_H, MAP_W, TILE } from '../core/state.ts'
import { fnv1a, hashSeed } from '../core/rng.ts'
import { parseSeed, randomSeed, sanitizeSeedText } from '../core/seed.ts'
import { computeScore } from '../core/score.ts'
import { commitBest, saveSettings } from '../core/storage.ts'
import { carveCore, caveSeed, finalizeCave, generateCave, MAX_ATTEMPTS } from '../world/generate.ts'
import { populate } from '../world/gen/populate.ts'
import { fallbackCave } from '../world/gen/fallback.ts'
import { paramsOf } from '../world/gen/params.ts'
import { validateCave } from '../world/validate.ts'
import { revealAround } from '../world/explored.ts'
import { lightRadius } from './light.ts'
import { emit } from './fx.ts'

// Seed text of a run: sanitised input, or the digits of a fresh random seed (state-2 §10 step 1; crypto lives in seed.ts).
// Digits parse back to the same uint32, so Retry and the copied link replay the run.
export const runSeedText = (raw: string): string => sanitizeSeedText(raw) || String(randomSeed())

// state-2 §10 steps 1-7. `cave` is the finished result of the chunked loop (genStep); without it the cave is generated
// synchronously (checks, R-038). Keeps meta.time, meta.nextId, settings, best, ui.storageOk, debug and fx.seq.
// `depthClass` (R-164, optional, default 3) picks the cave preset; paramsOf rounds and clamps it once. An already finished `cave` is
// taken as is (its class was chosen by the caller), the class is then only recorded on the world.
export function startRun(s: State, seedText: string, cave?: CaveResult, depthClass?: number): void {
  const text = runSeedText(seedText) // 1
  const seed = parseSeed(text)
  const dc = paramsOf(depthClass).depthClass
  const c = cave ?? generateCave(seed, { depthClass: dc }) // 2
  const n = MAP_W * MAP_H
  s.world = {
    w: MAP_W, h: MAP_H, tiles: c.tiles, tilesHash: fnv1a(c.tiles),
    entrance: { ...c.entrance }, exit: { ...c.exit }, beacon: { ...c.beacon },
    beaconDist: Math.max(1, c.beaconDist), beaconLit: false, explored: new Array<number>(Math.ceil(n / 32)).fill(0),
    solidSig: 0, exploreKey: -1, pendingSig: 0, beaconLitAt: 0, veinGen: 0,
    ...(dc !== 3 && { depthClass: dc }), // ponytail: key absent for class 3 (undefined means 3), so class-3 worlds stay byte-identical
  }
  // Ids in array order, veins then pickups (systems §3, determinism §4). Copies: the CaveResult may be shared (checks memo).
  s.veins = c.veins.map((v) => ({ ...v, id: s.meta.nextId++ }))
  s.pickups = c.pickups.map((p) => ({ ...p, id: s.meta.nextId++ }))
  s.rng.cave = c.rngState
  if (c.stats.fallback) console.warn('[cave] fallback ring used for seed ' + text) // CG2 §6 step 6: logged once by startRun, not by the pure generator
  const p = initPlayer() // 3
  p.x = c.entrance.tx * TILE + TILE / 2
  p.y = c.entrance.ty * TILE + TILE / 2
  p.facing = T.player.facingStart
  s.player = p
  s.monsters = [] // 4
  s.rocks = []
  s.result = null
  s.fx = { shake: 0, shakeMag: 0, flare: 0, beaconFlash: 0, hitstop: 0, seq: s.fx.seq, events: [] }
  const m = s.meta // 5
  m.seed = seed
  m.seedText = text
  m.screen = 'playing'
  m.phase = 'descent'
  m.steps = 0
  m.zone = 1
  m.runId += 1
  s.rng.gameplay = hashSeed(seed, 'gameplay') // 6
  s.rng.cosmetic = hashSeed(seed, 'cosmetic')
  s.director = { // 7
    spawnT: T.director.firstSpawnS, quakeT: 0, alive: { lurker: 0, stalker: 0, devourer: 0 }, escapeT: 0, relocates: 0,
  }
  s.cam = { x: p.x, y: p.y }
  s.settings.lastSeed = text
  const u = s.ui
  u.cursor = 0
  u.hover = -1
  u.screenAt = m.time
  u.confirmT = 0
  u.denyT = 0
  u.genPending = ''
  u.genAttempt = 0
  u.toasts = [] // state-2 §10: only meta, settings, best, ui.storageOk and debug survive; the old run's toasts and copy label go
  u.copied = 0
  u.copyMsg = ''
  // ponytail: ui.seedInput deliberately survives (intentional deviation from §10): clearing it would erase what the user typed in the title seed field.
  revealAround(s, p.x, p.y, lightRadius(s)) // entrance light circle with LOS (systems §3)
  emit(s, 'relight', p.x, p.y)
}

// One unit of chunked generation per update while ui.genPending !== '' (SAE1 §4, CG3 §7): one attempt, or the fallback
// once genAttempt reaches MAX_ATTEMPTS. Pure in (seed key, genAttempt, depthClass), so HMR resumes mid-way. Starts the run when done.
// ponytail: the pending class is not in State (no schema change); the caller passes it on every call, default class 3.
export function genStep(s: State, depthClass?: number): void {
  const key = s.ui.genPending
  if (key === '') return
  const seed = parseSeed(key), a = s.ui.genAttempt, p = paramsOf(depthClass)
  let cave: CaveResult | null = null
  if (a >= MAX_ATTEMPTS) cave = fallbackCave(seed, p)
  else {
    const cs = caveSeed(seed, a), core = carveCore(cs, p)
    const res = core && populate(core, cs, a)
    if (res && validateCave(res, p).ok) cave = res
    else s.ui.genAttempt = a + 1
  }
  if (cave) {
    startRun(s, key, finalizeCave(cave), p.depthClass) // R-160: finalizeCave once per accepted cave
    saveSettings(s) // lastSeed changed (scoring-and-save §6 rule 5); checks that call startRun directly never write
  }
}

// architecture-systems.md §3 endRun order; scoring-and-save §5. isNewBest/prevBest are finalised by commitBest.
export function endRun(s: State, won: boolean): void {
  const p = s.player, st = p.stats
  const seconds = Math.floor(s.meta.steps / 60)
  const hpLeft = won ? p.hp : 0
  const parts = computeScore({ depth: st.maxDepth, won, seconds, mineralsUsed: st.mineralsUsed, hpLeft })
  s.result = {
    won, depth: st.maxDepth, zone: st.deepestZone, seconds, mineralsUsed: st.mineralsUsed, hpLeft, parts,
    seed: s.meta.seed, seedText: s.meta.seedText,
    kills: st.kills, parries: st.parries, perfectParries: st.perfectParries,
    isNewBest: false, prevBest: s.best ? s.best.score : 0, endAt: s.meta.time,
  }
  s.meta.screen = won ? 'won' : 'dead'
  s.ui.cursor = 0
  s.ui.hover = -1
  s.ui.screenAt = s.meta.time
  emit(s, won ? 'win' : 'death', p.x, p.y)
  commitBest(s) // after result and score exist: sets isNewBest/prevBest, s.best and the stored record
}

// architecture-systems-4.md §3.1: lose beats win; the win needs phase 'escape' (B8 makes it reachable).
export function checkEnd(s: State): void {
  if (s.meta.screen !== 'playing') return
  const p = s.player
  if (p.hp <= 0) {
    p.hp = 0
    endRun(s, false)
    return
  }
  if (s.meta.phase !== 'escape') return
  const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE), ex = s.world.exit
  if (Math.max(Math.abs(ptx - ex.tx), Math.abs(pty - ex.ty)) <= T.escape.winRadiusTiles) endRun(s, true)
}
