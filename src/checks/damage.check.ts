// A32 damage checks: damagePlayer rules 1-6 in table order, hurtPlayerHp, resolveBites latch + delay, tickPlayerTimers.
// Spec: architecture-systems-4.md §8 #4, architecture-systems-3.md §4 / §4.1, R-066 (swept latch), R-127, R-148, R-149.
// Exports run(); no side effect on import; DOM-free; all state is local to each scenario.
import type { FxEventKind, Monster, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { damagePlayer, hurtPlayerHp, resolveBites, tickPlayerTimers } from '../systems/combat.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: damage: ' + msg)
}
const count = (s: State, kind: FxEventKind): number => s.fx.events.filter(e => e.kind === kind).length

// A started-looking descent state (no cave needed: damage code reads no tiles) with a lurker already in the lunge, latched.
function latched(kind: 'lurker' | 'stalker' = 'lurker'): { s: State; m: Monster } {
  const s = init()
  Object.assign(s.player, { x: 500, y: 500 })
  const m = spawnMonster(s, kind, 512, 500, 100)
  Object.assign(m, { ai: 'lunge' as const, aiT: 0.3, contactT: 0.1, lastX: 512, lastY: 500 })
  return { s, m }
}

export function run(): void {
  const hp0 = T.player.hpMax, E = T.monsters.lurker.energyHitE

  // Rule 4: lit flame in descent -> energy -12, dying, kills +1, hurtT = flameHitInvulnS, flameHit + shake, hp untouched.
  {
    const { s, m } = latched()
    damagePlayer(s, m)
    ok(s.player.energy === 100 - E && E === 12, 'lit hit costs 12 E (got ' + s.player.energy + ')')
    ok(m.ai === 'dying', 'attacker dies at the flame')
    ok(s.player.stats.kills === 1 && s.player.stats.energyLostToHits === E, 'kill credited, energyLostToHits += 12')
    ok(s.player.hp === hp0, 'lit hit costs no HP')
    ok(s.player.hurtT === T.flame.flameHitInvulnS && s.player.hitFlash === T.hurt.flashS, 'hurtT and hitFlash set')
    ok(count(s, 'flameHit') === 1 && count(s, 'monsterDie') === 1 && count(s, 'flameOut') === 0, 'flameHit + monsterDie emitted, no flameOut')
    ok(s.fx.shake === T.shake.flameHit.s && s.fx.shakeMag === T.shake.flameHit.px, 'flameHit shake')
    // already dying: a second call changes nothing (no energy, no recover)
    damagePlayer(s, m)
    ok(s.player.energy === 100 - E && m.ai === 'dying', 'dying shade cannot bite again')
  }
  // Stalker bites harder (energyHitE 20): the amount is read per kind.
  {
    const { s, m } = latched('stalker')
    damagePlayer(s, m)
    ok(s.player.energy === 100 - T.monsters.stalker.energyHitE, 'stalker hit costs its own energyHitE')
  }
  // Rule 4 edge: a hit that empties the flame costs no HP, applies only what is left, emits flameOut once.
  {
    const { s, m } = latched()
    s.player.energy = 5
    damagePlayer(s, m)
    ok(s.player.energy === 0 && s.player.hp === hp0, 'lethal-for-flame hit: energy 0, hp unchanged')
    ok(s.player.stats.energyLostToHits === 5, 'only the 5 E left are lost')
    ok(count(s, 'flameOut') === 1 && count(s, 'flameHit') === 1 && m.ai === 'dying', 'one flameOut, one flameHit, shade dying')
  }
  // Rule 5: flame out in descent -> hp -1 (one pip), hpHit, attacker recovers (not dying), no kill.
  {
    const { s, m } = latched()
    s.player.energy = 0
    damagePlayer(s, m)
    ok(s.player.hp === hp0 - 1, 'flame out: hp -1')
    ok(m.ai === 'recover' && m.aiDur === T.monsters.lurker.recoverS, 'attacker recovers for recoverS')
    ok(s.player.stats.kills === 0 && s.player.stats.damageTaken === 1, 'no kill, damageTaken 1')
    ok(s.player.hurtT === T.hurt.hpInvulnS && s.player.hitFlash === T.hurt.flashS, 'hp hit sets hurtT 0.8 and hitFlash')
    ok(count(s, 'hpHit') === 1 && s.fx.shakeMag === T.shake.hpHit.px, 'hpHit + shake')
    ok(s.player.energy === 0, 'energy stays 0')
  }
  // Rule 6: escape, no roll -> hp -1, attacker recovers for the short escape recover time.
  {
    const { s, m } = latched()
    s.meta.phase = 'escape'
    damagePlayer(s, m)
    ok(s.player.hp === hp0 - 1 && s.player.energy === 100, 'escape: hp -1, energy untouched')
    ok(m.ai === 'recover' && m.aiDur === T.escape.recoverS, 'escape: recover for escape.recoverS')
  }
  // Rule 2: escape + roll i-frames -> no change, dodge emitted, attacker recovers.
  {
    const { s, m } = latched()
    s.meta.phase = 'escape'
    s.player.roll.invuln = 0.2
    damagePlayer(s, m)
    ok(s.player.hp === hp0 && s.player.energy === 100 && s.player.hurtT === 0, 'escape roll: no damage, no hurtT')
    ok(count(s, 'dodge') === 1 && count(s, 'hpHit') === 0 && m.ai === 'recover', 'dodge emitted, attacker recovers')
  }
  // Rule 2 applies to escape only: in descent the i-frames do not stop a bite (rule 4 still costs energy).
  {
    const { s, m } = latched()
    s.player.roll.invuln = 0.2
    damagePlayer(s, m)
    ok(s.player.energy === 100 - E && count(s, 'dodge') === 0, 'descent: roll i-frames do not dodge bites')
  }
  // Rule 3: hurtT > 0 -> no change; lit flame in descent: attacker dies, no kill credit (R-149); flame out or escape: recover.
  {
    const { s, m } = latched()
    s.player.hurtT = 0.3
    damagePlayer(s, m)
    ok(s.player.energy === 100 && s.player.hp === hp0 && s.player.stats.kills === 0, 'hurtT lit: energy, hp and kills unchanged')
    ok(m.ai === 'dying', 'hurtT lit: attacker dies at the flame (R-149)')
    const o = latched()
    o.s.player.hurtT = 0.3; o.s.player.energy = 0
    damagePlayer(o.s, o.m)
    ok(o.s.player.hp === hp0 && o.m.ai === 'recover', 'hurtT flame out: no change, attacker recovers')
    const e = latched()
    e.s.player.hurtT = 0.3; e.s.meta.phase = 'escape'
    damagePlayer(e.s, e.m)
    ok(e.s.player.hp === hp0 && e.m.ai === 'recover', 'hurtT escape: no change, attacker recovers')
  }
  // Rule 1: god mode -> no change at all, attacker recovers.
  {
    const { s, m } = latched()
    s.debug.god = true
    damagePlayer(s, m)
    ok(s.player.energy === 100 && s.player.hp === hp0 && s.player.hurtT === 0 && s.fx.events.length === 0, 'god: no change, no events')
    ok(m.ai === 'recover', 'god: attacker recovers')
  }

  // hurtPlayerHp (R-148): rocks cost damageHp, rolls never dodge them, hurtT blocks; god blocks.
  {
    const s = init()
    s.player.roll.invuln = 0.2
    ok(hurtPlayerHp(s, 'rock') === true && s.player.hp === hp0 - T.rocks.damageHp, 'rock with roll i-frames still costs damageHp (rolls never dodge rocks)')
    ok(s.player.hurtT === T.hurt.hpInvulnS && count(s, 'hpHit') === 1, 'rock hit sets hurtT, emits hpHit')
    ok(hurtPlayerHp(s, 'rock') === false && s.player.hp === hp0 - T.rocks.damageHp, 'hurtT > 0: false, hp unchanged')
    const g = init()
    g.debug.god = true
    ok(hurtPlayerHp(g, 'bite') === false && g.player.hp === hp0, 'god: false, hp unchanged')
    const b = init()
    ok(hurtPlayerHp(b, 'bite') === true && b.player.hp === hp0 - 1, 'bite costs 1 pip')
  }

  // tickPlayerTimers: counts down hurtT and hitFlash, floors at 0.
  {
    const s = init()
    s.player.hurtT = 0.8; s.player.hitFlash = 0.25
    for (let k = 0; k < 15; k++) tickPlayerTimers(s, 1 / 60)
    ok(Math.abs(s.player.hitFlash) < 1e-9 && Math.abs(s.player.hurtT - 0.55) < 1e-9, 'timers count down by dt')
    for (let k = 0; k < 60; k++) tickPlayerTimers(s, 1 / 60)
    ok(s.player.hurtT === 0 && s.player.hitFlash === 0, 'timers floor at 0')
  }

  // resolveBites: R-066 swept latch, then the bite fires after the late-parry span (descent) or at once (escape).
  {
    const s = init()
    Object.assign(s.player, { x: 500, y: 500 })
    const m = spawnMonster(s, 'lurker', 524, 500, 100) // 24 px: gap 24 > 10 + 9 + 4 = 23, no latch
    Object.assign(m, { ai: 'lunge' as const, aiT: 0.2, lastX: 524, lastY: 500 })
    resolveBites(s)
    ok(m.contactT === -1 && m.ai === 'lunge', 'no latch at 24 px')
    m.x = 512; m.aiT = 0.2 // 12 px: latch, but the bite waits lateMaxS
    resolveBites(s)
    ok(m.contactT === 0.2 && m.ai === 'lunge' && s.player.energy === 100, 'latch at 12 px, bite delayed in descent')
    m.aiT = 0.2 + T.parry.lateMaxS - 0.001
    resolveBites(s)
    ok(m.ai === 'lunge', 'bite still waits 1 ms before the late-parry span ends')
    m.aiT = 0.2 + T.parry.lateMaxS
    resolveBites(s)
    ok(m.ai === 'dying' && s.player.energy === 100 - E, 'bite lands exactly at contactT + lateMaxS (R-127)')
    // swept latch: the shade jumps over the player in one step; only the segment passes through the circle
    const t = init()
    Object.assign(t.player, { x: 500, y: 500 })
    const w = spawnMonster(t, 'lurker', 520, 500, 100)
    Object.assign(w, { ai: 'lunge' as const, aiT: 0.15, lastX: 480, lastY: 500 })
    resolveBites(t)
    ok(w.contactT === 0.15, 'swept capsule latches a shade that passed through the player this step')
    // escape: no delay
    const e = init()
    e.meta.phase = 'escape'
    Object.assign(e.player, { x: 500, y: 500 })
    const x = spawnMonster(e, 'lurker', 512, 500, 100)
    Object.assign(x, { ai: 'lunge' as const, aiT: 0.2, lastX: 512, lastY: 500 })
    resolveBites(e)
    ok(x.ai === 'recover' && e.player.hp === hp0 - 1, 'escape: latch and bite on the same step')
    // non-lunging shades never bite
    const n = init()
    Object.assign(n.player, { x: 500, y: 500 })
    const r = spawnMonster(n, 'lurker', 505, 500, 100)
    resolveBites(n)
    ok(r.contactT === -1 && n.player.energy === 100, 'ring shade next to the player does not bite')
  }
}
