// A29 run lifecycle checks: startRun / endRun / checkEnd / genStep / stepScreens / step. Spec: architecture-systems.md §1-§3,
// architecture-state-2.md §10, architecture-systems-4.md §3.1, R-038/R-040. Exports run(); no side effect on import; DOM-free.
import type { Input } from '../main.ts'
import type { CaveResult, Monster, Rock, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { hashSeed } from '../core/rng.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { finalizeCave, generateCave, MAX_ATTEMPTS } from '../world/generate.ts'
import { fallbackCave } from '../world/gen/fallback.ts'
import { isExplored } from '../world/explored.ts'
import { checkEnd, endRun, genStep, runSeedText, startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { scriptedInput } from './input.ts'

const DT = 1 / 60
const R = T.escape.winRadiusTiles

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const none = (pressed: string[] = [], clicks = 0): Input => ({
  keys: new Set(), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false },
  clicks: Array.from({ length: clicks }, () => ({ x: 1, y: 1 })), view: { w: 640, h: 360, dpr: 1 },
})

function fresh(seed: string): State {
  const s = init()
  startRun(s, seed)
  s.settings.loaded = true
  return s
}

function atExit(s: State, dx: number, dy = 0): void {
  s.meta.phase = 'escape'
  s.player.x = (s.world.exit.tx + dx) * 32 + 16
  s.player.y = (s.world.exit.ty + dy) * 32 + 16
}

// Calls f with console.warn captured; restores it in finally. Local state only (no module-level mutable state).
function warned(f: () => void): string[] {
  const seen: string[] = [], orig = console.warn
  console.warn = (...a: unknown[]): void => { seen.push(a.join(' ')) }
  try { f() } finally { console.warn = orig }
  return seen
}

const monster = (id: number): Monster => ({
  id, kind: 'lurker', x: 100, y: 100, vx: 0, vy: 0, hp: 1, ai: 'ring', aiT: 0, aiDur: 0, beat: 0, ringAngle: 0, ringRadius: 0,
  orbitDir: 1, lungeDir: 0, lungeCd: 0, stunned: 0, seen: false, contactT: -1, stuckT: 0, behindT: 0, lastX: 100, lastY: 100, fleeing: false,
})

// Chunked generation to the end (what step() drives from the title screen); returns the finished state and the genStep calls used.
function chunked(seed: string): { s: State; calls: number } {
  const s = init()
  s.ui.genPending = seed
  let calls = 0
  while (calls < 12 && s.ui.genPending !== '') { genStep(s); calls++ }
  return { s, calls }
}

function runN(seed: string, n: number): string {
  const s = fresh(seed)
  for (let k = 0; k < n; k++) step(s, scriptedInput(k), DT)
  return JSON.stringify(s)
}

export function run(): void {
  // Memoised synchronous cave per seed (startRun copies the CaveResult, so sharing is safe); keeps the wall time down.
  const memo = new Map<string, CaveResult>()
  const cave = (seed: string): CaveResult => {
    let c = memo.get(seed)
    if (!c) memo.set(seed, c = generateCave(parseSeed(seed)))
    return c
  }
  const fr = (seed: string): State => {
    const s = init()
    startRun(s, seed, cave(seed))
    s.settings.loaded = true
    return s
  }
  for (const seed of ['1', '42', 'Ember', '4294967295']) {
    const s = fresh(seed), p = s.player, w = s.world, m = s.meta
    ok(m.screen === 'playing' && m.steps === 0 && m.runId === 1 && m.seed === parseSeed(seed), seed + ' meta')
    ok(p.x === w.entrance.tx * 32 + 16 && p.y === w.entrance.ty * 32 + 16, seed + ' player on entrance tile centre')
    ok(s.rng.gameplay === hashSeed(m.seed, 'gameplay') && s.rng.cosmetic === hashSeed(m.seed, 'cosmetic'), seed + ' rng seeded')
    ok(s.settings.lastSeed === m.seedText && s.cam.x === p.x, seed + ' lastSeed/cam')
  }
  const rnd = init()
  warned(() => startRun(rnd, '')) // random seed: a rare fallback cave logs a warning, which must not leak into the check output
  ok(/^\d+$/.test(rnd.meta.seedText) && parseSeed(rnd.meta.seedText) === rnd.meta.seed, 'empty seed: random digits round-trip')
  ok(rnd.settings.lastSeed === rnd.meta.seedText, 'empty seed: lastSeed is the random digits')
  // messy input: meta.seedText and settings.lastSeed hold the cleaned text, never the raw input
  const messy = '  9 !\u00a0', cleanText = runSeedText(messy)
  const ms = init()
  startRun(ms, messy, cave('9')) // seed 9's cave (memoised, reused below)
  ok(cleanText === '9', 'runSeedText strips whitespace and illegal characters')
  ok(messy !== cleanText, 'messy input differs from its cleaned text')
  ok(ms.settings.lastSeed === cleanText && ms.settings.lastSeed !== messy, 'lastSeed stores the sanitised seed text, not the raw input')
  ok(ms.meta.seedText === cleanText && ms.meta.seed === parseSeed('9'), 'seedText is sanitised, seed parses from it')

  // checkEnd: lose before win, Chebyshev boundary, hp clamp
  const both = fr('9')
  atExit(both, 0)
  both.player.hp = -3
  checkEnd(both)
  ok(both.meta.screen === 'dead' && both.player.hp === 0, 'lose beats win, hp clamped to 0')
  const edge = fr('9')
  atExit(edge, R)
  checkEnd(edge)
  ok(edge.meta.screen === 'won', 'win at distance winRadiusTiles')
  const out = fr('9')
  atExit(out, R + 1)
  checkEnd(out)
  ok(out.meta.screen === 'playing', 'no win at winRadiusTiles + 1')
  const diag = fr('9')
  atExit(diag, R, R) // Chebyshev: (R, R) is inside (Manhattan distance 2R would not be)
  checkEnd(diag)
  ok(diag.meta.screen === 'won', 'win at diagonal (R, R)')
  for (const [dx, dy] of [[R + 1, R], [R, R + 1], [-R - 1, -R]]) {
    const far = fr('9')
    atExit(far, dx, dy)
    checkEnd(far)
    ok(far.meta.screen === 'playing', 'no win at (' + dx + ', ' + dy + ') from the exit')
  }
  const neg = fr('9')
  atExit(neg, -R, -R)
  checkEnd(neg)
  ok(neg.meta.screen === 'won', 'win at diagonal (-R, -R)')
  const desc = fr('9')
  atExit(desc, 0)
  desc.meta.phase = 'descent'
  checkEnd(desc)
  ok(desc.meta.screen === 'playing', 'no win in descent')

  // endRun fields
  const e = fr('10')
  e.meta.time = 12.5
  e.meta.steps = 210
  e.player.hp = 3
  endRun(e, true)
  ok(e.result !== null && e.result.won && e.result.endAt === 12.5 && e.result.seconds === 3 && e.result.hpLeft === 3, 'endRun won result')
  ok(e.meta.screen === 'won' && e.ui.screenAt === 12.5 && e.fx.events.some((v) => v.kind === 'win'), 'endRun won screen/event')
  const d = fr('10')
  d.player.hp = 3
  endRun(d, false)
  ok(d.result !== null && d.result.hpLeft === 0 && d.meta.screen === 'dead' && d.fx.events.some((v) => v.kind === 'death'), 'endRun lost')
  // result.zone is the deepest zone reached (stats.deepestZone), not the current meta.zone
  const zw = fr('10'), zl = fr('10')
  for (const z of [zw, zl]) { z.meta.zone = 1; z.player.stats.deepestZone = 3 }
  endRun(zw, true)
  endRun(zl, false)
  ok(zw.result !== null && zw.result.zone === 3 && zl.result !== null && zl.result.zone === 3, 'endRun result.zone = stats.deepestZone (won and lost)')

  // chunked generation == synchronous startRun, including seeds that need more than one attempt
  // The seeds below were picked because the generator rejects attempt 0; if a generator change breaks that, pick new seeds.
  for (const seed of ['4', '13', '39', '82']) {
    const c = chunked(seed)
    ok(c.s.meta.screen === 'playing' && c.s.ui.genPending === '' && c.s.meta.steps === 0, seed + ' chunked finishes')
    ok(JSON.stringify(c.s.world) === JSON.stringify(fr(seed).world), seed + ' chunked world == sync world')
    // One genStep call per attempt: accepted attempt a (0-based) = stats.attempts a + 1 = a rejected calls + the accepting call.
    const attempts = generateCave(parseSeed(seed)).stats.attempts
    ok(c.calls === attempts, seed + ' genStep calls ' + c.calls + ' == generateCave attempts ' + attempts)
    ok(c.calls >= 2, seed + ' needs a multi-attempt generation; the cave generator changed, pick another seed')
  }
  const first = init()
  first.ui.genPending = '4'
  genStep(first)
  ok(first.ui.genPending === '4' && first.ui.genAttempt === 1 && first.meta.screen === 'title', 'rejected attempt: pending, genAttempt + 1, no run')

  // fallback: attempts 0..MAX_ATTEMPTS-1 are normal, attempt index MAX_ATTEMPTS (8 failures) uses the ring, logged once
  const fbSeed = '1'
  const viaGen = (attempt: number): { s: State; warns: string[] } => {
    const s = init()
    s.ui.genPending = fbSeed
    s.ui.genAttempt = attempt
    const warns = warned(() => genStep(s))
    return { s, warns }
  }
  const fb = viaGen(MAX_ATTEMPTS)
  const ref = init()
  warned(() => startRun(ref, fbSeed, finalizeCave(fallbackCave(parseSeed(fbSeed)))))
  ok(fb.s.ui.genPending === '' && fb.s.meta.screen === 'playing' && fb.s.ui.genAttempt === 0, 'fallback attempt finishes the run in one call')
  ok(JSON.stringify(fb.s.world) === JSON.stringify(ref.world), 'fallback attempt builds fallbackCave(seed)')
  ok(fb.warns.length === 1 && fb.warns[0].includes('fallback') && fb.warns[0].includes(fbSeed), 'fallback logs exactly one warning')
  const last = viaGen(MAX_ATTEMPTS - 1)
  ok(last.s.ui.genPending === '' && last.warns.length === 0, 'attempt MAX_ATTEMPTS - 1 is a normal attempt (no fallback warning)')
  ok(last.s.world.tiles !== ref.world.tiles, 'attempt MAX_ATTEMPTS - 1 does not build the fallback ring')

  // end lockout 0.5 s, Retry keeps the seed and bumps runId
  const dead = fr('7')
  dead.player.hp = 0
  checkEnd(dead)
  for (let i = 0; i < 20; i++) step(dead, none(), DT)
  step(dead, none(['Enter']), DT) // t = 0.35 s: past the 0.25 s screen lock, inside the 0.5 s end lock
  ok(dead.meta.screen === 'dead' && dead.ui.genPending === '', 'end lockout holds')
  for (let i = 0; i < 20; i++) step(dead, none(), DT)
  step(dead, none(['KeyT']), DT)
  for (let i = 0; i < 20 && dead.meta.screen !== 'playing'; i++) step(dead, none(), DT)
  ok(dead.meta.screen === 'playing' && dead.meta.seedText === '7' && dead.meta.runId === 2 && dead.result === null, 'retry keeps seed')
  ok(JSON.stringify(dead.world) === JSON.stringify(fr('7').world), 'retry cave == startRun cave of the same seed (genAttempt restarts at 0)')
  // Retry on a seed whose attempt 0 is rejected: starting at genAttempt 1 would yield another cave than the synchronous generator
  const dead4 = fr('4')
  dead4.player.hp = 0
  checkEnd(dead4)
  for (let i = 0; i < 40; i++) step(dead4, none(), DT)
  step(dead4, none(['KeyT']), DT)
  for (let i = 0; i < 20 && dead4.meta.screen !== 'playing'; i++) step(dead4, none(), DT)
  ok(dead4.meta.screen === 'playing' && dead4.meta.runId === 2, 'retry of seed 4 finished')
  ok(JSON.stringify(dead4.world) === JSON.stringify(fr('4').world), 'retry of a multi-attempt seed == startRun cave')

  // startRun on a REUSED state resets the run fields; ids keep counting (nextId, fx.seq, time, settings survive)
  const re = fr('3')
  re.meta.steps = 99
  re.meta.zone = 3
  re.meta.phase = 'escape'
  re.meta.time = 7
  re.monsters.push(monster(re.meta.nextId++))
  const rock: Rock = { id: re.meta.nextId++, x: 5, y: 5, size: 1, tiles: [0], t: 1, landed: false, hit: false, shrunk: false }
  re.rocks.push(rock)
  re.fx.hitstop = 0.3
  re.fx.shake = 4
  re.fx.flare = 1
  re.player.facing = 0
  re.player.hp = 1
  re.player.energy = 1
  re.player.x = 0
  re.player.y = 0
  re.world.beaconLit = true
  re.director.alive.lurker = 1
  re.director.relocates = 2
  endRun(re, false) // sets result, screen 'dead', ui.cursor/screenAt
  re.ui.cursor = 3
  re.ui.screenAt = 1
  const idNext = re.meta.nextId, seq = re.fx.seq
  startRun(re, '3')
  const ent = re.world.entrance, ei = ent.ty * re.world.w + ent.tx
  const rm = re.meta // fresh reference: TS must not carry the narrowed pre-startRun values over
  ok(rm.screen === 'playing' && rm.steps === 0 && rm.zone === 1 && rm.phase === 'descent' && rm.runId === 2, 'reused: steps/zone/phase/runId')
  ok(re.monsters.length === 0 && re.rocks.length === 0 && re.result === null, 'reused: monsters, rocks, result cleared')
  ok(re.fx.hitstop === 0 && re.fx.shake === 0 && re.fx.flare === 0 && re.fx.seq >= seq, 'reused: fx reset, seq kept')
  ok(re.player.facing === T.player.facingStart && re.player.hp === T.player.hpMax && re.player.energy === T.flame.energyMax, 'reused: player reset')
  ok(re.player.x === ent.tx * 32 + 16 && re.player.y === ent.ty * 32 + 16, 'reused: player on entrance')
  ok(!re.world.beaconLit && re.director.alive.lurker === 0 && re.director.relocates === 0, 'reused: world/director reset')
  ok(isExplored(re.world.explored, ei), 'reused: entrance tile revealed')
  ok(re.meta.time === 7 && re.ui.screenAt === 7 && re.ui.cursor === 0, 'reused: time kept, screenAt = time')
  const ids = [...re.veins, ...re.pickups].map((e) => e.id)
  ok(ids[0] === idNext && ids.every((id, i) => id === idNext + i), 'reused: ids continue from nextId in array order')
  ok(re.meta.nextId === idNext + ids.length, 'reused: nextId advances by veins + pickups only')

  // screen change lockout 0.25 s, Blur pauses at once
  const pl = fr('5')
  for (let i = 0; i < 11; i++) step(pl, none(), DT)
  step(pl, none(['Escape']), DT) // t = 0.2 s
  ok(pl.meta.screen === 'playing', 'pause locked for 0.25 s')
  step(pl, none(['Blur']), DT)
  ok(pl.meta.screen === 'paused', 'Blur pauses')
  for (let i = 0; i < 11; i++) step(pl, none(), DT)
  step(pl, none(['Escape']), DT) // 0.2 s after the pause
  ok(pl.meta.screen === 'paused', 'resume locked for 0.25 s')
  for (let i = 0; i < 4; i++) step(pl, none(), DT)
  step(pl, none(['Escape']), DT)
  ok(pl.meta.screen === 'playing', 'resume after lockout')

  // hitstop freezes the world, advances clocks and buffers a click
  const h = fr('5')
  h.fx.hitstop = 0.05
  const x0 = h.player.x, st0 = h.meta.steps, t0 = h.meta.time
  step(h, { ...none([], 1), keys: new Set(['KeyD']) }, DT)
  ok(h.player.x === x0 && h.meta.steps === st0 + 1 && h.meta.time === t0 + DT && h.player.swing.buffer > 0, 'hitstop freezes world, clock runs')
  ok(Math.abs(h.fx.hitstop - (0.05 - DT)) < 1e-12, 'hitstop decrements by dt')

  // determinism: same seed and scripted input give the same State
  ok(runN('42', 900) === runN('42', 900), 'same seed + input => same State after 900 steps')
  ok(runN('42', 300) !== runN('43', 300), 'different seeds differ')
}
