// One layout for drawing and pointer hit testing, with a real-scale page on small screens.
import type { State } from '../core/types.ts'
import { button, COL, panel, text } from './draw.ts'
import { uiScale, place } from './layout.ts'
import type { Button, Rect } from './layout.ts'
import { fadeIn, fill, focus } from './menu-kit.ts'
import { STR, pct } from './strings.ts'

export function settingsLayout(w: number, h: number, u = Math.min(w / 640, h / 480, uiScale(w, h))): { u: number; panel: Rect; buttons: Button[]; tracks: Rect[] } {
  const c = (x: number, y: number, bw: number, bh: number): Rect => place(w, h, u, .5, .5, x, y, bw, bh)
  return { u, panel: c(370, 136, 540, 448),
    buttons: ['music', 'effects', 'flashing', 'darkness', 'back'].map((id, i) =>
      ({ id, enabled: true, ...c(410, 214 + i * 66, 460, i < 2 ? 54 : 44) })),
    tracks: [0, 1].map(i => c(430, 248 + i * 66, 420, 6)) }
}

export function drawSettings(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  // Scale the whole page, including text minima, so labels cannot collide on narrow displays.
  const scale = settingsLayout(w, h).u
  ctx.save(); ctx.scale(scale, scale)
  const l = settingsLayout(w / scale, h / scale, 1), { u } = l
  fill(ctx, '#080605', 0, 0, w / scale, h / scale)
  fadeIn(ctx, s, u); panel(ctx, l.panel, u)
  text(ctx, STR.settings, l.panel.x + l.panel.w / 2, l.panel.y + 48 * u, 32, u, COL.text, { align: 'center', bold: true })
  for (let i = 0; i < 2; i++) {
    const b = l.buttons[i], track = l.tracks[i], on = focus(s, i)
    const value = i === 0 ? s.settings.musicVolume : s.settings.sfxVolume
    text(ctx, i === 0 ? STR.music : STR.soundEffects, b.x + 20 * u, b.y + 18 * u, 18, u, on ? COL.gold : COL.text)
    text(ctx, pct(value), b.x + b.w - 20 * u, b.y + 18 * u, 16, u, COL.dim, { align: 'right' })
    fill(ctx, COL.border, track.x, track.y, track.w, track.h)
    fill(ctx, on ? COL.gold : COL.accent, track.x, track.y, track.w * value, track.h)
    fill(ctx, on ? COL.gold : COL.text, Math.round(track.x + track.w * value - 4 * u), track.y - 4 * u, 8 * u, 14 * u)
  }
  const labels = [s.settings.reducedFlash ? STR.flashReduced : STR.flashFull,
    s.settings.pureDarkness ? STR.pureDarkness : STR.fogOfWar, STR.back]
  labels.forEach((label, i) => button(ctx, l.buttons[i + 2], label,
    { focused: focus(s, i + 2), enabled: true }, u, s.meta.time, s.settings.reducedFlash))
  const hint = s.settings.muted ? 'M: sound muted' : 'Drag sliders or use Left / Right'
  text(ctx, hint, l.panel.x + l.panel.w / 2, l.panel.y + l.panel.h - 16 * u, 12, u, COL.dim, { align: 'center' })
  ctx.restore(); ctx.restore()
}
