// C1 devourer check: ring/orbit/never-flee brain, the exact windup -> lunge -> miss/recover timeline through the real step(),
// the 35 energy hit, lungeCd 4..6, dying 0.8 s, devourerMul table, capsule latch, determinism.
// Spec: docs/architecture-monsters-ai.md §8 (devourer FSM), §5/§5.1 (pipeline, latch); monsters-ai-2 §1 (light push); R-127 (epsilon).
// R-039/R-040: local ok(), `export function run(): void`, no import-time work, no DOM, no node: imports, L0-L3 imports only.
import type { Monster, State } from '../core/types.ts'
import { wrapPi } from '../core/math.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { devourerMul, spawnMonster } from '../entities/monster.ts'
import { devourerBrain } from '../systems/ai-devourer.ts'
import { resolveBites } from '../systems/combat.ts'
import { lightRadius } from '../systems/light.ts'
import { setDying, toRecover } from '../systems/monsters.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const K = T.monsters.devourer

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const near = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps

const idle = { keys: new Set<string>(), pressed: new Set<string>(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } }

// Open arena in zone 4 (the devourer hazard is 0 in zones 1-2): every tile floor, player mid-map, director silenced.
function arena(): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.world.beaconDist = 1 // trackDepth rewrites meta.zone every step; any tile past path distance 1 is then depth 40 = zone 4
  Object.assign(s, { monsters: [], pickups: [] })
  s.world.tiles = '.'.repeat(s.world.w * s.world.h)
  s.world.tilesHash = 31
  s.player.x = s.world.w * 16
  s.player.y = s.world.h * 16
  return s
}

const devourerAt = (s: State, d: number): Monster => spawnMonster(s, 'devourer', s.player.x + d, s.player.y, lightRadius(s))

type Ev = { kind: string; a: number; step: number }
type Tr = { ai: string; cd: number; alive: boolean; e: number; v: number }
type Timeline = { log: Ev[]; tr: Map<number, Tr>; m: Monster; s: State }

// Drives the real step() and records every new fx event (they are pruned after 30 steps) plus a per-step trace keyed by meta.steps.
// miss: the player is moved away right after the lunge event, so the locked lunge hits nothing.
function timeline(miss: boolean): Timeline {
  const s = arena(), m = devourerAt(s, 140)
  m.lungeCd = 0
  const log: Ev[] = [], tr = new Map<number, Tr>()
  let seq = s.fx.seq, moved = false
  const tick = (): void => {
    step(s, idle, DT)
    for (const e of s.fx.events) if (e.seq >= seq) { log.push({ kind: e.kind, a: e.a, step: e.step }); seq = e.seq + 1 }
    tr.set(s.meta.steps, { ai: m.ai, cd: m.lungeCd, alive: s.monsters.includes(m), e: s.player.energy, v: Math.hypot(m.vx, m.vy) })
    if (miss && !moved && log.some(e => e.kind === 'lunge')) { s.player.y -= 400; moved = true }
  }
  for (let k = 0; k < 4000 && !log.some(e => e.kind === 'windup'); k++) tick()
  ok(log.some(e => e.kind === 'windup'), 'a devourer in range with a free slot starts a windup within 4 000 steps')
  for (let k = 0; k < 400; k++) {
    const lg = log.find(e => e.kind === 'lunge')
    if (miss ? lg !== undefined && s.meta.steps >= lg.step + 130 : !s.monsters.includes(m)) break
    tick()
  }
  return { log, tr, m, s }
}

const stepsOf = (t: Timeline, kind: string, a?: number): number[] => t.log.filter(e => e.kind === kind && (a === undefined || e.a === a)).map(e => e.step)

function brain(): void {
  const s = arena()
  // ring: R * 0.85 + 30 + drift (6 px, 0.1 Hz); spec-verbatim numbers, tuning must agree
  ok(K.ringFactor === 0.85 && K.ringMarginPx === 30 && K.orbitRadS === 0.15 && K.ringSpeedPxS === 35 && K.chaseSpeedPxS === 45, 'tuning: devourer ring 0.85 / 30 / 0.15 rad/s / 35 / 45 px/s')
  const m = devourerAt(s, 200)
  devourerBrain(s, m)
  const want = lightRadius(s) * 0.85 + 30 + 6 * Math.sin(2 * Math.PI * 0.1 * s.meta.time + m.id)
  ok(near(m.ringRadius, want, 1e-9), 'ring radius is R * 0.85 + 30 + drift (' + m.ringRadius + ' vs ' + want + ')')
  // never flees: deep inside the light it keeps walking, at chase speed at most (a flee would run at ringSpeed * fleeMul = 49)
  for (const d of [40, 0.9 * lightRadius(s), 120]) {
    m.x = s.player.x + d
    m.y = s.player.y
    m.fleeing = true
    const v = devourerBrain(s, m)
    ok(!m.fleeing && Math.hypot(v[0], v[1]) <= K.chaseSpeedPxS + 1e-9, 'never flees at d = ' + d.toFixed(0) + ' (speed ' + Math.hypot(v[0], v[1]).toFixed(2) + ')')
  }
  // orbit: the ring angle advances orbitDir * 0.15 rad per second
  const a0 = m.ringAngle
  devourerBrain(s, m)
  ok(near(wrapPi(m.ringAngle - a0), m.orbitDir * 0.15 / 60, 1e-12), 'ring angle orbits by orbitDir * 0.15 / 60 per step')
  // speed: ring speed 35 close to the ring, chase 45 beyond 80 px off it
  const speeds = [190, 300].map(d => {
    m.x = s.player.x + d
    const v = devourerBrain(s, m)
    return [Math.abs(d - m.ringRadius), Math.hypot(v[0], v[1])]
  })
  ok(speeds[0][0] > 12 && speeds[0][0] <= 80 && near(speeds[0][1], 35, 1e-6), 'near the ring: 35 px/s (off ' + speeds[0][0].toFixed(1) + ', ' + speeds[0][1] + ')')
  ok(speeds[1][0] > 80 && near(speeds[1][1], 45, 1e-6), 'more than 80 px off the ring: chase 45 px/s (off ' + speeds[1][0].toFixed(1) + ', ' + speeds[1][1] + ')')
}

function orbit(): void {
  // through step(): 300 steps on the ring, cooldown held high so no windup starts
  const s = arena(), m = devourerAt(s, 170)
  m.lungeCd = 1e9
  const a0 = m.ringAngle
  let vMax = 0
  for (let k = 0; k < 300; k++) {
    step(s, idle, DT)
    ok(m.ai === 'ring' && !m.fleeing, 'stays in ring, never flees (step ' + k + ')')
    vMax = Math.max(vMax, Math.hypot(m.vx, m.vy))
  }
  ok(near(wrapPi(m.ringAngle - a0), m.orbitDir * 0.75, 1e-9), 'ring angle moved 0.15 rad/s * 5 s = 0.75 rad (got ' + wrapPi(m.ringAngle - a0) + ')')
  const moved = wrapPi(Math.atan2(m.y - s.player.y, m.x - s.player.x) - a0) * m.orbitDir
  ok(moved > 0.3, 'the shade really orbits in its direction (' + moved.toFixed(3) + ' rad)')
  const d = Math.hypot(m.x - s.player.x, m.y - s.player.y)
  ok(Math.abs(d - m.ringRadius) <= 25 && vMax <= K.chaseSpeedPxS + 1e-9, 'sits on its ring (off ' + (d - m.ringRadius).toFixed(1) + ' px, vmax ' + vMax.toFixed(1) + ')')
}

function hit(): void {
  const t = timeline(false), w0 = stepsOf(t, 'windup', 0), w1 = stepsOf(t, 'windup', 1), lg = stepsOf(t, 'lunge'), fh = t.log.filter(e => e.kind === 'flameHit')
  ok(w0.length === 1 && w1.length === 1 && lg.length === 1, 'one windup a=0, one windup a=1, one lunge event (' + w0.length + w1.length + lg.length + ')')
  ok(w1[0] === w0[0] + 24 && lg[0] === w0[0] + 48, 'beat 2 at +24 steps (0.4 s), lunge at +48 steps (0.8 s): ' + (w1[0] - w0[0]) + ' / ' + (lg[0] - w0[0]))
  ok(t.tr.get(w0[0] + 47)?.ai === 'windup' && t.tr.get(w0[0] + 48)?.ai === 'lunge', 'still winding up one step before the lunge, lunging on it')
  ok(fh.length === 1 && fh[0].a === 35, 'one energy hit of 35 (' + fh.map(e => e.a) + ')')
  const h = fh[0].step, dt = h - lg[0]
  ok(dt >= 1 && dt <= Math.ceil((K.contactS + T.parry.lateMaxS) * 60), 'bite inside the contact window, lunge step ' + dt)
  ok(t.m.contactT >= 0 && t.m.contactT <= K.contactS + 1e-9, 'capsule latched by contactS 0.30 (contactT ' + t.m.contactT + ')')
  ok(near((t.tr.get(h - 1)?.e ?? 0) - (t.tr.get(h)?.e ?? 0), 35, 0.1), 'player energy dropped by 35')
  ok(stepsOf(t, 'monsterDie')[0] === h && t.m.ai === 'dying', 'the biting devourer dies at the flame')
  ok(t.tr.get(h + 47)?.alive === true && t.tr.get(h + 48)?.alive === false, 'dying lasts 0.8 s: alive at +47 steps, gone at +48')
  // determinism: same seed twice -> identical event log and trace
  const u = timeline(false)
  ok(JSON.stringify(t.log) === JSON.stringify(u.log) && JSON.stringify([...t.tr]) === JSON.stringify([...u.tr]), 'same seed twice: identical results')
}

function miss(): void {
  const t = timeline(true), lg = stepsOf(t, 'lunge')[0]
  ok(!t.log.some(e => e.kind === 'flameHit'), 'the player moved away: no hit')
  ok(t.tr.get(lg + 35)?.ai === 'lunge' && t.tr.get(lg + 36)?.ai === 'recover', 'miss after 0.60 s: lunge at +35 steps, recover at +36')
  ok(t.tr.get(lg + 125)?.ai === 'recover' && t.tr.get(lg + 126)?.ai === 'ring', 'recover lasts 1.5 s, back to ring at +90 steps')
  const cd = t.tr.get(lg + 36)?.cd ?? 0
  ok(cd >= 4 && cd <= 6, 'lungeCd after the miss is within [4, 6] (' + cd + ')')
  ok(near(cd - (t.tr.get(lg + 37)?.cd ?? 0), DT, 1e-12), 'the cooldown counts down by dt')
  // the draw is a real randRange: many recovers spread over the whole interval
  const s = arena(), m = devourerAt(s, 140)
  const cds: number[] = []
  for (let k = 0; k < 60; k++) { toRecover(s, m); cds.push(m.lungeCd) }
  ok(Math.min(...cds) >= 4 && Math.max(...cds) <= 6 && Math.max(...cds) - Math.min(...cds) > 1, 'lungeCd = randRange(4, 6) over 60 draws')
}

function recover(): void {
  // back-off: outward to ring + 40 at 1.2 * 35 = 42 px/s, 1.5 s, then ring
  const s = arena(), m = devourerAt(s, 150)
  m.ai = 'recover'
  m.aiT = 0
  m.aiDur = K.recoverS
  m.lungeCd = 1e9
  const d0 = 150
  let vMax = 0
  for (let k = 1; k <= 90; k++) {
    step(s, idle, DT)
    vMax = Math.max(vMax, Math.hypot(m.vx, m.vy))
    ok(m.ai === (k < 90 ? 'recover' : 'ring'), 'recover ends exactly at step 90 (step ' + k + ' is ' + m.ai + ')')
  }
  const gain = Math.hypot(m.x - s.player.x, m.y - s.player.y) - d0
  ok(vMax <= 42 + 1e-9 && vMax > 30, 'back-off speed peaks at 42 px/s (' + vMax.toFixed(2) + ')')
  ok(gain > 10 && gain <= 41, 'backed off outward toward ring + 40 (' + gain.toFixed(1) + ' px)')
}

function dyingAndLight(): void {
  const s = arena(), m = devourerAt(s, 300)
  m.lungeCd = 1e9
  setDying(s, m)
  ok(m.aiDur === 0.8, 'dyingS is 0.8')
  for (let k = 1; k <= 48; k++) {
    step(s, idle, DT)
    ok(s.monsters.includes(m) === (k < 48), 'dying removed exactly at step 48 (step ' + k + ')')
  }
  // monsters-ai-2 §1: nearest live devourer pushes the light: distance -> multiplier within 0.001
  const l = arena(), d = devourerAt(l, 260)
  for (const [x, want] of [[260, 1], [200, 0.909], [170, 0.825], [120, 0.694], [80, 0.65]]) {
    d.x = l.player.x + x
    ok(near(devourerMul(l), want, 0.001), 'devourerMul at ' + x + ' px is ' + want + ' (got ' + devourerMul(l).toFixed(4) + ')')
  }
}

function latch(): void {
  // monsters-ai §5.1: capsule latch at rp + rm + biteSlack = 10 + 30 + 6 = 46 px for the devourer (the 24 / 12 px worked example is the
  // lurker's 23 px threshold; both of those distances are inside 46)
  const s = arena(), m = devourerAt(s, 60)
  Object.assign(m, { ai: 'lunge', aiT: 0, contactT: -1, lastX: s.player.x + 60, x: s.player.x + 47 })
  resolveBites(s)
  ok(m.contactT === -1, 'no latch at 47 px (threshold 46)')
  Object.assign(m, { lastX: s.player.x + 47, x: s.player.x + 45 })
  resolveBites(s)
  ok(m.contactT >= 0, 'latch at 45 px')
}

export function run(): void {
  brain()
  orbit()
  hit()
  miss()
  recover()
  dyingAndLight()
  latch()
}
