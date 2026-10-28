// A32 parry checks: parryLoss curve against the worked table, then resolveParries on a built scenario.
// Spec: architecture-systems-4.md §8 #2, architecture-systems-3.md §3 / §3.1 / §3.2, R-127 (epsilon), R-129 (delta only).
// Exports run(); no side effect on import; DOM-free; all state is local to each scenario.
import type { FlameKind, Monster, MonsterKind, ParryGrade, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { parryLoss, resolveParries } from '../systems/combat.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: parry: ' + msg)
}

// Table rows of §3.2 (lurker energyHitE = 12 unless stated). Loss tolerance 0.01 E.
type Row = { name: string; d: number; kind: MonsterKind; mineral: FlameKind; grade: ParryGrade; loss: number }
const ROWS: Row[] = [
  { name: 'perfect, 2 steps early', d: -2 / 60, kind: 'lurker', mineral: 'none', grade: 'perfect', loss: 0 },
  { name: 'early 80 ms plain', d: -0.08, kind: 'lurker', mineral: 'none', grade: 'good', loss: 2.50 },
  { name: 'late 80 ms plain', d: 0.08, kind: 'lurker', mineral: 'none', grade: 'good', loss: 3.66 },
  { name: 'early 80 ms sodium', d: -0.08, kind: 'lurker', mineral: 'sodium', grade: 'perfect', loss: 0 },
  { name: 'late 80 ms sodium', d: 0.08, kind: 'lurker', mineral: 'sodium', grade: 'perfect', loss: 0 },
  { name: 'sodium -0.050 (inside its wider perfect band)', d: -0.05, kind: 'lurker', mineral: 'sodium', grade: 'perfect', loss: 0 },
  { name: 'early 80 ms devourer', d: -0.08, kind: 'devourer', mineral: 'none', grade: 'good', loss: 7.28 },
  { name: 'edge early plain', d: -0.18, kind: 'lurker', mineral: 'none', grade: 'poor', loss: 9.60 },
  { name: 'in-game early 5 steps', d: -5 / 60, kind: 'lurker', mineral: 'none', grade: 'good', loss: 2.64 },
  { name: 'in-game late 5 steps', d: 5 / 60, kind: 'lurker', mineral: 'none', grade: 'good', loss: 4.04 },
]

// A descent run state with a swing just started facing +x (sw.t = 0) and one lurker in the lunge 30 px ahead, aiT set so
// that delta = (aiT - sw.t) - contactS equals `d`. Returns the state and the monster.
function lunging(d: number, kind: MonsterKind = 'lurker', mineral: FlameKind = 'none'): { s: State; m: Monster } {
  const s = init()
  Object.assign(s.player, { x: 500, y: 500, activeMineral: mineral })
  Object.assign(s.player.swing, { active: true, t: 0, dir: 0 })
  const m = spawnMonster(s, kind, 530, 500, 100)
  Object.assign(m, { ai: 'lunge' as const, aiT: T.monsters[kind].contactS + d })
  return { s, m }
}

export function run(): void {
  // 1. parryLoss: every worked row within 0.01 E, grade exact.
  for (const r of ROWS) {
    const got = parryLoss(r.d, r.kind, r.mineral)
    ok(got.grade === r.grade, r.name + ': grade ' + got.grade + ', want ' + r.grade)
    ok(Math.abs(got.loss - r.loss) <= 0.01, r.name + ': loss ' + got.loss + ', want ' + r.loss + ' +-0.01')
  }

  // 2. Perfect band edges (R-127 epsilon): |d| = perfectS is perfect, one hair beyond is not; sodium's band is 1.6x wider.
  const P = T.parry.perfectS
  ok(parryLoss(-P, 'lurker', 'none').grade === 'perfect', '-perfectS is perfect')
  ok(parryLoss(P, 'lurker', 'none').grade === 'perfect', '+perfectS is perfect')
  ok(parryLoss(-P - 1e-6, 'lurker', 'none').grade === 'good', 'just outside the perfect band is graded')
  const PC = P * T.minerals.table.sodium.perfectMul
  ok(parryLoss(-PC, 'lurker', 'sodium').grade === 'perfect', 'sodium perfect band is perfectS * perfectMul')
  ok(parryLoss(-PC - 1e-6, 'lurker', 'sodium').grade === 'good', 'just outside the sodium perfect band is graded')

  // 3. Monotonic loss outside the perfect band, both directions; late is punished harder than early at the same |d|.
  for (const sign of [-1, 1]) {
    let prev = -1
    for (let k = 3; k <= (sign < 0 ? 10 : 7); k++) { // beyond lateMaxS (7 steps = 0.117 < 0.12 < 8 steps) the loss saturates at lossMaxFrac
      const l = parryLoss(sign * k / 60, 'lurker', 'none').loss
      ok(l > prev, 'loss grows with |d| (sign ' + sign + ', k=' + k + ')')
      prev = l
    }
  }
  ok(parryLoss(0.08, 'lurker', 'none').loss > parryLoss(-0.08, 'lurker', 'none').loss, 'late loses more than early at the same |d|')
  for (const d of [-0.14, -0.10, -0.08, 0.08, 0.09, 0.10]) {
    ok(parryLoss(d, 'lurker', 'sodium').loss < parryLoss(d, 'lurker', 'none').loss, 'sodium loss < plain loss at d=' + d)
  }
  ok(Math.abs(parryLoss(-0.12, 'lurker', 'copper').loss - parryLoss(-0.12, 'lurker', 'none').loss) <= 1e-9, 'copper loss equals plain loss at d=-0.12 (parry effect removed)')
  ok(parryLoss(-0.14, 'lurker', 'none').loss <= T.monsters.lurker.energyHitE * T.parry.lossMaxFrac + 1e-9, 'loss never exceeds energyHitE * lossMaxFrac')

  // 4. resolveParries: every graded parry kills; perfect costs nothing and fires flare + hitstop.
  {
    const { s, m } = lunging(-2 / 60)
    resolveParries(s)
    ok(m.ai === 'dying', 'perfect parry kills')
    ok(s.player.energy === T.flame.energyMax, 'perfect parry costs no energy')
    ok(s.player.stats.kills === 1 && s.player.stats.parries === 1 && s.player.stats.perfectParries === 1, 'perfect parry counts kill, parry, perfect')
    ok(s.player.parry.lastGrade === 'perfect' && s.player.parry.energyLost === 0, 'parry record: perfect, 0 lost')
    ok(Math.abs(s.player.parry.lastDelta + 2 / 60) < 1e-9, 'parry record: lastDelta = -2/60')
    ok(s.fx.events.some(e => e.kind === 'parryPerfect'), 'parryPerfect emitted')
    ok(s.fx.events.some(e => e.kind === 'monsterDie'), 'monsterDie emitted')
    ok(s.fx.flare === T.parry.flareS && s.fx.hitstop === T.parry.hitstopS, 'perfect sets flare and hitstop')
  }
  {
    const { s, m } = lunging(-0.08)
    resolveParries(s)
    ok(m.ai === 'dying', 'good parry kills')
    ok(Math.abs(s.player.energy - (100 - 2.50)) <= 0.01, 'good parry costs ~2.50 E (got ' + s.player.energy + ')')
    ok(s.player.stats.kills === 1 && s.player.stats.parries === 1 && s.player.stats.perfectParries === 0, 'good parry: kill and parry, not perfect')
    ok(Math.abs(s.player.stats.energyLostToHits - 2.50) <= 0.01 && s.player.parry.lastGrade === 'good', 'good parry record and energyLostToHits')
    ok(s.fx.events.some(e => e.kind === 'parryGood') && s.fx.hitstop === 0, 'parryGood emitted, no hitstop')
  }
  {
    const { s, m } = lunging(0.09)
    resolveParries(s)
    ok(m.ai === 'dying' && s.player.parry.lastGrade === 'poor' && s.fx.events.some(e => e.kind === 'parryPoor'), 'poor parry kills and emits parryPoor')
  }
  {
    const { s, m } = lunging(-0.12, 'lurker', 'sodium')
    resolveParries(s)
    ok(m.ai === 'dying' && Math.abs(s.player.energy - (100 - 2.04)) <= 0.01, 'sodium early parry costs ~2.04 E (got ' + s.player.energy + ')')
  }

  // 5. Whiff boundary: delta < -earlyMaxS skips the shade (it stays in the lunge); exactly -earlyMaxS is still graded (R-127).
  {
    const { s, m } = lunging(-0.19)
    resolveParries(s)
    ok(m.ai === 'lunge' && s.player.energy === 100 && s.player.stats.parries === 0, 'delta -0.19 whiffs: no kill, no cost')
    ok(s.player.parry.lastGrade === 'none', 'whiff leaves the parry record untouched')
  }
  {
    const { s, m } = lunging(-T.parry.earlyMaxS)
    resolveParries(s)
    ok(m.ai === 'dying' && s.player.parry.lastGrade === 'poor', 'delta exactly -earlyMaxS is graded poor, not a whiff')
  }
  {
    const { s, m } = lunging(-T.parry.earlyMaxS - 0.005)
    resolveParries(s)
    ok(m.ai === 'lunge', 'delta 5 ms beyond -earlyMaxS whiffs')
  }

  // 6. Guards: no swing, escape phase, flame out, wrong ai state, out of reach, behind the swing arc.
  {
    const a = lunging(-2 / 60); a.s.player.swing.active = false
    resolveParries(a.s)
    ok(a.m.ai === 'lunge', 'no active swing: no parry')
    const b = lunging(-2 / 60); b.s.meta.phase = 'escape'
    resolveParries(b.s)
    ok(b.m.ai === 'lunge', 'escape phase: no parry')
    const c = lunging(-2 / 60); c.s.player.energy = 0
    resolveParries(c.s)
    ok(c.m.ai === 'lunge' && c.s.player.stats.parries === 0, 'flame out: no parry')
    const d = lunging(-2 / 60); d.m.ai = 'windup'
    resolveParries(d.s)
    ok(d.m.ai === 'windup', 'only lunging shades can be parried')
    const e = lunging(-2 / 60); e.m.x = 500 + T.swing.reachPx + T.monsters.lurker.radiusPx + 1
    resolveParries(e.s)
    ok(e.m.ai === 'lunge', 'shade edge beyond the 56 px reach: no parry')
    const f = lunging(-2 / 60); f.m.x = 500 + T.swing.reachPx + T.monsters.lurker.radiusPx - 1
    resolveParries(f.s)
    ok(f.m.ai === 'dying', 'shade edge inside the 56 px reach: parry')
    const g = lunging(-2 / 60); g.m.x = 470
    resolveParries(g.s)
    ok(g.m.ai === 'lunge', 'shade behind the swing direction: no parry')
  }

  // 7. One swing parries several shades in array order; the flame loss runs down shade by shade and flameOut fires once.
  {
    const { s, m } = lunging(-0.08)
    const m2 = spawnMonster(s, 'lurker', 530, 510, 100)
    Object.assign(m2, { ai: 'lunge' as const, aiT: T.monsters.lurker.contactS - 0.08 })
    s.player.energy = 4 // first loses ~2.50, second is capped at the ~1.50 left
    resolveParries(s)
    ok(m.ai === 'dying' && m2.ai === 'dying', 'both shades die')
    ok(s.player.energy === 0 && s.player.stats.kills === 2 && s.player.stats.parries === 2, 'energy 0, kills 2, parries 2')
    ok(s.fx.events.filter(e => e.kind === 'flameOut').length === 1, 'flameOut fires once (lit -> out edge only)')
    ok(Math.abs(s.player.stats.energyLostToHits - 4) <= 1e-9, 'energyLostToHits counts the applied loss, capped at the energy left')
  }
}
