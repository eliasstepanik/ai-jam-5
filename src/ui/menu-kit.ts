// Helpers shared by the menu screens (menus.ts, menus-end.ts). Stateless; imports only draw/type modules, so no cycles.
import type { State } from '../core/types.ts'

export type Ctx = CanvasRenderingContext2D
export const TAU = Math.PI * 2
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
// Keyboard cursor and mouse hover share one highlight (ui.md §7).
export const focus = (s: State, i: number): boolean => i === s.ui.cursor || i === s.ui.hover

// Screen content fades in and slides up 12u (title/help/pause 0.25 s, end 0.4 s). Pair with ctx.restore().
export function fadeIn(ctx: Ctx, s: State, u: number, dur = 0.25): void {
  const k = clamp01((s.meta.time - s.ui.screenAt) / dur)
  ctx.save()
  ctx.globalAlpha = k
  ctx.translate(0, (1 - k) * 12 * u)
}

// Filled rectangle in one call (also used for the full-screen dimmers).
export const fill = (ctx: Ctx, color: string | CanvasGradient, x: number, y: number, w: number, h: number): void => {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}
