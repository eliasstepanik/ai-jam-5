// L3 systems: fixed-step driver. The only writer of meta.time and meta.steps (R-002).
// Spec: docs/architecture-systems.md 1.1-1.3 (order D0-D18 / X0-X18), R-067 (hitstop), R-068/MS-25 (click buffer in hitstop),
// R-125 (eStart snapshot for the Beacon gate). Slice B calls (roll, quake, mining, beacon, minerals) are not on master yet;
// each owning task adds its call at the index marked inline. No stub bodies stand in for them.
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { stepCamera } from './camera.ts'
import { resolveBites, resolveParries, stepSwing, tickPlayerTimers } from './combat.ts'
import { trackDepth } from './depth.ts'
import { stepDirector } from './director.ts'
import { stepExplore } from './explore.ts'
import { stepFlame } from './flame.ts'
import { tickFx } from './fx.ts'
import { resolveIntent } from './intent.ts'
import { stepMonsters } from './monsters.ts'
import { stepMovement } from './movement.ts'
import { stepPickups } from './pickups.ts'
import { checkEnd } from './run.ts'
import { stepScreens } from './screens.ts'

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
  // X3: B8 adds `if (esc) stepRoll(s, it, dt)` here, before stepMovement
  stepMovement(s, it, dt) // D3
  trackDepth(s) // D4
  if (!esc) stepExplore(s) // D4
  // D5: B1 adds `const eStart = s.player.energy` here, before stepFlame (R-125)
  stepFlame(s, dt) // D5
  stepPickups(s) // D6
  // D7/D8: B1 adds `if (!esc) { stepMining(s, it, dt); stepBeacon(s, it, dt, eStart) }` here (stepBeacon takes 4 args, R-125)
  // D9: B7 adds `stepMinerals(s, it)` inside the descent guard below, before stepSwing
  if (!esc && s.meta.phase === 'descent') stepSwing(s, it, dt) // D10: phase can flip inside stepBeacon
  // X11: B2 adds `if (s.meta.phase === 'escape') stepQuake(s, dt)` here, before stepDirector
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
