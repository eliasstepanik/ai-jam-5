// A31 ai check: lurker state machine, capsule bite latch, wrapPi facing examples, devourerMul table and the 24-shade step budget.
// Spec: docs/architecture-modules-systems-2.md §1 (ai.check row), architecture-monsters-ai.md §2/§5/§5.1/§7, monsters-ai-2.md §1/§8, R-073/R-075.
// R-039/R-040: local ok(), `export function run(): void`, no import-time work, no DOM, no node: imports, no L4 imports (R-043).
// ponytail: stalker (ai-stalker.ts, B3) and devourer (ai-devourer.ts, C1) brains are not on master, so only the lurker brain and the
// shared pipeline are driven here; C3 adds the devourer rows. The stalker facing test below checks the wrapPi arithmetic that
// brain will use, not the brain itself. Add the stalker behindT rows when B3 lands.
import type { Monster, State } from '../core/types.ts'
import { wrapPi } from '../core/math.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { deg, T } from '../core/tuning.ts'
import { devourerMul, spawnMonster } from '../entities/monster.ts'
import { lurkerBrain } from '../systems/ai-lurker.ts'
import { resolveBites } from '../systems/combat.ts'
import { findSpawn } from '../systems/director.ts'
import { lightRadius } from '../systems/light.ts'
import { setDying, stepMonsters } from '../systems/monsters.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const K = T.monsters.lurker
// monsters-ai-2 §8: 3 600 steps with 24 shades, generous for CI noise. The wall-clock timer (performance.now) runs in a
// check, which check-guard does not scan and determinism §6 (clock ban in simulation code) does not cover.
const BUDGET_MS = 1000

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const near = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps

const idle = { keys: new Set<string>(), pressed: new Set<string>(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } }

// Open arena: every tile floor (only the map edge is solid), player mid-map, shades frozen out of the director's hands.
// ponytail: swaps tiles + tilesHash so the solid cache rebuilds; the cave is not needed, only the walkable plane.
function arena(): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  Object.assign(s, { monsters: [], pickups: [] })
  s.world.tiles = '.'.repeat(s.world.w * s.world.h)
  s.world.tilesHash = 31
  s.player.x = s.world.w * 16
  s.player.y = s.world.h * 16
  return s
}

const place = (s: State, dx: number, dy: number): Monster => spawnMonster(s, 'lurker', s.player.x + dx, s.player.y + dy, lightRadius(s))

function spin(s: State, n: number): void {
  for (let k = 0; k < n; k++) { stepMonsters(s, DT); resolveBites(s) }
}

function stateMachine(): void {
  // flee latch: inside the light radius flee, away from the player; hysteresis band R .. R + margin/2 keeps the latch
  const s = arena(), R = lightRadius(s)
  const m = place(s, R - 10, 0)
  const v = lurkerBrain(s, m)
  ok(m.fleeing && v[0] > 0 && Math.abs(v[1]) < 1e-9, 'inside the light: flee latch set, velocity points away')
  ok(near(Math.hypot(v[0], v[1]), K.ringSpeedPxS * T.ai.fleeMul, 1e-9), 'flee speed is ringSpeedPxS * fleeMul')
  m.x = s.player.x + R + 0.25 * K.ringMarginPx
  lurkerBrain(s, m)
  ok(m.fleeing, 'latch holds inside R + margin/2')
  m.x = s.player.x + R + 0.5 * K.ringMarginPx + 1
  lurkerBrain(s, m)
  ok(!m.fleeing, 'latch clears beyond R + margin/2')
  // orbit: the ring angle advances orbitDir * orbitRadS per 1/60 s while not fleeing
  const a0 = m.ringAngle
  lurkerBrain(s, m)
  ok(near(wrapPi(m.ringAngle - a0), m.orbitDir * K.orbitRadS / 60, 1e-9), 'ring angle orbits by orbitDir * orbitRadS / 60')

  // windup -> lunge: 0.4 s telegraph, then the lunge locks onto the player and starts at (d0 - radii) / contactS
  const w = arena(), d0 = 163
  const mw = place(w, d0, 0)
  Object.assign(mw, { ai: 'windup', aiT: 0, aiDur: K.telegraphS })
  spin(w, 23)
  ok(mw.ai === 'windup', 'still winding up after 23 steps')
  spin(w, 1)
  const vL = (d0 - T.player.radiusPx - K.radiusPx) / K.contactS
  ok(mw.ai === 'lunge' && mw.contactT === -1 && near(Math.hypot(mw.vx, mw.vy), vL, 1e-6) && near(vL, 720, 1e-6), 'windup -> lunge at 720 px/s (got ' + mw.ai + ')')
  // capsule latch worked example: 12 px per step, no latch at 31 px, latch at 19 px = lunge step 12, aiT = contactS
  let latchStep = 0
  for (let k = 1; k <= 14 && latchStep === 0; k++) { spin(w, 1); if (mw.contactT >= 0) latchStep = k }
  ok(latchStep === 12 && near(mw.contactT, K.contactS, 1e-9), 'lunge latches on lunge step 12 at aiT = contactS (step ' + latchStep + ')')
  ok(near(Math.hypot(mw.x - w.player.x, mw.y - w.player.y), 19, 1e-6), 'latched at 19 px centre distance (player + shade radius)')

  // miss: no latch, past contactS + overrun -> recover (0.8 s) -> ring
  const r = arena()
  const mr = place(r, 400, 0)
  Object.assign(mr, { ai: 'lunge', aiT: 0, contactT: -1 })
  spin(r, Math.ceil((K.contactS + K.lungeOverrunS) * 60) - 1)
  ok(mr.ai === 'lunge', 'lunge continues until contactS + lungeOverrunS')
  spin(r, 1)
  ok(mr.ai === 'recover' && near(mr.aiDur, K.recoverS, 1e-12), 'missed lunge -> recover')
  spin(r, Math.round(K.recoverS * 60) + 1)
  ok(mr.ai === 'ring', 'recover -> ring after recoverS')

  // wall bonk: a lunge into the map edge stuns for bonkS, then recovers
  const b = arena()
  const mb = place(b, 0, 0)
  Object.assign(mb, { x: 12, y: b.player.y + 300, vx: -720, vy: 0, ai: 'lunge', aiT: 0, contactT: -1 })
  spin(b, 1)
  ok(mb.ai === 'stunned' && near(mb.aiDur, T.ai.bonkS, 1e-12), 'wall bonk -> stunned for bonkS')
  spin(b, Math.round(T.ai.bonkS * 60) + 1)
  ok(mb.ai === 'recover', 'stunned -> recover after bonkS')

  // dying: no movement, removed after dyingS (0.5 s)
  const d = arena()
  const md = place(d, 300, 0)
  setDying(d, md)
  spin(d, Math.round(K.dyingS * 60) - 1)
  ok(d.monsters.includes(md) && md.vx === 0, 'dying shade stays until dyingS')
  spin(d, 2)
  ok(!d.monsters.includes(md), 'dying shade is removed after dyingS')

  // swept capsule (monsters-ai §5.1), direct: 36 -> 24 px no latch (24 > 23), 24 -> 12 latch, a pass-through latches too
  const c = arena()
  const mc = place(c, 36, 0)
  Object.assign(mc, { ai: 'lunge', aiT: 0.1, contactT: -1, lastX: c.player.x + 36, lastY: c.player.y })
  mc.x = c.player.x + 24
  resolveBites(c)
  ok(mc.contactT === -1, 'capsule: 36 -> 24 px does not latch (24 > ' + (T.player.radiusPx + K.radiusPx + K.biteSlackPx) + ')')
  mc.lastX = mc.x
  mc.x = c.player.x + 12
  resolveBites(c)
  ok(mc.contactT === 0.1, 'capsule: 24 -> 12 px latches')
  const t = arena()
  const mt = place(t, 30, 0)
  Object.assign(mt, { ai: 'lunge', aiT: 0.1, contactT: -1, lastX: t.player.x + 30, lastY: t.player.y })
  mt.x = t.player.x - 30
  resolveBites(t)
  ok(mt.contactT === 0.1, 'capsule: a step that passes through the player latches (end-point test would miss)')
}

function facing(): void {
  // monsters-ai §7: off = |wrapPi(facing - theta)| against deg(stalkerBehindDeg); raw -6.0 must wrap to +0.2832, not -6.0
  const lim = deg(T.ai.stalkerBehindDeg)
  const off = Math.abs(wrapPi(-3.0 - 3.0))
  ok(near(wrapPi(-3.0 - 3.0), 0.2832, 0.001) && off < lim, 'facing 3.0 vs theta -3.0 is IN FRONT (off ' + off + ')')
  ok(Math.abs(wrapPi(0 - 2.2)) > lim, 'theta 2.2 with facing 0 is BEHIND')
}

function devourer(): void {
  // monsters-ai-2 §1 table: distance -> light multiplier, within 0.001; nearest live devourer counts, dying ones do not
  const s = arena()
  ok(devourerMul(s) === 1, 'no devourer: multiplier 1')
  const dm = spawnMonster(s, 'devourer', s.player.x + 260, s.player.y, 100)
  const table: [number, number][] = [[260, 1], [300, 1], [200, 0.909], [170, 0.825], [120, 0.694], [80, 0.65], [40, 0.65]]
  for (const [d, want] of table) {
    dm.x = s.player.x + d
    ok(near(devourerMul(s), want, 0.001), 'devourerMul at ' + d + ' px is ' + want + ' (got ' + devourerMul(s).toFixed(4) + ')')
  }
  dm.x = s.player.x + 120
  const far = spawnMonster(s, 'devourer', s.player.x + 400, s.player.y, 100)
  ok(near(devourerMul(s), 0.694, 0.001), 'nearest devourer wins')
  dm.ai = 'dying'
  ok(devourerMul(s) === 1 && far.ai === 'ring', 'a dying devourer no longer pushes the light')
}

// 24 forced shades in the real cave, topped up every step; god mode so bites never end the run.
function budget(): void {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.debug.god = true
  const n = T.director.monstersMax
  const t0 = performance.now()
  for (let k = 0; k < 3600; k++) {
    while (s.monsters.length < n) {
      const pos = findSpawn(s, 'lurker') ?? { x: s.player.x + 30, y: s.player.y }
      spawnMonster(s, 'lurker', pos.x, pos.y, lightRadius(s))
    }
    step(s, idle, DT)
  }
  const ms = performance.now() - t0
  ok(s.meta.steps === 3600 && s.meta.screen === 'playing' && s.monsters.length > 0, '3 600 steps simulated with shades alive')
  ok(ms < BUDGET_MS, '3 600 steps with ' + n + ' shades in ' + ms + ' ms (budget ' + BUDGET_MS + ' ms)')
}

export function run(): void {
  stateMachine()
  facing()
  devourer()
  budget()
}
