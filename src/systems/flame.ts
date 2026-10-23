// L3 systems: passive flame burn. Writes only player.energy; emits flameOut.
// Spec: docs/architecture-systems-2.md §2 (S9) and §6 (stepMinerals, S13). Mining/Beacon costs live elsewhere.
// Also owns ui.denyT (R-009): stepMinerals sets it on a denied toss, stepFlame counts it down.
import type { State } from '../core/types.ts'
import { MINERALS } from '../core/state.ts'
import { T, zt } from '../core/tuning.ts'
import { emit } from './fx.ts'
import type { Intent } from './intent.ts'

const DENY_S = 0.25 // ui-2 §8: hotbar deny shake

// D9: select (hotbar cursor), toss (one piece into the flame), shake off (drop the effect, no refund).
export function stepMinerals(s: State, it: Intent): void {
  const p = s.player
  if (it.select !== null) p.selected = it.select // cursor only; selecting a type with 0 pieces is allowed
  if (it.toss) {
    if (p.minerals[p.selected] >= 1 && p.energy > 0) {
      p.minerals[p.selected] -= 1
      p.activeMineral = p.selected // re-tossing the active type is allowed: costs a piece, refreshes, counts for score
      p.stats.mineralsUsed += 1
      emit(s, 'toss', p.x, p.y, MINERALS.indexOf(p.selected))
    } else {
      s.ui.denyT = DENY_S // R-009: flame.ts writes the hotbar deny shake
      emit(s, 'toss', p.x, p.y, -1) // denied: none left or flame dead
    }
  }
  if (it.shake && p.activeMineral !== 'none') {
    p.activeMineral = 'none'
    emit(s, 'shakeOff', p.x, p.y)
  }
}

export function stepFlame(s: State, dt: number): void {
  const p = s.player
  s.ui.denyT = Math.max(0, s.ui.denyT - dt)
  if (s.meta.phase === 'escape' || s.debug.god || s.debug.freezeTorch) return
  if (p.energy <= 0) return // out: nothing burns
  const burn = zt(T.flame.burnPerS, s.meta.zone) * T.minerals.table[p.activeMineral].burnMul
  const floor = p.beaconHold > 0 ? T.beacon.minEnergyE : 0 // floor coupling: a hold must not snuff the flame
  p.energy = Math.max(floor, p.energy - burn * dt)
  if (p.energy <= 0) {
    p.energy = 0 // exactly 0 so flameOut(p) is stable
    emit(s, 'flameOut', p.x, p.y)
  }
}
