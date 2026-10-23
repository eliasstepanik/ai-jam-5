// L3 systems: camera follow and the render-only shake offset. DOM-free; stepCamera writes only s.cam.
// Spec: docs/architecture-systems-4.md §5, architecture-render.md §4.4, R-017 (the one shakeOffset lives here).
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { hash2 } from '../core/noise.ts'
import { deviceZoom } from '../core/view.ts'

const SHAKE_SALT = 0x5a // architecture-render.md §4.4
const SOUTH_OVERHANG = 48 // px: wall faces hang into the south cell (R-181)

// Keeps the view inside the map: the visible half-extent hx/hy (world px) comes from the backing-store size and device zoom.
// A map smaller than the view is not centred: max(hx, ...) pins the camera centre at hx/hy, so the map sits at the left/top edge. Pure: no RNG, no State access (R-181).
export function clampCam(x: number, y: number, worldW: number, worldH: number, view: Input['view']): { x: number; y: number } {
  const cw = Math.round(view.w * view.dpr), ch = Math.round(view.h * view.dpr)
  const z = deviceZoom(ch)
  const hx = cw / 2 / z, hy = ch / 2 / z
  return {
    x: Math.min(Math.max(x, hx), Math.max(hx, worldW * TILE - hx)),
    y: Math.min(Math.max(y, hy), Math.max(hy, worldH * TILE + SOUTH_OVERHANG - hy)),
  }
}

// Frame-rate independent lerp toward the player: k = 1 - exp(-lerpPerS * dt) (0.1248 per 1/60 step), then clamp to the map.
// ponytail: no look-ahead; add `+ facing * 24 px` lead if the screen feels cramped.
export function stepCamera(s: State, dt: number, view: Input['view']): void {
  const k = 1 - Math.exp(-T.cam.lerpPerS * dt)
  const c = clampCam(s.cam.x + (s.player.x - s.cam.x) * k, s.cam.y + (s.player.y - s.cam.y) * k, s.world.w, s.world.h, view)
  s.cam.x = c.x
  s.cam.y = c.y
}

// Pure and stateless: changes once per update step (meta.steps), never stored. Render scales by 0.4 for reducedFlash.
export function shakeOffset(s: State): { x: number; y: number } {
  const shaking = s.fx.shake > 0 ? s.fx.shakeMag * Math.min(1, s.fx.shake / T.cam.shakeDecayS) : 0
  const amp = shaking + (s.meta.phase === 'escape' ? T.escape.quakeShakePx : 0)
  if (amp <= 0) return { x: 0, y: 0 }
  const n = s.meta.steps
  return { x: amp * (hash2(n, 1, SHAKE_SALT) * 2 - 1), y: amp * (hash2(n, 2, SHAKE_SALT) * 2 - 1) }
}
