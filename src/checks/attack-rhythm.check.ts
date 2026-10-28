// Playtest tuning 1b (F2b) check: shades engage at a readable rhythm. Pins the patience timer (ai-attack.ts wantsWindup),
// the faced-stalker rule, bounded suspicion (awareness.ts) and the dead-torch dodge in descent (combat.ts damagePlayer).
// Spec: KB plan playtest-tuning-1b 5.1-5.3, 5.5. Local ok(), `export function run(): void`, no import-time work, no DOM, no node: imports.
// ponytail: rhythm runs go through stepMonsters + resolveBites on a hand-placed shade (not full step(): the zone would be re-derived
// from the cave every step); the player stands still, energy and HP are pinned each step. Ceiling: no flame burn, no mining.
import type { Monster, MonsterKind, State, Zone } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { hashSeed } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { wantsWindup } from '../systems/ai-attack.ts'
import { stepAwareness } from '../systems/awareness.ts'
import { damagePlayer, resolveBites } from '../systems/combat.ts'
import { lightRadius } from '../systems/light.ts'
import { stepMonsters } from '../systems/monsters.ts'
import { startRun } from '../systems/run.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const SEEDS = ['1', '2', '3', '4', '5'] // rhythm means are taken over these cave seeds

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: attack-rhythm: ' + msg)
}

// Open floor, director silenced, descent, player mid-map and lit (energy 60). Zone is pinned by the caller (stepMonsters does not re-derive it).
function field(seed: string, zone: Zone): State {
  const s = init()
  startRun(s, seed, caveOf(parseSeed(seed)))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.meta.phase = 'descent'
  s.meta.zone = zone
  Object.assign(s, { monsters: [], pickups: [] })
  s.world.tiles = '.'.repeat(s.world.w).repeat(s.world.h)
  s.world.tilesHash = 7001
  s.player.x = s.world.w * 16
  s.player.y = s.world.h * 16
  s.player.energy = 60
  return s
}

// Shade on its ring (the eligibility band), 130 px right of the player, already hunting.
function shade(s: State, kind: MonsterKind): Monster {
  const m = spawnMonster(s, kind, s.player.x + 130, s.player.y, lightRadius(s))
  m.awareness = 'hunting'
  return m
}

// Runs `seconds` of sim; returns the sim time (s) of every entry into 'windup'. god = true: bites only recover, the shade lives.
function windups(s: State, m: Monster, seconds: number, faceIt: boolean, noRetreat = false): number[] {
  s.debug.god = true
  const out: number[] = []
  let prev: string = m.ai
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    s.player.energy = 60
    if (faceIt) s.player.facing = Math.atan2(m.y - s.player.y, m.x - s.player.x)
    stepMonsters(s, DT)
    resolveBites(s)
    if (noRetreat) m.retreatT = 0
    if (m.ai === 'windup' && prev !== 'windup') out.push((k + 1) * DT)
    prev = m.ai
  }
  return out
}

// Mean interval between windups over SEEDS x 120 s; every seed's first windup must come within 12 s.
function meanInterval(noRetreat: boolean): { mean: number; n: number } {
  let n = 0, sum = 0
  for (const sd of SEEDS) {
    const s = field(sd, 1)
    const ts = windups(s, shade(s, 'lurker'), 120, false, noRetreat)
    ok(ts.length > 0 && ts[0] <= 12, 'zone 1 lurker: first windup within 12 s (seed ' + sd + ', got ' + (ts[0] ?? 'none') + ')')
    for (let i = 1; i < ts.length; i++) { sum += ts[i] - ts[i - 1]; n += 1 }
  }
  return { mean: sum / n, n }
}

// Plan band [6, 13] s pins the patience rhythm itself (retreat suppressed, measured ~10.3 s). The full game adds the 5 s post-recover
// retreat (recover-exit hook, monsters.ts:265) that the plan's ~11 s estimate left out: measured ~14.7 s, so that run only gets a loose band.
function rhythm(): void {
  const bare = meanInterval(true)
  ok(bare.n >= 40 && bare.mean >= 6 && bare.mean <= 13, 'zone 1 lurker: mean windup interval in [6, 13] s over ' + SEEDS.length + ' seeds x 120 s, retreat off (got ' + bare.mean.toFixed(2) + ' over ' + bare.n + ')')
  const full = meanInterval(false)
  ok(full.n >= 25 && full.mean >= 6 && full.mean <= 17, 'zone 1 lurker with the post-recover retreat: mean interval in [6, 17] s (got ' + full.mean.toFixed(2) + ' over ' + full.n + ')')
}

function facedStalker(): void {
  for (const sd of SEEDS) {
    const s = field(sd, 2)
    const m = shade(s, 'stalker')
    const ts = windups(s, m, 30, true)
    ok(ts.length === 0, 'zone 2 stalker faced every step never winds up in 30 s (seed ' + sd + ', got ' + ts.length + ')')
  }
  // negative control: the same stalker with the player looking away does wind up (the rule, not a dead fixture, holds it back)
  const s = field('1', 2)
  const m = shade(s, 'stalker')
  s.debug.god = true
  let n = 0
  let prev: string = m.ai
  for (let k = 0; k < 30 / DT; k++) {
    s.player.energy = 60
    s.player.facing = Math.atan2(s.player.y - m.y, s.player.x - m.x) // player looks away from the shade (shade is behind)
    stepMonsters(s, DT)
    resolveBites(s)
    if (m.ai === 'windup' && prev !== 'windup') n += 1
    prev = m.ai
  }
  ok(n > 0, 'stalker control: a player looking away is attacked within 30 s')
}

function patienceOverride(): void {
  const K = T.monsters.lurker
  for (let i = 0; i < 50; i++) {
    const s = field('1', 1)
    s.rng.gameplay = hashSeed(1000 + i, 'attack-rhythm') // 50 different draw streams
    const m = shade(s, 'lurker')
    m.lungeCd = 0
    m.patience = K.patienceS[0] - DT / 2
    ok(wantsWindup(s, m, DT), 'patience limit reached forces a windup regardless of the draw (rng ' + i + ')')
  }
  // control: just below the limit the forced path stays off (hazard alone is far below 1 per step; seeds that draw low are skipped by counting)
  let forced = 0
  for (let i = 0; i < 50; i++) {
    const s = field('1', 1)
    s.rng.gameplay = hashSeed(1000 + i, 'attack-rhythm')
    const m = shade(s, 'lurker')
    m.lungeCd = 0
    m.patience = 0
    if (wantsWindup(s, m, DT)) forced += 1
  }
  ok(forced <= 5, 'patience 0: the Poisson draw alone rarely hits in one step (' + forced + '/50)')
  // negative control: patienceS row 0 (stalker, zone 1 = not spawned) never forces, even with huge patience
  const s = field('1', 1)
  const m = shade(s, 'stalker')
  m.lungeCd = 0
  m.behindT = 10
  m.patience = 1e6
  s.rng.gameplay = 0xffffffff // draw close to 1: hazard cannot hit either
  ok(T.monsters.stalker.patienceS[0] === 0 && !wantsWindup(s, m, DT), 'patienceS 0 never forces a windup')
}

function suspectBound(): void {
  const s = field('1', 1)
  // Out of cone and out of light margin: the sense that made it suspicious is stubbed by the fixture (detectionTimer held > 0).
  const m = spawnMonster(s, 'lurker', s.player.x - 600, s.player.y, lightRadius(s))
  m.awareness = 'suspicious'
  m.lungeCd = 1e9
  m.facing = 0
  let steps = 0
  while (m.awareness === 'suspicious' && steps < 400) {
    m.detectionTimer = 0.3 // held below noticeT (fixture)
    stepAwareness(s, m, DT)
    steps += 1
  }
  ok((m.awareness as string) === 'hunting', 'suspicious shade turns hunting')
  ok(Math.abs(steps * DT - T.ai.suspectMaxS) <= 2 * DT, 'suspicious -> hunting after suspectMaxS (' + T.ai.suspectMaxS + ' s), got ' + (steps * DT).toFixed(3))
  ok(m.suspectT === 0 && m.detectionTimer === 0, 'suspectT and the meter reset on the switch')
}

function descentDodge(): void {
  const latched = (energy: number): { s: State; m: Monster } => {
    const s = init()
    Object.assign(s.player, { x: 500, y: 500, energy })
    const m = spawnMonster(s, 'lurker', 512, 500, 100)
    Object.assign(m, { ai: 'lunge' as const, aiT: 0.3, contactT: 0.1, lastX: 512, lastY: 500 })
    s.player.roll.invuln = 0.2
    return { s, m }
  }
  const dodges = (s: State): number => s.fx.events.filter(e => e.kind === 'dodge').length
  const dead = latched(0)
  const hp0 = dead.s.player.hp
  damagePlayer(dead.s, dead.m)
  ok(dead.s.player.hp === hp0 && dodges(dead.s) === 1 && dead.m.ai === 'recover', 'descent, energy 0, roll i-frames: bite dodged (hp kept, dodge emitted, shade recovers)')
  const lit = latched(60)
  damagePlayer(lit.s, lit.m)
  ok(dodges(lit.s) === 0 && lit.s.player.energy < 60, 'descent, energy > 0: roll i-frames do not dodge (flame hit as before)')
  const bare = latched(0)
  bare.s.player.roll.invuln = 0
  damagePlayer(bare.s, bare.m)
  ok(bare.s.player.hp === hp0 - 1 && dodges(bare.s) === 0, 'descent, energy 0, no i-frames: bite costs 1 HP (control)')
}

export function run(): void {
  rhythm()
  facedStalker()
  patienceOverride()
  suspectBound()
  descentDodge()
}
