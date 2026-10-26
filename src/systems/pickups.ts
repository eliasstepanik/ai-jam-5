// L3 systems: resin and plant pickups. Writes pickups (splice), player.energy/hp, stats.resinUsed/plantsEaten.
// Spec: docs/architecture-systems-2.md §3 (S10), R-074 (radius from T), R-146 (caps from State).
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { emit } from './fx.ts'

export function stepPickups(s: State): void {
  const p = s.player
  const rr = T.player.radiusPx + T.pickup.radiusPx // R-074
  for (let i = s.pickups.length - 1; i >= 0; i -= 1) { // backwards: splice is safe
    const k = s.pickups[i]
    const dx = k.x - p.x
    const dy = k.y - p.y
    if (dx * dx + dy * dy > rr * rr) continue
    if (k.kind === 'resin') {
      if (s.meta.phase === 'escape') continue // torch not needed; resin stays
      const wasOut = p.energy <= 0
      p.energy = Math.min(p.energyMax, p.energy + (k.size === 'large' ? T.resin.largeE : T.resin.smallE))
      p.stats.resinUsed += 1
      p.pickupAt = s.meta.time
      s.pickups.splice(i, 1)
      emit(s, 'relight', k.x, k.y, wasOut ? 0 : 1) // a=0 flame was out, a=1 flame was lit
    } else {
      if (p.hp >= p.hpMax) continue // cannot be stored; stays
      p.hp = Math.min(p.hpMax, p.hp + T.plant.healHp)
      p.stats.plantsEaten += 1
      p.pickupAt = s.meta.time
      s.pickups.splice(i, 1)
      emit(s, 'heal', k.x, k.y)
    }
  }
}
