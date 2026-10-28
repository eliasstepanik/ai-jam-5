// Playtest tuning 1b (F3a) check: attack telegraph render helpers. eyeFlash decays 1 -> 0 over 0.12 s of windup, windupK spans the windup,
// drawStrikeLines draws nothing outside the windup and one dashed line toward the player during it. Recording fake ctx, no DOM, no rng.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { startRun } from '../systems/run.ts'
import { drawStrikeLines, eyeFlash, windupK } from '../render/telegraph.ts'
import type { View } from '../render/view.ts'
import { caveOf } from './caves.ts'

const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: telegraph: ' + msg) }

function recorder(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = []
  const ctx = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { calls.push(String(k) + ':' + a.join(',')) }, set: () => true })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

export function run(): void {
  const s: State = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  Object.assign(s, { monsters: [], pickups: [] })
  s.world.tiles = '.'.repeat(s.world.w).repeat(s.world.h)
  s.world.tilesHash = 7002
  s.player.x = s.world.w * 16; s.player.y = s.world.h * 16
  const m = spawnMonster(s, 'lurker', s.player.x + 130, s.player.y, 100)
  const v = { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 } as View

  m.ai = 'recover'; m.aiT = 0; m.aiDur = 1
  ok(eyeFlash(m) === 0 && windupK(m) === 0, 'no flash and no pose outside the windup')
  m.ai = 'windup'; m.aiDur = T.monsters.lurker.telegraphS; m.lungeDir = Math.PI
  m.aiT = 0
  ok(eyeFlash(m) === 1 && windupK(m) === 0, 'flash is 1 and pose 0 at windup start')
  m.aiT = 0.06
  ok(Math.abs(eyeFlash(m) - 0.5) < 1e-9, 'flash is linear: 0.5 at 0.06 s')
  m.aiT = 0.12
  ok(eyeFlash(m) === 0, 'flash is 0 at 0.12 s')
  m.aiT = m.aiDur
  ok(windupK(m) === 1, 'pose is 1 at windup end')

  const none = recorder()
  m.ai = 'lunge'
  drawStrikeLines(none.ctx, s, v)
  ok(none.calls.length === 0, 'strike line draws nothing outside the windup')

  const on = recorder()
  m.ai = 'windup'; m.aiT = m.aiDur / 2
  drawStrikeLines(on.ctx, s, v)
  ok(on.calls.filter(c => c.startsWith('stroke:')).length === 1, 'one stroke per winding-up shade')
  ok(on.calls.some(c => c.startsWith('setLineDash:6,6')), 'dashed [6, 6]')
  const to = on.calls.find(c => c.startsWith('lineTo:'))?.slice(7).split(',').map(Number) ?? []
  ok(Math.abs(to[0] - (m.x - 130)) < 1e-6 && Math.abs(to[1] - m.y) < 1e-6, 'line ends at the player when closer than lungeRangePx')
  ok(on.calls[0] === 'save:' && on.calls[on.calls.length - 1] === 'restore:', 'ctx state saved and restored')
}
