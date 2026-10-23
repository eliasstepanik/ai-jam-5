// L4 ui: in-game HUD, drawn in screen space (CSS px, transform setTransform(dpr,0,0,dpr,0,0)) after the world passes.
// Spec: docs/architecture-ui-2.md §1 (rows, §1.1 RUN! banner), architecture-modules-ui-assets.md §2. Reads State only, never writes it.
// HP, hotbar, flame, depth, prompt, toasts, parry text, pulses and shakes, plus the escape-phase exit marker (ui-2 §1.1, rocks-2 §6).
// ponytail: no module-level state; every animation is a pure function of meta.time / meta.steps / the State timers. The only
// state is the exit-arrow smoothing in getResources().hud (render-side registry, not State).
import type { State, FlameKind, MineralId, Vein } from '../core/types.ts'
import { MINERALS, TILE, TOAST_S } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { clamp, wrapPi } from '../core/math.ts'
import { hash2 } from '../core/noise.ts'
import { DEPTH_MAX, depthOf, zoneOfDepth } from '../core/score.ts'
import { getDepthField } from '../world/caches.ts'
import { exitHeading } from '../world/route.ts'
import { playerTile, tileToWorld } from '../world/grid.ts'
import { makeView, toScreen } from '../render/view.ts'
import { drawSprite, spriteReady } from '../assets/images.ts'
import { getResources } from '../assets/resources.ts'
import type { SpriteId } from '../assets/sprites.ts'
import { hudLayout } from './layout.ts'
import type { HudLayout } from './layout.ts'
import { COL, keycap, panel, ring, text, textWidth } from './draw.ts'
import { STR, clock } from './strings.ts'

const PS = 2 // UI sprites are authored at 1x and shown at 2u
const LOW_BPM = 70 // last-heart pulse; 1.17 Hz, under the 3 Hz flash limit
const BEACON_TICK_TILES = 8 // the minStartE tick shows within this many tiles of the Beacon (systems-2 §5)
const RUN_BANNER_S = 2
const EXIT_SMOOTH = 12 // exit-arrow angle smoothing rate (1/s), ui-2 §1.1
const EXIT_SNAP = 2.5 // rad: a bigger turn snaps instead of sweeping
const EXIT_TEXT_S = 0.1 // the distance text refreshes at most this often
const EXIT_INSET = 64 // u: off-screen arrow ellipse inset from the screen edge
const EXIT_MARGIN = 24 // px: the exit counts as on screen inside this margin
const EXIT_COL = '#cfe3ff'
const HP_LOST_STEPS = 18 // 0.3 s at 60 steps/s: how long the just-lost pip shows frame 2 and shakes
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
  exitMarker(ctx, s, w, h, l)
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
  // The pip just lost: only an 'hpHit' event (emitted by hurtPlayerHp, the one HP-loss path) marks real HP loss. hurtT alone is
  // also set by a flame hit (no HP lost), so it must not drive the shake. Events live 30 steps in fx.events; the lost pip is index hp.
  const hit = s.fx.events.some((e) => e.kind === 'hpHit' && s.meta.steps - e.step < HP_LOST_STEPS)
  const lost = hit && p.hp < p.hpMax ? p.hp : -1
  const beat = rf || p.hp !== 1 ? 0 : 0.15 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (LOW_BPM / 60) * s.meta.time))
  l.pips.forEach((c, i) => {
    let x = c.x, y = c.y
    if (i === lost) { // shake +-2u, motion-reduced like screen shake
      const k = (rf ? 0.4 : 1) * 2 * u
      x += (hash2(s.meta.steps, i, 3) * 2 - 1) * k
      y += (hash2(s.meta.steps, i, 4) * 2 - 1) * k
    }
    ui(ctx, 'ui_hp-pip', 'v', i === lost ? 2 : i < p.hp ? 0 : 1, x, y, PS * u * (i === 0 ? 1 + beat : 1))
  })
}

function flameReadout(ctx: CanvasRenderingContext2D, s: State, l: HudLayout): void {
  const p = s.player, u = l.u, t = s.meta.time, rf = s.settings.reducedFlash
  const col = flameCol(p.activeMineral)
  const out = p.energy <= 0
  panel(ctx, l.flame, u)
  ctx.fillStyle = col.mantle
  ctx.beginPath()
  ctx.arc(l.flameSwatch.x, l.flameSwatch.y, 8 * u, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = col.core
  ctx.beginPath()
  ctx.arc(l.flameSwatch.x, l.flameSwatch.y, 3 * u, 0, Math.PI * 2)
  ctx.fill()
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
  ctx.fillRect(bx, by, bw * f, 3 * u)
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
  ui(ctx, 'ui_depth', 'idle', 0, l.depth.x - maxW - mainW - 16 * u, l.depth.y - 5 * u, PS * u)
  text(ctx, `${STR.zone} ${zoneOfDepth(depth)}`, l.zone.x, l.zone.y, 12, u, COL.dim, { align: 'right' })
  text(ctx, clock(s.meta.steps / 60), l.clock.x, l.clock.y, 14, u, COL.dim, { align: 'right' })
}

function hotbar(ctx: CanvasRenderingContext2D, s: State, l: HudLayout): void {
  const p = s.player, u = l.u
  const shake = s.ui.denyT > 0 ? 3 * u * Math.sin(s.ui.denyT * 60) : 0 // deny shake, 0.25 s
  MINERALS.forEach((m: MineralId, i) => {
    const r = l.slots[i], n = p.minerals[m], x = r.x + shake
    ui(ctx, 'ui_slot', 'v', p.selected === m ? 1 : 0, x + r.w / 2, r.y + r.h / 2, PS * u)
    const icon: SpriteId = `item_mineral-${m}`
    ui(ctx, icon, 'idle', 0, x + r.w / 2, r.y + r.h / 2, PS * u, n > 0 ? 1 : 0.3)
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
  const bx = (wd.beacon.tx + 0.5) * TILE, by = (wd.beacon.ty + 0.5) * TILE
  if (!wd.beaconLit && Math.hypot(p.x - bx, p.y - by) <= T.beacon.reachPx) {
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

// Escape-phase exit marker. The heading is smoothed in getResources().hud (reset per run); exit on screen = pulsing ring + bobbing
// arrow above it, off screen = arrow on an inset ellipse pointing along the heading, with `EXIT 42 m`.
function exitMarker(ctx: CanvasRenderingContext2D, s: State, w: number, h: number, l: HudLayout): void {
  if (s.meta.phase !== 'escape') return
  const res = getResources(), now = s.meta.time, u = l.u
  let hs = res.hud
  if (!hs || hs.runId !== s.meta.runId) hs = res.hud = { exitA: 0, lastT: now, runId: s.meta.runId, dist: -1, distT: -1 }
  const hd = exitHeading(s, hs.exitA)
  const fdt = clamp(now - hs.lastT, 0, 0.1)
  hs.lastT = now
  if (hd) {
    const d = wrapPi(hd.angle - hs.exitA)
    hs.exitA = hs.dist < 0 || Math.abs(d) > EXIT_SNAP ? hd.angle : hs.exitA + d * (1 - Math.exp(-EXIT_SMOOTH * fdt))
    if (hs.dist < 0 || now - hs.distT >= EXIT_TEXT_S || now < hs.distT) { hs.dist = hd.dist; hs.distT = now }
  }
  if (hs.dist < 0) return // no route info yet: nothing to show
  const v = makeView(ctx, s, w, h), a = hs.exitA
  const [ex, ey] = toScreen(v, tileToWorld(s.world.exit.tx), tileToWorld(s.world.exit.ty))
  ctx.save()
  if (ex >= EXIT_MARGIN && ex <= w - EXIT_MARGIN && ey >= EXIT_MARGIN && ey <= h - EXIT_MARGIN) {
    const tile = TILE * v.z / v.dpr, pulse = 0.5 + 0.5 * Math.sin(now * Math.PI * 3) // 1.5 Hz, under the 3 Hz flash limit
    ctx.globalAlpha = 0.5 + 0.5 * pulse
    ctx.strokeStyle = EXIT_COL
    ctx.lineWidth = 2 * u
    ctx.beginPath()
    ctx.arc(ex, ey, tile * (0.55 + 0.15 * pulse), 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    ui(ctx, 'ui_exit-arrow', 'idle', 0, ex, ey - tile * 0.9 - 4 * u * (1 + Math.sin(now * Math.PI * 4)), PS, 1, Math.PI / 2) // bobs 8u at 2 Hz, points down
  } else {
    const ax = w / 2 + Math.cos(a) * (w / 2 - EXIT_INSET * u), ay = h / 2 + Math.sin(a) * (h / 2 - EXIT_INSET * u)
    ui(ctx, 'ui_exit-arrow', 'idle', 0, ax, ay, PS, 0.85 + 0.15 * Math.sin(now * Math.PI * 2), a)
    const label = `${STR.exit} ${hs.dist} m`, half = textWidth(ctx, label, 14, u) / 2 + 8 * u
    text(ctx, label, clamp(ax - Math.cos(a) * (half + 12 * u), half, w - half), ay - Math.sin(a) * 24 * u + 5 * u, 14, u, EXIT_COL, { align: 'center', bold: true })
  }
  ctx.restore()
}
