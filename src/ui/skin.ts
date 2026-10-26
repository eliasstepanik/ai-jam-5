// Nearest-neighbor sprite and nine-slice painting using the precolored local UI atlases.
import { getResources } from '../assets/resources.ts'
import { forcePlaceholders } from '../assets/images.ts'
import { UI_THEMES, UI_SPRITES, UI_SLICE } from '../assets/ui-data.ts'
import type { UiTheme, UiSprite } from '../assets/ui-data.ts'
import type { Rect } from './layout.ts'
export type { UiTheme } from '../assets/ui-data.ts'
function sheet(theme: UiTheme): HTMLImageElement | null {
  if (forcePlaceholders()) return null
  const im = getResources().images, i = 2 + UI_THEMES.indexOf(theme)
  return im.sheetState[i] === 'ok' ? im.sheets[i] ?? null : null
}
export function skinSprite(ctx: CanvasRenderingContext2D, name: UiSprite, theme: UiTheme,
  x: number, y: number, w: number, h: number): boolean {
  const im = sheet(theme)
  if (!im) return false
  const [sx, sy, sw, sh] = UI_SPRITES[name].rect
  ctx.save(); ctx.imageSmoothingEnabled = false
  ctx.drawImage(im, sx, sy, sw, sh, Math.round(x), Math.round(y), w, h)
  ctx.restore(); return true
}
export function skinPanel(ctx: CanvasRenderingContext2D, r: Rect, u: number,
  theme: UiTheme = 'menu', selected = false): boolean {
  const im = sheet(theme)
  if (!im) return false
  const [l, t, rr, b] = UI_SLICE, scale = Math.max(0.5, u)
  const dx = [0, Math.min(l * scale, r.w / 2), Math.max(r.w / 2, r.w - rr * scale), r.w]
  const dy = [0, Math.min(t * scale, r.h / 2), Math.max(r.h / 2, r.h - b * scale), r.h]
  const destX = dx.map(n => Math.round(r.x + n)), destY = dy.map(n => Math.round(r.y + n))
  const paint = (name: 'panel_9slice' | 'selection_9slice'): void => {
    const [sx, sy, sw, sh] = UI_SPRITES[name].rect, xx = [0, l, sw - rr, sw], yy = [0, t, sh - b, sh]
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      ctx.drawImage(im, sx + xx[col], sy + yy[row], xx[col + 1] - xx[col], yy[row + 1] - yy[row],
        destX[col], destY[row], destX[col + 1] - destX[col], destY[row + 1] - destY[row])
    }
  }
  ctx.save(); ctx.imageSmoothingEnabled = false
  paint('panel_9slice'); if (selected) paint('selection_9slice')
  ctx.restore(); return true
}
export function skinPointer(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, angle: number): boolean {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
  const ok = skinSprite(ctx, 'selection_pointer', 'menu', -7 * u, -4 * u, 14 * u, 8 * u)
  ctx.restore(); return ok
}
export function skinMeter(ctx: CanvasRenderingContext2D, r: Rect, fraction: number, u: number, theme: UiTheme): boolean {
  const im = sheet(theme)
  if (!im) return false
  const k = Math.max(0.5, u), filled = Math.floor(Math.max(0, Math.min(1, fraction)) * r.w / k) * k
  const [sx, sy, sw, sh] = UI_SPRITES.meter_fill_tile.rect
  ctx.save(); ctx.imageSmoothingEnabled = false
  ctx.beginPath(); ctx.rect(r.x, r.y, filled, r.h); ctx.clip()
  for (let x = 0; x < r.w; x += sw * k) ctx.drawImage(im, sx, sy, sw, sh, r.x + x, r.y, sw * k, r.h)
  if (filled > 0) skinSprite(ctx, 'meter_tip', theme, r.x + filled - 3 * k, r.y - k, 3 * k, 6 * k)
  ctx.restore(); return true
}
