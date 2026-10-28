// L3 systems: fixed-step driver. The only writer of meta.time and meta.steps (R-002).
// Spec: docs/architecture-systems.md 1.1-1.3 (order D0-D18 / X0-X18), R-067 (hitstop), R-068/MS-25 (click buffer in hitstop),
// R-125 (eStart snapshot for the Beacon gate). Slice B calls are wired at their index (roll X3, mining D7, Beacon D8, minerals D9, quake X11);
// each owning task adds its call at the index marked inline.
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { fadePalette } from '../core/zone-palette.ts'
import { T } from '../core/tuning.ts'
import { stepBeacon } from './beacon.ts'
import { stepCamera } from './camera.ts'
import { resolveBites, resolveParries, stepSwing, tickPlayerTimers } from './combat.ts'
import { trackDepth } from './depth.ts'
import { stepDirector } from './director.ts'
import { stepExplore } from './explore.ts'
import { stepFlame, stepMinerals } from './flame.ts'
import { tickFx } from './fx.ts'
import { resolveIntent } from './intent.ts'
import { stepMonsters } from './monsters.ts'
import { stepMining } from './mining.ts'
import { stepMovement, stepRoll } from './movement.ts'
import { stepPickups } from './pickups.ts'
import { stepQuake } from './quake.ts'
import { checkEnd } from './run.ts'
import { stepScreens } from './screens.ts'
import { stepWisp } from './escape-wisp.ts'
import { stepCopperTrail } from './copper-trail.ts'

export function step(s: State, input: Input, dt: number): void {
  s.meta.time += dt // D1: the run clock counts on every screen
  if (!stepScreens(s, input)) return // D0
  s.meta.steps += 1
  if (s.fx.hitstop > 0) { // D1 hitstop: world frozen, a click survives in the swing buffer (MS-25)
    if (input.clicks.length > 0) s.player.swing.buffer = T.swing.bufferS
    s.fx.hitstop = Math.max(0, s.fx.hitstop - dt)
    tickFx(s, dt) // ponytail: fx timers keep fading in hitstop (skeleton 1.3); R-067 read as world frozen
    return
  }
  const it = resolveIntent(s, input) // D2
  const esc = s.meta.phase === 'escape'
  stepRoll(s, it, dt) // X3 (R-169): before stepMovement, which skips its velocity block while roll.t > 0; descent: only a dead torch starts a roll (movement.ts)
  stepMovement(s, it, dt) // D3
  trackDepth(s) // D4
  fadePalette(s.meta.palette, s.meta.zone, dt)
  if (!esc) stepExplore(s) // D4
  const eStart = s.player.energy // D5: snapshot before the burn, for the Beacon START GATE (R-125)
  stepFlame(s, dt) // D5
  stepPickups(s) // D6
  if (!esc) stepMining(s, it, dt) // D7
  if (!esc) stepBeacon(s, it, dt, eStart) // D8 (R-125, R-169)
  if (!esc && s.meta.phase === 'descent') { // phase can flip inside stepBeacon
    stepMinerals(s, it) // D9
    stepSwing(s, it, dt) // D10
  }
  if (s.meta.phase === 'escape') stepQuake(s, dt) // X11 (R-169): before checkEnd, so lose wins a same-step tie
  stepWisp(s, dt) // guide light (#81): after stepQuake so a landed rock re-routes in the same step; switches itself off outside the escape
  stepCopperTrail(s, dt) // copper trail: descent only, self-gating (clears itself in the escape or when the copper flame ends)
  stepDirector(s, dt) // D11
  stepMonsters(s, dt) // D12
  if (s.meta.phase === 'descent') resolveParries(s) // D13, before D14: a parry on the bite step wins
  resolveBites(s) // D14
  tickPlayerTimers(s, dt) // D15
  checkEnd(s) // D16
  if (s.meta.screen !== 'playing') return
  tickFx(s, dt) // D17
  stepCamera(s, dt, input.view) // D18
}
