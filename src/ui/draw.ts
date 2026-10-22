// Canvas 2D UI drawing helpers (architecture-ui §3-4). Stateless: every helper saves/restores what it touches.
// Colours are the UI palette from architecture-ui §4; sizes are reference px scaled by u (see layout.fontPx).
import { vnoise } from '../core/noise.ts'
import { PLACEHOLDERS } from '../assets/placeholders-ui.ts'
import { fontPx } from './layout.ts'
import type { Rect } from './layout.ts'

export const FONT = 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace'

export const COL = {
  text: '#e8dcc8',
  dim: '#8a7f70',
  accent: '#ff8a1e',
  gold: '#ffd27a', // selected / win
  danger: '#ff3b2a',
  panel: 'rgba(18,15,13,0.85)',
  border: '#3a2e24',
  highlight: '#5c4a38',
  shadow: '#0a0809',
} as const

export type TextOpts = { align?: CanvasTextAlign; bold?: boolean; shadow?: boolean }

// Baseline text with the 1u drop shadow drawn first (no shadowBlur: it is slow and blurry on canvas).
export function text(
  ctx: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, u: number, color: string = COL.text, o: TextOpts = {},
): void {
  ctx.save()
  ctx.font = `${o.bold ? 'bold ' : ''}${fontPx(size, u)}px ${FONT}`
  ctx.textAlign = o.align ?? 'left'
  ctx.textBaseline = 'alphabetic'
  if (o.shadow !== false) {
    ctx.fillStyle = COL.shadow
    ctx.fillText(str, x + u, y + u)
  }
  ctx.fillStyle = color
  ctx.fillText(str, x, y)
  ctx.restore()
}

// Width of a string at the same font text() would use; callers size toast panels with it.
export function textWidth(ctx: CanvasRenderingContext2D, str: string, size: number, u: number, bold = false): number {
  ctx.save()
  ctx.font = `${bold ? 'bold ' : ''}${fontPx(size, u)}px ${FONT}`
  const wd = ctx.measureText(str).width
  ctx.restore()
  return wd
}

// Dark translucent panel with a 2u border.
export function panel(ctx: CanvasRenderingContext2D, r: Rect, u: number, border: string = COL.border): void {
  ctx.fillStyle = COL.panel
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.strokeStyle = border
  ctx.lineWidth = 2 * u
  ctx.strokeRect(r.x + u, r.y + u, r.w - 2 * u, r.h - 2 * u)
}

export type ButtonState = { focused: boolean; enabled: boolean }

// Menu button. Focused (keyboard cursor or hover): gold border + text and two 4u ember ticks outside the left/right edges.
// t = meta.time, drives the optional tick flicker (0.8 + 0.2 * vnoise in [-1, 1] = 0.6..1.0 alpha, architecture-ui-2 §3); pass reduced = true to hold it steady.
export function button(
  ctx: CanvasRenderingContext2D, r: Rect, label: string, st: ButtonState, u: number, t = 0, reduced = false, size = 18,
): void {
  const on = st.focused && st.enabled
  panel(ctx, r, u, on ? COL.gold : COL.border)
  if (on) {
    ctx.save()
    ctx.globalAlpha = reduced ? 1 : 0.8 + 0.2 * vnoise(t * 6, 3)
    ctx.fillStyle = COL.accent
    const k = 4 * u
    ctx.fillRect(r.x - 2 * k, r.y + r.h / 2 - k / 2, k, k)
    ctx.fillRect(r.x + r.w + k, r.y + r.h / 2 - k / 2, k, k)
    ctx.restore()
  }
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + (size / 3) * u, size, u, !st.enabled ? COL.dim : on ? COL.gold : COL.text, { align: 'center', bold: true })
}

// Key cap: the 16x16 ui_keycap placeholder at 2u scale plus a bold 12 label centred on it. (cx, cy) = cap centre.
// ponytail: calls the placeholder DrawFn directly because assets/images.ts drawSprite (A10) is not on this branch.
// Upgrade: swap the two lines below for drawSprite(ctx, 'ui_keycap', 'idle', 0, cx, cy, 0, 2 * u, 1).
export function keycap(ctx: CanvasRenderingContext2D, label: string, cx: number, cy: number, u: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(2 * u, 2 * u)
  PLACEHOLDERS.ui_keycap(ctx, 'idle', 0, 0)
  ctx.restore()
  text(ctx, label, cx, cy + 4 * u, 12, u, COL.text, { align: 'center', bold: true })
}

// Hold ring (mining / Beacon): track + arc of progress p in 0..1, radius 20u, 3u line, starting at 12 o'clock.
export function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, p: number, u: number, r = 20, color: string = COL.accent): void {
  ctx.save()
  ctx.lineWidth = 3 * u
  ctx.strokeStyle = COL.border
  ctx.beginPath()
  ctx.arc(cx, cy, r * u, 0, Math.PI * 2)
  ctx.stroke()
  if (p > 0) {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(cx, cy, r * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p))
    ctx.stroke()
  }
  ctx.restore()
}
