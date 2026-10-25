// Full-screen overlays: title, help, paused, dead, won (architecture-ui §7-8, ui-2 §2-3, scoring §7). Stateless: reads State and
// the resource registry, draws, keeps nothing between calls. Hit-testing and focus live in layout.ts / systems/screens.ts.
import { resourceIcon } from '../render/tileset.ts'
import { drawSprite } from '../assets/images.ts'
import { getResources } from '../assets/resources.ts'
import { hash2 } from '../core/noise.ts'
import { DEPTH_MAX } from '../core/score.ts'
import { MINERALS } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import type { State } from '../core/types.ts'
import { MAX_ATTEMPTS } from '../world/generate.ts'
import { logoGlow } from './anim.ts'
import { COL, button, keycap, panel, text, textWidth } from './draw.ts'
import { helpLayout, pauseLayout, titleLayout, titleReady, uiScale } from './layout.ts'
import { drawEnd } from './menus-end.ts'
import { TAU, fadeIn, fill, focus } from './menu-kit.ts'
import type { Ctx } from './menu-kit.ts'
import { HELP, STR, clock, depthName, pct } from './strings.ts'

// Stroked arc, a0..a1 in turns from `from` (default 12 o'clock, clockwise). Callers wrap in save/restore: it leaves alpha and styles set.
function arc(ctx: Ctx, cx: number, cy: number, r: number, a0: number, a1: number, color: string, lw: number, alpha = 1, from = -Math.PI / 2): void {
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.beginPath()
  ctx.arc(cx, cy, r, from + a0 * TAU, from + a1 * TAU)
  ctx.stroke()
}

function glow(ctx: Ctx, x: number, y: number, r: number, a: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, `rgba(255,138,30,${a})`)
  g.addColorStop(1, 'rgba(255,138,30,0)')
  fill(ctx, g, x - r, y - r, 2 * r, 2 * r)
}

// Title / help backdrop: key art cover-cropped at a whole-number scale (nearest), else black with an ember glow and 12 eye pairs.
function backdrop(ctx: Ctx, s: State, w: number, h: number, u: number, alpha: number): void {
  const art = getResources().images.screens.keyart
  fill(ctx, '#000', 0, 0, w, h)
  ctx.save()
  ctx.globalAlpha = alpha
  if (art) {
    const k = Math.ceil(Math.max(w / 960, h / 540)) // ponytail: assumes 960x540 art; other sizes still cover. Upgrade: scale by art.width.
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(art, Math.round((w - art.width * k) / 2), Math.round((h - art.height * k) / 2), art.width * k, art.height * k)
  } else {
    glow(ctx, w / 2, h / 2, 180 * u, 0.25)
    for (let i = 0; i < 12; i++) {
      const a = hash2(i, 0, 1) * TAU, x = w / 2 + Math.cos(a) * 260 * u, y = h / 2 + Math.sin(a) * 260 * u
      ctx.globalAlpha = alpha * (s.settings.reducedFlash ? 0.7 : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(s.meta.time * 0.8 + hash2(i, 0, 2) * TAU)))
      fill(ctx, '#cbb8ff', x - 5 * u, y, 3 * u, 3 * u)
      fill(ctx, '#cbb8ff', x + 2 * u, y, 3 * u, 3 * u)
    }
  }
  ctx.restore()
}

const soundLabel = (s: State): string => (s.settings.muted ? STR.soundOff : `${STR.soundOn} ${pct(s.settings.volume)}`)
const flashLabel = (s: State): string => (s.settings.reducedFlash ? STR.flashReduced : STR.flashFull)
const depthLabel = (s: State): string => (s.settings.depthClass === 'random' ? `${STR.depthLabel}: Random` : `${STR.depthLabel}: ${depthName(s.settings.depthClass)}`)

// --- title ---
function drawTitle(ctx: Ctx, s: State, w: number, h: number): void {
  const res = getResources(), im = res.images
  // ready = preload finished or 5 s elapsed (titleReady). game.ts hit-tests with the same value so the Play click matches this drawing.
  const ready = titleReady(s, im)
  const l = titleLayout(w, h, s, ready), u = l.u, t = s.meta.time, red = s.settings.reducedFlash
  backdrop(ctx, s, w, h, u, 1)
  if (s.ui.genPending !== '') { // chunked cave generation: the screen stays 'title' until the run starts
    fill(ctx, 'rgba(0,0,0,0.6)', 0, 0, w, h)
    text(ctx, STR.loading, w / 2, h / 2, 24, u, COL.text, { align: 'center', bold: true })
    ctx.save()
    arc(ctx, w / 2, h / 2 + 44 * u, 14 * u, t * 0.64, t * 0.64 + 0.75, COL.accent, 3 * u, 1, 0) // spinner: 3/4 ring, 0.64 turn/s
    ctx.restore()
    if (import.meta.env.DEV) text(ctx, `attempt ${s.ui.genAttempt + 1}/${MAX_ATTEMPTS}`, w / 2, h / 2 + 84 * u, 12, u, COL.dim, { align: 'center' })
    return
  }
  fadeIn(ctx, s, u)
  const lg = l.logo, logo = im.screens.logo
  glow(ctx, lg.x + lg.w / 2, lg.y + lg.h / 2, 200 * u, logoGlow(t, red))
  if (logo) {
    ctx.imageSmoothingEnabled = false // inside fadeIn's save/restore
    ctx.drawImage(logo, lg.x, lg.y, lg.w, lg.h)
  } else { // text logo: orange lower half, the "ember" under the letters
    const x = lg.x + lg.w / 2, y = lg.y + lg.h * 0.7
    text(ctx, STR.logoFallback, x, y, 64, u, COL.text, { align: 'center', bold: true })
    ctx.save()
    ctx.beginPath()
    ctx.rect(lg.x, lg.y + lg.h / 2, lg.w, lg.h / 2)
    ctx.clip()
    text(ctx, STR.logoFallback, x, y, 64, u, COL.accent, { align: 'center', bold: true, shadow: false })
    ctx.restore()
  }
  text(ctx, STR.tagline, l.tagline.x, l.tagline.y, 16, u, COL.dim, { align: 'center' })
  const prog = im.total > 0 ? im.loaded / im.total : 0
  const labels = [ready ? STR.play : `${STR.loadingBtn} ${pct(prog)}`, STR.help, soundLabel(s), flashLabel(s), depthLabel(s)]
  for (let i = 0; i < labels.length; i++) button(ctx, l.buttons[i], labels[i], { focused: focus(s, i), enabled: l.buttons[i].enabled }, u, t, red)
  if (!ready) { // progress track + fill under Play
    fill(ctx, COL.border, l.bar.x, l.bar.y, l.bar.w, l.bar.h)
    fill(ctx, COL.accent, l.bar.x, l.bar.y, l.bar.w * prog, l.bar.h)
  }
  const sb = l.buttons[5], typing = s.ui.cursor === 5, sx = sb.x + 12 * u, sy = sb.y + sb.h / 2 + 5 * u
  text(ctx, STR.seedLabel, l.seedLabel.x, l.seedLabel.y, 14, u, COL.dim)
  button(ctx, sb, '', { focused: focus(s, 5), enabled: true }, u, t, red)
  text(ctx, s.ui.seedInput || STR.seedPlaceholder, sx, sy, 16, u, s.ui.seedInput ? COL.text : COL.dim)
  if (typing && Math.floor(t * 4) % 2 === 0) fill(ctx, COL.gold, sx + (s.ui.seedInput ? textWidth(ctx, s.ui.seedInput, 16, u) : 0) + 2 * u, sy - 14 * u, 2 * u, 18 * u) // caret, 2 Hz
  text(ctx, STR.seedHint, l.seedHint.x, l.seedHint.y, 12, u, COL.dim, { align: 'center' })
  // Best line: `Best 5483 · Standard · depth 40/40 · 6:57 · escaped`. DEFAULT: a best that did not escape carries no tag (the death tag is unspecified).
  // The class name is the class the shown Best was loaded for (ui.bestClass, #119); a Best record stores no Beacon distance, so no tiles here.
  const b = s.best
  const best = b ? `${STR.best} ${b.score} · ${depthName(s.ui.bestClass)} · ${STR.depthWord} ${b.depth}/${DEPTH_MAX} · ${clock(b.seconds)}${b.won ? ' · ' + STR.bestEscaped : ''}` : STR.noBest
  text(ctx, best, l.best.x, l.best.y, 14, u, COL.dim)
  if (!s.ui.storageOk) text(ctx, STR.storageOff, l.storage.x, l.storage.y, 12, u, COL.accent)
  const hint = res.audio.state === 'failed' ? STR.soundFailed : s.settings.muted ? STR.soundMuted : res.audio.state !== 'running' ? STR.soundHint : STR.version
  text(ctx, hint, l.soundHint.x, l.soundHint.y, 12, u, hint === STR.version ? COL.dim : COL.accent, { align: 'right' })
  ctx.restore()
}

// --- paused (over the frozen world) ---
function drawPause(ctx: Ctx, s: State, w: number, h: number): void {
  const l = pauseLayout(w, h, s), u = l.u, red = s.settings.reducedFlash
  fill(ctx, 'rgba(0,0,0,0.55)', 0, 0, w, h)
  fadeIn(ctx, s, u)
  panel(ctx, l.panel, u)
  text(ctx, STR.paused, l.title.x, l.title.y, 40, u, COL.text, { align: 'center', bold: true })
  const labels = [STR.resume, STR.help, soundLabel(s), flashLabel(s), s.ui.confirmT > 0 ? STR.quitConfirm : STR.quit]
  labels.forEach((lb, i) => button(ctx, l.buttons[i], lb, { focused: focus(s, i), enabled: true }, u, s.meta.time, red))
  text(ctx, `${STR.seedLabel} ${s.meta.seedText} · ${STR.depthWord} ${s.player.stats.maxDepth} · ${clock(s.meta.steps / 60)}`, l.hint.x, l.hint.y, 12, u, COL.dim, { align: 'center' })
  if (s.ui.copied > 0) text(ctx, s.ui.copyMsg, l.copied.x, l.copied.y, 12, u, COL.gold, { align: 'center' })
  ctx.restore()
}

// --- help (3 pages) ---
const BANDS = ['#3a332d', '#2d333b', '#29342c', '#2b2234'] // zone floor colours 1-4 (style §4.2 ramp) for the goal-art fallback
const CYCLE_S = 1.5 // ponytail: demo ring loops every 1.5 s regardless of T.monsters; it only teaches the timing order, not exact seconds.

function helpArt(ctx: Ctx, art: { x: number; y: number; w: number; h: number }, key: 'helpGoal' | 'helpParry', u: number): void {
  const img = getResources().images.screens[key]
  if (img) {
    ctx.imageSmoothingEnabled = false // inside drawHelp's fadeIn save/restore
    ctx.drawImage(img, art.x, art.y, art.w, art.h)
  } else if (key === 'helpGoal') { // stacked zone bands with a dotted path from entrance to Beacon
    BANDS.forEach((c, i) => fill(ctx, c, art.x, art.y + (art.h / 4) * i, art.w, art.h / 4))
    for (let i = 0; i < 24; i++) fill(ctx, COL.accent, art.x + art.w * (0.5 + 0.3 * Math.sin(i * 0.6)), art.y + (art.h / 24) * (i + 0.5), 4 * u, 4 * u)
  } else fill(ctx, '#141114', art.x, art.y, art.w, art.h)
  ctx.strokeStyle = COL.border
  ctx.lineWidth = 2 * u
  ctx.strokeRect(art.x, art.y, art.w, art.h)
}

function timingRing(ctx: Ctx, s: State, cx: number, cy: number, r: number, u: number): void {
  const m = T.monsters.lurker, p = T.parry, tc = m.telegraphS + m.contactS, f = (sec: number): number => sec / CYCLE_S
  const ph = (s.settings.reducedFlash ? 0 : s.meta.time % CYCLE_S), lw = 10 * u
  ctx.save()
  for (const [a0, a1, col, al] of [[0, CYCLE_S, COL.border, 1], [0, m.telegraphS, '#6b4fb8', 0.8], [m.telegraphS, tc, '#8a7f70', 1],
    [tc - p.earlyMaxS, tc + p.lateMaxS, '#e8dcc8', 1], [tc - p.perfectS, tc + p.perfectS, COL.gold, 1]] as const) {
    arc(ctx, cx, cy, r, f(a0), f(a1), col, lw, al)
  }
  const a = -Math.PI / 2 + f(ph) * TAU // needle
  ctx.globalAlpha = 1
  ctx.strokeStyle = COL.accent
  ctx.lineWidth = 2 * u
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(a) * (r + 8 * u), cy + Math.sin(a) * (r + 8 * u))
  ctx.stroke()
  const eye = ph < m.telegraphS ? '#ffffff' : '#cbb8ff' // the eyes flare during the telegraph
  fill(ctx, eye, cx - 12 * u, cy - 6 * u, 8 * u, 6 * u)
  fill(ctx, eye, cx + 4 * u, cy - 6 * u, 8 * u, 6 * u)
  ctx.restore()
  if (Math.abs(ph - tc) <= p.perfectS) text(ctx, STR.helpArt.ringClick, cx, cy + 28 * u, 14, u, COL.gold, { align: 'center', bold: true })
}

function drawHelp(ctx: Ctx, s: State, w: number, h: number): void {
  const l = helpLayout(w, h, s), u = l.u
  backdrop(ctx, s, w, h, u, 0.4)
  fill(ctx, 'rgba(0,0,0,0.6)', 0, 0, w, h)
  fadeIn(ctx, s, u)
  panel(ctx, l.panel, u)
  l.tabs.forEach((b, i) => {
    const on = i === l.page
    text(ctx, STR.helpTabs[i], b.x + b.w / 2, b.y + b.h / 2 + 6 * u, 18, u, on ? COL.gold : COL.dim, { align: 'center', bold: on })
    if (on) fill(ctx, COL.gold, b.x, b.y + b.h, b.w, 2 * u)
  })
  text(ctx, STR.helpFooter, l.footer.x, l.footer.y, 14, u, COL.dim, { align: 'center' })
  const a = STR.helpArt, names = l.page === 0 ? [a.entrance, a.zones, a.beacon] : [a.eyes, a.click, a.perfect]
  if (l.page < 2) {
    helpArt(ctx, l.art, l.page === 0 ? 'helpGoal' : 'helpParry', u)
    l.labels.forEach((p, i) => text(ctx, names[i], p.x, p.y, 14, u, COL.text, { align: 'center', bold: true }))
    const lines = l.page === 0 ? HELP[0].goal : HELP[1].rules
    lines.forEach((ln, i) => text(ctx, ln, l.text.x, l.text.y + 20 * u + i * 30 * u, 16, u, COL.text))
  }
  if (l.page === 0) {
    HELP[0].controls.forEach(([key, act], i) => {
      const cy = l.controls.y + 20 * u + i * l.controlRow
      if (key.length <= 4) keycap(ctx, key, l.controls.x + 16 * u, cy, u)
      else text(ctx, key, l.controls.x, cy + 4 * u, 12, u, COL.gold, { bold: true }) // ponytail: the 32u keycap fits 4 characters; longer keys are plain text
      text(ctx, act, l.controls.x + 72 * u, cy + 5 * u, 14, u, COL.text)
    })
  } else if (l.page === 1) {
    timingRing(ctx, s, l.ring.x, l.ring.y, l.ring.r, u)
    HELP[1].legend.forEach(([str, col], i) => {
      const y = l.legend.y + i * l.legendRow
      fill(ctx, col, l.legend.x, y - 6 * u, 12 * u, 12 * u)
      text(ctx, str, l.legend.x + 20 * u, y + 5 * u, 14, u, COL.text)
    })
  } else {
    const c = l.cols, head = l.table.y + 20 * u, fl = STR.helpCols
    for (const [str, x] of [[fl.mineral, c.icon], [fl.flame, c.flame], [fl.effect, c.effect], [fl.key, c.key]] as const) {
      text(ctx, str, x, head, 14, u, COL.dim, { align: str === fl.key ? 'right' : 'left' })
    }
    HELP[2].minerals.forEach((m, i) => {
      const cy = l.table.y + l.tableHead + i * l.tableRow + l.tableRow / 2
      if (i === 0) {
        ctx.fillStyle = COL.accent
        ctx.beginPath()
        ctx.arc(c.icon + 16 * u, cy, 8 * u, 0, TAU)
        ctx.fill()
      } else if (!resourceIcon(ctx, MINERALS[i - 1], c.icon + 16 * u, cy, u)) drawSprite(ctx, `item_mineral-${MINERALS[i - 1]}`, 'idle', 0, c.icon + 16 * u, cy, 0, 2 * u) // placeholder art ignores scale, atlas art honours it
      text(ctx, m.name, c.name, cy + 6 * u, 16, u, COL.text, { bold: true })
      for (const [r, col] of [[12, m.mantle], [5, m.core]] as const) { // flame swatch: mantle disc, core disc
        ctx.fillStyle = col
        ctx.beginPath()
        ctx.arc(c.flame + 12 * u, cy, r * u, 0, TAU)
        ctx.fill()
      }
      text(ctx, m.effect, c.effect, cy + 6 * u, 16, u, COL.text)
      keycap(ctx, m.key, c.key - 16 * u, cy, u)
    })
    HELP[2].tips.forEach((tip, i) => text(ctx, '• ' + tip, l.tips.x, l.tips.y + 20 * u + i * 30 * u, 16, u, COL.text))
  }
  ctx.restore()
}

// Draws the overlay for meta.screen: title, help, paused, dead or won. Nothing for 'playing'. Called by render passes 1 and 21 (R-094).
export function drawScreen(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const sc = s.meta.screen
  if (sc === 'title') drawTitle(ctx, s, w, h)
  else if (sc === 'help') {
    // Scale the whole help page together: clamped individual font sizes overlap its columns on small screens.
    const scale = Math.min(1, uiScale(w, h))
    ctx.save()
    ctx.scale(scale, scale)
    drawHelp(ctx, s, w / scale, h / scale)
    ctx.restore()
  }
  else if (sc === 'paused') drawPause(ctx, s, w, h)
  else if (sc === 'dead' || sc === 'won') drawEnd(ctx, s, w, h)
}
