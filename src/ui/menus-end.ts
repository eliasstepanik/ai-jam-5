// Dead / won overlay (architecture-ui-2 §3, scoring §7). Called by drawScreen in menus.ts.
import { DEPTH_MAX } from '../core/score.ts'
import type { State } from '../core/types.ts'
import { COL, button, panel, text } from './draw.ts'
import { endLayout } from './layout.ts'
import { STR, clock } from './strings.ts'
import { TAU, clamp01, fadeIn, fill, focus } from './menu-kit.ts'
import type { Ctx } from './menu-kit.ts'

// --- end (dead / won) ---
export function drawEnd(ctx: Ctx, s: State, w: number, h: number): void {
  const r = s.result
  if (!r) return
  const l = endLayout(w, h, s), u = l.u, t = s.meta.time, red = s.settings.reducedFlash
  fill(ctx, r.won ? 'rgba(40,24,8,0.55)' : 'rgba(0,0,0,0.6)', 0, 0, w, h)
  fadeIn(ctx, s, u, 0.4)
  panel(ctx, l.panel, u)
  text(ctx, r.won ? STR.escaped : STR.died, l.title.x, l.title.y, 40, u, r.won ? COL.gold : COL.danger, { align: 'center', bold: true })
  if (r.isNewBest) { // NEW BEST! pulses 1..1.08 at 1.5 Hz (steady when flashing is reduced)
    ctx.save()
    const k = red ? 1 : 1 + 0.08 * (0.5 + 0.5 * Math.sin(t * TAU * 1.5))
    ctx.translate(l.banner.x, l.banner.y)
    ctx.scale(k, k)
    text(ctx, STR.newBest, 0, 0, 20, u, COL.gold, { align: 'center', bold: true })
    ctx.restore()
  } else {
    const prev = s.best?.score ?? r.prevBest
    if (prev > 0) text(ctx, `${STR.best} ${prev}`, l.banner.x, l.banner.y, 14, u, COL.dim, { align: 'center' })
  }
  const rows: [string, string][] = [[STR.rowDepth, `${r.depth} / ${DEPTH_MAX} · ${STR.zoneWord} ${r.zone}`], [STR.rowTime, clock(r.seconds)], [STR.rowMinerals, String(r.mineralsUsed)]]
  if (r.won) rows.push([STR.rowHearts, String(r.hpLeft)]) // dead run omits the hearts row (endLayout shifts the rest up)
  rows.forEach(([lb, v], i) => {
    text(ctx, lb, l.rows[i].label.x, l.rows[i].label.y, 16, u, COL.dim)
    text(ctx, v, l.rows[i].value.x, l.rows[i].value.y, 18, u, COL.text, { align: 'right', bold: true })
  })
  fill(ctx, COL.border, l.divider.x0, l.divider.y, l.divider.x1 - l.divider.x0, u)
  const x = clamp01((t - r.endAt - 0.4) / 0.8) // score counts up after the fade, ease-out cubic
  text(ctx, STR.score, l.score.label.x, l.score.label.y, 20, u, COL.text, { bold: true })
  text(ctx, String(Math.round(r.parts.total * (1 - (1 - x) ** 3))), l.score.value.x, l.score.value.y, 28, u, COL.gold, { align: 'right', bold: true })
  const p = r.parts, bd = STR.breakdown
  text(ctx, `${bd.depth} ${p.depth} · ${bd.win} ${p.win} · ${bd.time} ${p.time} · ${bd.minerals} ${p.minerals} · ${bd.hp} ${p.hp}`, l.breakdown.x, l.breakdown.y, 12, u, COL.dim, { align: 'center' })
  text(ctx, `${STR.parries} ${r.parries} (${STR.perfectWord} ${r.perfectParries}) · ${STR.kills} ${r.kills}`, l.flavour.x, l.flavour.y, 12, u, COL.dim, { align: 'center' })
  text(ctx, STR.seedLabel, l.seed.label.x, l.seed.label.y, 16, u, COL.dim)
  text(ctx, r.seedText, l.seed.value.x, l.seed.value.y, 18, u, COL.text, { bold: true })
  if (s.ui.copied > 0) text(ctx, s.ui.copyMsg, l.copied.x, l.copied.y, 12, u, COL.gold, { align: 'center' })
  const live = t - r.endAt >= 0.5 // input lockout: buttons look disabled until the screen accepts clicks
  const labels = [STR.newRun, STR.retrySeed, STR.title, STR.copyLink]
  labels.forEach((lb, i) => button(ctx, l.buttons[i], lb, { focused: focus(s, i), enabled: live }, u, t, red, i === 3 ? 14 : 18))
  text(ctx, STR.endHint, l.hint.x, l.hint.y, 12, u, COL.dim, { align: 'center' })
  ctx.restore()
}
