// UI rectangles for every screen (architecture-ui §2-3). Pure maths, no DOM, no module state.
// Reference frame is 1280x720; every rect is anchored (ax, ay in 0..1) and scaled by uiScale. Update and render call the
// same *Layout(w, h, s); hit() then maps a click on input.view.w/h to a button index. Button array order == focus order
// in systems/screens.ts (title 0..4, paused 0..4, end 0..3), so ui.cursor/ui.hover indices line up (R-170).
import type { State } from '../core/types.ts'
import { HELP_PAGES } from '../core/state.ts'

export type Rect = { x: number; y: number; w: number; h: number }
export type Button = Rect & { id: string; enabled: boolean }
export type Pt = { x: number; y: number }

export const REF_W = 1280
export const REF_H = 720
export const MARGIN = 24 // safe margin in reference px
export const MIN_FONT_PX = 11

// Half-step integer-ish scale: crisp text, never below 0.5.
export const uiScale = (w: number, h: number): number => Math.max(0.5, Math.floor(Math.min(w / REF_W, h / REF_H) * 2) / 2)

// CSS font size for a reference size at scale u; never below MIN_FONT_PX.
export const fontPx = (size: number, u: number): number => Math.max(MIN_FONT_PX, Math.round(size * u))

export function place(w: number, h: number, u: number, ax: number, ay: number, x: number, y: number, bw: number, bh: number): Rect {
  return {
    x: Math.round(ax * w + (x - ax * REF_W) * u),
    y: Math.round(ay * h + (y - ay * REF_H) * u),
    w: Math.round(bw * u),
    h: Math.round(bh * u),
  }
}

// Anchored point (text baselines, centres). Same maths as place() with a zero size.
export const pt = (w: number, h: number, u: number, ax: number, ay: number, x: number, y: number): Pt => {
  const r = place(w, h, u, ax, ay, x, y, 0, 0)
  return { x: r.x, y: r.y }
}

export const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h

// First enabled button under (x, y), else -1.
export const hit = (bs: readonly Button[], x: number, y: number): number => bs.findIndex((b) => b.enabled && inRect(b, x, y))

const btn = (id: string, r: Rect, enabled = true): Button => ({ id, enabled, ...r })

// --- title ---
export type TitleLayout = {
  u: number
  buttons: Button[] // play, help, sound, flashing, seed
  bar: Rect // loading progress track
  logo: Rect
  tagline: Pt; seedLabel: Pt; seedHint: Pt
  best: Pt; storage: Pt // bottom-left baselines
  soundHint: Pt // bottom-right baseline, right-aligned
}

// ready = false while assets load: Play is disabled and shows the progress bar (assets live outside State).
export function titleLayout(w: number, h: number, _s: State, ready = true): TitleLayout {
  const u = uiScale(w, h)
  const c = (x: number, y: number, bw: number, bh: number): Rect => place(w, h, u, 0.5, 0.5, x, y, bw, bh)
  return {
    u,
    buttons: [
      btn('play', c(520, 372, 240, 44), ready),
      btn('help', c(520, 428, 240, 44)),
      btn('sound', c(520, 484, 240, 44)),
      btn('flashing', c(520, 540, 240, 44)),
      btn('seed', c(520, 612, 240, 40)),
    ],
    bar: c(540, 420, 200, 2),
    logo: place(w, h, u, 0.5, 0, 400, 96, 480, 120),
    tagline: pt(w, h, u, 0.5, 0, 640, 244),
    seedLabel: pt(w, h, u, 0.5, 0.5, 520, 604),
    seedHint: pt(w, h, u, 0.5, 0.5, 640, 668),
    best: pt(w, h, u, 0, 1, MARGIN, 696),
    storage: pt(w, h, u, 0, 1, MARGIN, 676),
    soundHint: pt(w, h, u, 1, 1, REF_W - MARGIN, 696),
  }
}

// --- help ---
export type HelpLayout = {
  u: number
  page: number
  panel: Rect
  tabs: Button[] // one per page
  footer: Pt
  art: Rect // goal art (page 0) / parry art (page 1)
  text: Rect // 3-line explanation under the art
  labels: Pt[] // art captions: page 0 ENTRANCE, ZONES, BEACON; page 1 EYES, CLICK, PERFECT; page 2 none
  controls: Rect; controlRow: number // page 0 key table (row pitch in px)
  ring: Pt & { r: number } // page 1 timing ring
  legend: Rect; legendRow: number // page 1
  table: Pt; tableRow: number; tableHead: number; cols: { icon: number; name: number; flame: number; effect: number; key: number } // page 2
  tips: Rect // page 2
}

export function helpLayout(w: number, h: number, s: State): HelpLayout {
  const u = uiScale(w, h)
  const c = (x: number, y: number, bw: number, bh: number): Rect => place(w, h, u, 0.5, 0.5, x, y, bw, bh)
  const p = (x: number, y: number): Pt => pt(w, h, u, 0.5, 0.5, x, y)
  const page = Math.min(HELP_PAGES - 1, Math.max(0, s.ui.helpPage))
  const t = p(152, 152)
  const col = (x: number): number => p(x, 0).x
  const labelXY = page === 0 ? [[472, 164], [180, 300], [472, 490]] : page === 1 ? [[258, 164], [472, 164], [686, 164]] : []
  return {
    u,
    page,
    panel: c(120, 72, 1040, 576),
    tabs: Array.from({ length: HELP_PAGES }, (_, i) => btn(`tab${i}`, c(152 + i * 180, 88, 168, 32))),
    footer: p(640, 628),
    art: c(152, 144, 640, 360),
    text: c(152, 520, 640, 100),
    labels: labelXY.map(([x, y]) => p(x, y)),
    controls: c(824, 144, 320, 460), controlRow: Math.round(36 * u),
    ring: { ...p(976, 300), r: Math.round(96 * u) },
    legend: c(840, 420, 300, 120), legendRow: Math.round(24 * u),
    table: t, tableRow: Math.round(64 * u), tableHead: Math.round(32 * u),
    cols: { icon: col(152), name: col(208), flame: col(352), effect: col(408), key: col(1088) },
    tips: c(152, 440, 976, 180),
  }
}

// Pointer on the help screen: a tab selects its page, a click outside the panel goes back, anything else is ignored.
export function helpClick(l: HelpLayout, x: number, y: number): { kind: 'tab'; page: number } | { kind: 'back' } | null {
  const i = hit(l.tabs, x, y)
  if (i >= 0) return { kind: 'tab', page: i }
  return inRect(l.panel, x, y) ? null : { kind: 'back' }
}

// --- paused ---
export type PauseLayout = { u: number; panel: Rect; title: Pt; buttons: Button[]; hint: Pt; copied: Pt }

export function pauseLayout(w: number, h: number, _s: State): PauseLayout {
  const u = uiScale(w, h)
  const c = (x: number, y: number, bw: number, bh: number): Rect => place(w, h, u, 0.5, 0.5, x, y, bw, bh)
  const ids = ['resume', 'help', 'sound', 'flashing', 'quit']
  return {
    u,
    panel: c(440, 176, 400, 376),
    title: pt(w, h, u, 0.5, 0.5, 640, 224),
    buttons: ids.map((id, i) => btn(id, c(520, 260 + i * 56, 240, 44))),
    hint: pt(w, h, u, 0.5, 0.5, 640, 544),
    copied: pt(w, h, u, 0.5, 0.5, 640, 564), // copy message under the hint
  }
}

// --- end (dead / won) ---
export type EndLayout = {
  u: number
  panel: Rect
  title: Pt; banner: Pt
  rows: { label: Pt; value: Pt }[] // depth, time, minerals [, hearts when won]
  divider: { x0: number; x1: number; y: number }
  score: { label: Pt; value: Pt }
  breakdown: Pt; flavour: Pt
  seed: { label: Pt; value: Pt }
  copied: Pt // copy message under the seed row
  buttons: Button[] // new, retry, title, copy (focus order)
  hint: Pt
}

export function endLayout(w: number, h: number, s: State): EndLayout {
  const u = uiScale(w, h)
  const c = (x: number, y: number, bw: number, bh: number): Rect => place(w, h, u, 0.5, 0.5, x, y, bw, bh)
  const p = (x: number, y: number): Pt => pt(w, h, u, 0.5, 0.5, x, y)
  const won = s.result?.won === true
  const n = won ? 4 : 3
  const up = won ? 0 : -30 // dead run omits the hearts row: everything below the rows moves up 30 (DEFAULT, ui-2 hp-left row)
  const div = place(w, h, u, 0.5, 0.5, 380, 344 + up, 520, 1)
  return {
    u,
    panel: c(340, 96, 600, 528),
    title: p(640, 152),
    banner: p(640, 188),
    rows: Array.from({ length: n }, (_, i) => ({ label: p(380, 236 + i * 30), value: p(900, 236 + i * 30) })),
    divider: { x0: div.x, x1: div.x + div.w, y: div.y },
    score: { label: p(380, 384 + up), value: p(900, 384 + up) },
    breakdown: p(640, 410 + up),
    flavour: p(640, 436 + up),
    seed: { label: p(380, 476 + up), value: p(440, 476 + up) },
    copied: p(640, 502 + up),
    buttons: [
      btn('new', c(364, 528, 168, 44)),
      btn('retry', c(556, 528, 168, 44)),
      btn('title', c(748, 528, 168, 44)),
      btn('copy', c(760, 458 + up, 140, 28)),
    ],
    hint: p(640, 600),
  }
}

// --- HUD (playing) ---
export type HudLayout = {
  u: number
  pips: Pt[] // hp pip centres, one per hpMax
  flame: Rect; flameSwatch: Pt; flameText: Pt
  depth: Pt; zone: Pt; clock: Pt // right-aligned baselines
  slots: Rect[] // hotbar, mineral order 1 2 3
  hotbarHint: Pt
  toast: Pt; toastPitch: number // first toast centre-baseline, pitch in px
  parry: Pt; exitBanner: Pt
}

export function hudLayout(w: number, h: number, s: State): HudLayout {
  const u = uiScale(w, h)
  const tl = (x: number, y: number): Pt => pt(w, h, u, 0, 0, x, y)
  const tr = (x: number, y: number): Pt => pt(w, h, u, 1, 0, x, y)
  const tc = (x: number, y: number): Pt => pt(w, h, u, 0.5, 0, x, y)
  return {
    u,
    pips: Array.from({ length: s.player.hpMax }, (_, i) => tl(36 + i * 28, 36)),
    flame: place(w, h, u, 0, 0, MARGIN, 60, 160, 24),
    flameSwatch: tl(36, 72),
    flameText: tl(52, 72),
    depth: tr(REF_W - MARGIN, 44),
    zone: tr(REF_W - MARGIN, 64),
    clock: tr(REF_W - MARGIN, 84),
    slots: [560, 616, 672].map((x) => place(w, h, u, 0.5, 1, x, 644, 48, 48)),
    hotbarHint: pt(w, h, u, 0.5, 1, 640, 708),
    toast: tc(640, 120),
    toastPitch: Math.round(26 * u),
    parry: pt(w, h, u, 0.5, 0.5, 640, 300), // centre-anchored (architecture-ui-2 §1)
    exitBanner: tc(640, 200),
  }
}
