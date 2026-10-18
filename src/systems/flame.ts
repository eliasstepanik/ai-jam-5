// L3 systems: passive flame burn. Writes only player.energy; emits flameOut.
// Spec: docs/architecture-systems-2.md §2 (S9). Mining/Beacon costs and minerals (stepMinerals, B7) live elsewhere.
import type { State } from '../core/types.ts'
import { T, zt } from '../core/tuning.ts'
import { emit } from './fx.ts'

export function stepFlame(s: State, dt: number): void {
  const p = s.player
  if (s.meta.phase === 'escape' || s.debug.god) return
  if (p.energy <= 0) return // out: nothing burns
  const burn = zt(T.flame.burnPerS, s.meta.zone) * T.minerals.table[p.activeMineral].burnMul
  const floor = p.beaconHold > 0 ? T.beacon.minEnergyE : 0 // floor coupling: a hold must not snuff the flame
  p.energy = Math.max(floor, p.energy - burn * dt)
  if (p.energy <= 0) {
    p.energy = 0 // exactly 0 so flameOut(p) is stable
    emit(s, 'flameOut', p.x, p.y)
  }
}
