// Pure placement shared by UI drawing and checks.
import { clamp } from '../core/math.ts'
import type { HudLayout } from './layout.ts'
export function escapeTipPose(t: number, l: HudLayout): { x: number; y: number; size: number } {
  const f = clamp((t - 2) / .8, 0, 1), ease = f * f * (3 - 2 * f)
  return { x: l.exitBanner.x + (l.hotbarHint.x - l.exitBanner.x) * ease,
    y: l.exitBanner.y + 98 * l.u + (l.hotbarHint.y - l.exitBanner.y - 98 * l.u) * ease,
    size: 16 - 4 * ease }
}
