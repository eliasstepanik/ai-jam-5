// L3 systems: light radius and the inside-light predicate, shared by update and render. Pure: no writes.
// Spec: docs/architecture-systems-2.md §1, R-144 (curve from T.flame), R-145 (flameRadius), R-146 (p.energyMax).
// Flicker is render-only and lives in src/render. No LOS here (R-013: lineOfSight in world/los.ts is the only LOS).
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'

export const LIGHT_ALL = 1e6

// R_base from T.flame; eMax defaults to T.flame.energyMax so baseRadius(100) = 170 works with one argument.
export function baseRadius(e: number, eMax = T.flame.energyMax): number {
  const F = T.flame
  if (e <= 0) return F.radiusOutPx
  return F.radiusMinPx + (F.radiusMaxPx - F.radiusMinPx) * (e / eMax) ** F.curveExp
}

// lightRadius without the escape/reveal branch (R-145): never LIGHT_ALL. The out radius ignores the mineral.
export function flameRadius(s: State): number {
  const p = s.player
  const r = p.energy <= 0 ? T.flame.radiusOutPx : baseRadius(p.energy, p.energyMax) * T.minerals.table[p.activeMineral].radiusMul
  return r // enemy approach, hit and death never enlarge the light
}

export const lightRadius = (s: State): number =>
  s.meta.phase === 'escape' || s.debug.reveal ? LIGHT_ALL : flameRadius(s)

// Light is centred on the player; no wall occlusion (spec).
export function insideLight(s: State, x: number, y: number, pad = 0): boolean {
  const r = lightRadius(s) + pad
  return (x - s.player.x) ** 2 + (y - s.player.y) ** 2 <= r * r
}

// ponytail: no clamp to 0..1; energy stays within 0..energyMax by construction. Add a clamp if a writer ever overshoots.
export const lightFrac = (s: State): number =>
  s.meta.phase === 'escape' ? 1 : s.player.energy / s.player.energyMax
