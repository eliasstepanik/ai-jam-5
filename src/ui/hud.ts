// L4 ui: in-game HUD, drawn in screen space (CSS px, transform setTransform(dpr,0,0,dpr,0,0)) after the world passes.
// Spec: docs/architecture-ui-2.md §1 (rows, §1.1 RUN! banner), architecture-modules-ui-assets.md §2. Reads State only, never writes it.
// HP, hotbar, flame, depth, prompts, toasts, parry text and the escape banner. Navigation is the wisp or opt-in developer arrow.
// ponytail: no module-level state; every animation is a pure function of meta.time / meta.steps / the State timers. The only
// state belongs to State and the resource registry.
import { heartFrames } from '../core/heart-ui.ts'
import { getResources } from '../assets/resources.ts'
import { UI_FPS, UI_TORCH_FRAMES } from '../assets/ui-data.ts'
import { skinSprite, skinPanel, skinMeter } from './skin.ts'
import { beaconInReach, beaconPosition } from '../world/beacon-position.ts'
import type { State, FlameKind, MineralId, Vein } from '../core/types.ts'
import { MINERALS, TILE, TOAST_S } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { clamp } from '../core/math.ts'
import { hash2 } from '../core/noise.ts'
import { DEPTH_MAX, depthOf, zoneOfDepth } from '../core/score.ts'
import { getDepthField } from '../world/caches.ts'
import { playerTile } from '../world/grid.ts'
import { resourceIcon } from '../render/tileset.ts'
import { drawSprite, spriteReady } from '../assets/images.ts'
import { makeView, toScreen } from '../render/view.ts'
import type { SpriteId } from '../assets/sprites.ts'
import { denyShake, pulse, shakeK } from './anim.ts'
import { hudLayout } from './layout.ts'
import type { HudLayout } from './layout.ts'
import { COL as MENU_COL, keycap, panel, ring, text, textWidth } from './draw.ts'
import { STR, clock, depthTag } from './strings.ts'

const COL = { ...MENU_COL, text: '#d8ccaa', dim: '#a19c85' } as const
const PS = 2 // UI sprites are authored at 1x and shown at 2u
const LOW_BPM = 70 // last-heart pulse; 1.17 Hz, under the 3 Hz flash limit
const BEACON_TICK_TILES = 8 // the minStartE tick shows within this many tiles of the Beacon (systems-2 §5)
const RUN_BANNER_S = 2
const HP_LOST_STEPS = 11 // about 180ms at 60 steps/s, fallback for missing UI art
// ponytail: HudLayout.exitBanner is the (640,200) anchor only; the baselines below sit under it (ui-2 §1.1, 40 bold + 16 under).
// Upgrade: add runTitle/runSub points to hudLayout (layout.ts) and read them here.
const RUN_TITLE_DY = 40
const RUN_SUB_DY = 66
// ponytail: flame colours come straight from T.minerals.table (same source as render/flame.ts FLAME_COL; ui may not import it, modules-ui-assets §0).
// Upgrade: move FLAME_COL to src/core and import it from both layers.
const flameCol = (k: FlameKind): { core: string; mantle: string } => T.minerals.table[k]

// Sprite at 2u. Atlas art takes the scale argument; placeholders ignore it (drawSprite), so scale the context for them.
function ui(ctx: CanvasRenderingContext2D, id: SpriteId, anim: string, frame: number, x: number, y: number, k: number, alpha = 1, rot = 0): void {
  if (spriteReady(id)) {
    drawSprite(ctx, id, anim, frame, x, y, rot, k, alpha)
    return
  }
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, k)
  drawSprite(ctx, id, anim, frame, 0, 0, rot, 1, alpha)
  ctx.restore()
}

export function drawHud(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const l = hudLayout(w, h, s)
  const descent = s.meta.phase === 'descent'
  ctx.save()
  ctx.imageSmoothingEnabled = false
  toasts(ctx, s, l)
  pips(ctx, s, l)
  if (descent) {
    flameReadout(ctx, s, l)
    hotbar(ctx, s, l)
  }
  depthBlock(ctx, s, l)
  prompt(ctx, s, w, h, l)
  parryText(ctx, s, l)
  runBanner(ctx, s, l)
  ctx.restore()
}

function toasts(ctx: CanvasRenderingContext2D, s: State, l: HudLayout): void {
  const u = l.u
  s.ui.toasts.forEach((t, i) => {
    const age = TOAST_S - t.t
    const slide = 8 * u * (1 - clamp(age / 0.15, 0, 1)) // slides down 8u over 0.15 s
    const tw = textWidth(ctx, t.text, 16, u, true)
    const bw = tw + 24 * u
    const top = l.toast.y + i * l.toastPitch - slide
    ctx.save()
    ctx.globalAlpha = clamp(t.t / 0.3, 0, 1)
    panel(ctx, { x: l.toast.x - bw / 2, y: top, w: bw, h: 24 * u }, u)
    text(ctx, t.text, l.toast.x, top + 17 * u, 16, u, COL.text, { align: 'center', bold: true })
    ctx.restore()
  })
}

function pips(ctx: CanvasRenderingContext2D, s: State, l: HudLayout): void {
  const p = s.player, u = l.u, rf = s.settings.reducedFlash
  // Track actual HP changes per slot; flame hits cannot break a heart. Keep the old event fallback for missing art.
  const frames = heartFrames(getResources().uiHearts ??= { runId: -1, hp: p.hp, time: 0, lostAt: [] }, p.hp, p.hpMax, s.meta.runId, s.meta.time)
  const hit = s.fx.events.some((e) => e.kind === 'hpHit' && s.meta.steps - e.step < HP_LOST_STEPS)
  const lost = hit && p.hp < p.hpMax ? p.hp : -1
  const beat = p.hp !== 1 ? 0 : 0.15 * pulse(s.meta.time, LOW_BPM / 60, rf, 0) // last pip: scale 1 -> 1.15, steady when reduced
  l.pips.forEach((c, i) => {
    let x = c.x, y = c.y
    if (frames[i] === 2) { // shake +-2u, motion-reduced like screen shake
      const k = shakeK(rf) * 2 * u
      x += (hash2(s.meta.steps, i, 3) * 2 - 1) * k
      y += (hash2(s.meta.steps, i, 4) * 2 - 1) * k
    }
    const scale = PS * u * (i === 0 ? 1 + beat : 1), frame = frames[i]
    if (!skinSprite(ctx, frame === 0 ? 'heart_full' : frame === 2 ? 'heart_lost' : 'heart_empty', 'ember', x - 6 * scale, y - 6 * scale, 12 * scale, 12 * scale))
      ui(ctx, 'ui_hp-pip', 'v', i === lost ? 2 : i < p.hp ? 0 : 1, x, y, scale)
  })
}

function flameReadout(ctx: CanvasRenderingContext2D, s: State, l: HudLayout): void {
  const p = s.player, u = l.u, t = s.meta.time, rf = s.settings.reducedFlash
  const col = flameCol(p.activeMineral)
  const out = p.energy <= 0
  panel(ctx, l.flame, u, COL.border, 'stone')
  const theme = p.activeMineral === 'none' ? 'normal' : p.activeMineral
  if (!skinSprite(ctx, UI_TORCH_FRAMES[Math.floor(t * UI_FPS) % 3], theme, l.flameSwatch.x - 12 * u, l.flameSwatch.y - 18 * u, 24 * u, 36 * u)) {
    ctx.fillStyle = col.mantle
    ctx.beginPath()
    ctx.arc(l.flameSwatch.x, l.flameSwatch.y, 8 * u, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = col.core
    ctx.beginPath()
    ctx.arc(l.flameSwatch.x, l.flameSwatch.y, 3 * u, 0, Math.PI * 2)
    ctx.fill()
  }
  const base = l.flameText.y + 3 * u
  if (out) {
    if (rf || Math.floor(t * 4) % 2 === 0) text(ctx, STR.flameOut, l.flameText.x, base, 14, u, COL.danger, { bold: true }) // 2 Hz
  } else {
    text(ctx, STR.flame[p.activeMineral === 'none' ? 'plain' : p.activeMineral], l.flameText.x, base, 14, u, col.mantle, { bold: true })
  }
  // Energy bar under the name; below flickerLowBelowE it pulses (1.5 Hz, or steady when flashing is reduced).
  const bx = l.flameText.x, bw = l.flame.x + l.flame.w - 8 * u - bx, by = l.flame.y + l.flame.h - 6 * u
  const f = clamp(p.energy / p.energyMax, 0, 1)
  ctx.fillStyle = COL.border
  ctx.fillRect(bx, by, bw, 3 * u)
  const low = p.energy < T.flame.flickerLowBelowE
  ctx.globalAlpha = low && !rf ? 0.65 + 0.35 * Math.sin(2 * Math.PI * 1.5 * t) : 1
  ctx.fillStyle = low ? COL.danger : col.mantle
  if (!skinMeter(ctx, { x: bx, y: by - u, w: bw, h: 4 * u }, f, u, theme)) ctx.fillRect(bx, by, bw * f, 3 * u)
  ctx.globalAlpha = 1
  if (!s.world.beaconLit && Math.hypot(p.x - (s.world.beacon.tx + 0.5) * TILE, p.y - (s.world.beacon.ty + 0.5) * TILE) <= BEACON_TICK_TILES * TILE) {
    ctx.fillStyle = COL.gold // Beacon start gate marker
    ctx.fillRect(bx + bw * clamp(T.beacon.minStartE / p.energyMax, 0, 1) - u, by - 2 * u, 2 * u, 7 * u)
  }
}

function depthBlock(ctx: CanvasRenderingContext2D, s: State, l: HudLayout): void {
  const u = l.u, field = getDepthField(s), i = playerTile(s)
  // Unreachable cell or empty world: fall back to the deepest depth reached so far.
  const depth = i >= 0 && i < field.length && field[i] >= 0 ? depthOf(field[i], s.world.beaconDist) : s.player.stats.maxDepth
  const max = ` / ${DEPTH_MAX}`
  const maxW = textWidth(ctx, max, 14, u)
  const main = `${STR.depth} ${depth}`
  const mainW = textWidth(ctx, main, 18, u, true)
  text(ctx, max, l.depth.x, l.depth.y, 14, u, COL.dim, { align: 'right' })
  text(ctx, main, l.depth.x - maxW, l.depth.y, 18, u, COL.text, { align: 'right', bold: true })
  const dx = l.depth.x - maxW - mainW - 16 * u
  if (!skinSprite(ctx, 'selection_pointer', 'stone', dx - 7 * u, l.depth.y - 10 * u, 14 * u, 8 * u))
    ui(ctx, 'ui_depth', 'idle', 0, dx, l.depth.y - 5 * u, PS * u)
  text(ctx, `${STR.zone} ${zoneOfDepth(depth)} · ${depthTag(s.world.depthClass, s.world.beaconDist)}`, l.zone.x, l.zone.y, 12, u, COL.dim, { align: 'right' })
  text(ctx, clock(s.meta.steps / 60), l.clock.x, l.clock.y, 14, u, COL.dim, { align: 'right' })
}

function hotbar(ctx: CanvasRenderingContext2D, s: State, l: HudLayout): void {
  const p = s.player, u = l.u
  const shake = denyShake(s.ui.denyT, u, s.settings.reducedFlash) // deny shake, 0.25 s, x0.4 when reduced
  MINERALS.forEach((m: MineralId, i) => {
    const r = l.slots[i], n = p.minerals[m], x = r.x + shake
    if (!skinPanel(ctx, { ...r, x }, PS * u, 'stone', p.selected === m))
      ui(ctx, 'ui_slot', 'v', p.selected === m ? 1 : 0, x + r.w / 2, r.y + r.h / 2, PS * u)
    const icon: SpriteId = `item_mineral-${m}`
    if (!resourceIcon(ctx, m, x + r.w / 2, r.y + r.h / 2, u, n > 0 ? 1 : 0.3)) ui(ctx, icon, 'idle', 0, x + r.w / 2, r.y + r.h / 2, PS * u, n > 0 ? 1 : 0.3)
    text(ctx, `×${n}`, x + 44 * u, r.y + 44 * u, 12, u, n > 0 ? COL.text : COL.dim, { align: 'right', bold: true })
    text(ctx, String(i + 1), x + r.w / 2, r.y - 6 * u, 12, u, COL.dim, { align: 'center' })
    if (p.activeMineral === m) {
      ctx.fillStyle = flameCol(m).mantle
      ctx.fillRect(x, r.y + 52 * u, r.w, 4 * u)
    }
  })
  text(ctx, STR.hotbarHint, l.hotbarHint.x, l.hotbarHint.y, 12, u, COL.dim, { align: 'center' })
}

type Target = { x: number; y: number; label: string; p: number; full: boolean }

// Vein face = midpoint of the shared edge of vein.tile and vein.stand (systems-2 §4); the nearest within reach wins, ties lower id.
function nearestVein(s: State): Vein | null {
  const w = s.world.w, p = s.player
  let best: Vein | null = null, bd = T.mining.reachPx
  for (const v of s.veins) {
    const d = Math.hypot(p.x - faceX(v, w), p.y - faceY(v, w))
    if (d > bd || (best && d === bd && v.id > best.id)) continue
    best = v
    bd = d
  }
  return best
}
const faceX = (v: Vein, w: number): number => ((v.tile % w) + (v.stand % w) + 1) * TILE / 2
const faceY = (v: Vein, w: number): number => (Math.floor(v.tile / w) + Math.floor(v.stand / w) + 1) * TILE / 2

function target(s: State): Target | null {
  const p = s.player, wd = s.world
  if (s.meta.phase !== 'descent') return null
  const { x: bx, y: by } = beaconPosition(s)
  if (!wd.beaconLit && beaconInReach(s, T.beacon.reachPx)) {
    return { x: bx, y: by, label: STR.beacon, p: p.beaconHold / T.beacon.holdS, full: false }
  }
  const v = nearestVein(s)
  if (!v) return null
  const full = p.minerals[v.mineral] >= T.minerals.cap
  const mined = p.mining.targetTile === v.tile ? p.mining.progress / T.mining.holdS : 0
  return { x: faceX(v, wd.w), y: faceY(v, wd.w), label: full ? STR.full : `${STR.mine} ${v.mineral}`, p: mined, full }
}

function prompt(ctx: CanvasRenderingContext2D, s: State, w: number, h: number, l: HudLayout): void {
  const t = target(s), u = l.u
  if (!t) return
  const [sx, sy] = toScreen(makeView(ctx, s, w, h), t.x, t.y)
  const half = textWidth(ctx, t.label, 12, u) / 2 + 8 * u
  const cx = clamp(sx, half, w - half), cy = clamp(sy - 40 * u, 24 * u, h - 44 * u) // label baseline is cy + 36u: keep it on screen
  if (!t.full) ring(ctx, cx, cy, clamp(t.p, 0, 1), u) // full pouch: keycap only, no ring
  keycap(ctx, 'E', cx, cy, u)
  text(ctx, t.label, cx, cy + 36 * u, 12, u, t.full ? COL.dim : COL.text, { align: 'center' })
}

function parryText(ctx: CanvasRenderingContext2D, s: State, l: HudLayout): void {
  const u = l.u, pr = s.player.parry, fl = clamp(s.fx.flare / T.parry.flareS, 0, 1)
  const age = pr.lastAt >= 0 ? (s.meta.steps - pr.lastAt) / 24 : 1 // 0.4 s at 60 steps/s
  let label: string = '', size = 0, color: string = COL.text, k = 1, a = 0
  if (fl > 0) { // PERFECT: rises 16u over the flare, scale pop 1 -> 1.3 (none when flashing is reduced)
    label = STR.parry.perfect; size = 32; color = COL.gold; a = fl; k = 1 - fl
    if (!s.settings.reducedFlash) size *= 1 + 0.3 * fl
  } else if (age >= 0 && age < 1 && (pr.lastGrade === 'good' || pr.lastGrade === 'poor')) {
    const good = pr.lastGrade === 'good'
    label = good ? STR.parry.good : STR.parry.poor; size = good ? 24 : 20; color = good ? COL.text : COL.dim; a = 1 - age; k = age
  }
  if (!label) return
  ctx.save()
  ctx.globalAlpha = clamp(a, 0, 1)
  text(ctx, label, l.parry.x, l.parry.y + size * u / 3 - 16 * u * k, size, u, color, { align: 'center', bold: true })
  ctx.restore()
}

function runBanner(ctx: CanvasRenderingContext2D, s: State, l: HudLayout): void {
  const t = s.director.escapeT
  if (s.meta.phase !== 'escape' || t >= RUN_BANNER_S) return
  const u = l.u
  ctx.save()
  ctx.globalAlpha = clamp((RUN_BANNER_S - t) / 0.5, 0, 1) // fades over the last 0.5 s
  text(ctx, STR.run, l.exitBanner.x, l.exitBanner.y + RUN_TITLE_DY * u, 40, u, COL.gold, { align: 'center', bold: true })
  text(ctx, STR.runSub, l.exitBanner.x, l.exitBanner.y + RUN_SUB_DY * u, 16, u, COL.text, { align: 'center' })
  ctx.restore()
}
