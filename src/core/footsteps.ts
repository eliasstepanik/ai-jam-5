// Cosmetic sound choice follows actual movement, never held movement keys against a wall.
import type { State } from './types.ts'
import { gaitRuns, WALK_MIN_SPEED } from './gait.ts'
export function footstepMode(s: State): 'walk' | 'run' | null {
  const p = s.player
  if (s.meta.screen !== 'playing' || p.gaitSpeed <= WALK_MIN_SPEED || p.roll.t > 0 || s.fx.hitstop > 0) return null
  return s.world.beaconLit && s.meta.phase === 'escape' && gaitRuns(p.gaitSpeed) ? 'run' : 'walk'
}
