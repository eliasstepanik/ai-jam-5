// L3 systems: camera follow and the render-only shake offset. DOM-free; stepCamera writes only s.cam.
// Spec: docs/architecture-systems-4.md §5, architecture-render.md §4.4, R-017 (the one shakeOffset lives here).
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { hash2 } from '../core/noise.ts'

const SHAKE_SALT = 0x5a // architecture-render.md §4.4
// Follow the player without a map-edge clamp. World boundaries belong to movement, not the camera.
// Keep the view parameter for the stable step/debug API; follow is independent of viewport size/DPR.
export function stepCamera(s: State, dt: number, _view: Input['view']): void {
  const k = 1 - Math.exp(-T.cam.lerpPerS * dt)
  s.cam.x += (s.player.x - s.cam.x) * k
  s.cam.y += (s.player.y - s.cam.y) * k
}

// Pure and stateless: changes once per update step (meta.steps), never stored. Render scales by 0.4 for reducedFlash.
export function shakeOffset(s: State): { x: number; y: number } {
  const shaking = s.fx.shake > 0 ? s.fx.shakeMag * Math.min(1, s.fx.shake / T.cam.shakeDecayS) : 0
  const amp = shaking + (s.meta.phase === 'escape' ? T.escape.quakeShakePx : 0)
  if (amp <= 0) return { x: 0, y: 0 }
  const n = s.meta.steps
  return { x: amp * (hash2(n, 1, SHAKE_SALT) * 2 - 1), y: amp * (hash2(n, 2, SHAKE_SALT) * 2 - 1) }
}
