// Dead / won overlay (architecture-ui-2 §3, scoring §7). Called by drawScreen in menus.ts.
import { DEPTH_MAX } from '../core/score.ts'
import type { State } from '../core/types.ts'
import { COL, button, panel, text } from './draw.ts'
import { endLayout } from './layout.ts'
import { STR, clock, depthName } from './strings.ts'
import { countUp, pulse } from './anim.ts'
import { fadeIn, fill, focus } from './menu-kit.ts'
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
    const k = 1 + 0.08 * pulse(t, 1.5, red, 0)
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
  rows.push([STR.depthRow, depthName(s.world.depthClass)]) // depth class of the run (R-164); undefined reads as Standard
  // endLayout sizes l.rows for 3/4 rows and sits the divider just under them. The extra row would hit the divider at the
  // 30 ref-px pitch, so rows start 12 higher and use a 24 pitch: won 224..320 (divider 344), dead 224..296 (divider 314).
  const r0 = l.rows[0]
  rows.forEach(([lb, v], i) => {
    const y = r0.label.y + Math.round((i * 24 - 12) * u)
    text(ctx, lb, r0.label.x, y, 16, u, COL.dim)
    text(ctx, v, r0.value.x, y, 18, u, COL.text, { align: 'right', bold: true })
  })
  fill(ctx, COL.border, l.divider.x0, l.divider.y, l.divider.x1 - l.divider.x0, u)
  text(ctx, STR.score, l.score.label.x, l.score.label.y, 20, u, COL.text, { bold: true })
  text(ctx, String(countUp(t, r.endAt, r.parts.total, 0.4, 0.8)), l.score.value.x, l.score.value.y, 28, u, COL.gold, { align: 'right', bold: true })
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
