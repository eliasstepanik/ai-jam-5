// L4 render: full-screen overlays. Pass 15 Beacon-lit warm multiply, pass 19 flashes and vignettes.
// Spec: docs/architecture-render-3.md §2 (Beacon-lit mode) and §4 (damage flash, vignettes, flame-out look), ui-2 §6 (reducedFlash).
// All three functions draw in device pixels (identity transform, v.cw x v.ch) and leave identity transform, source-over, alpha 1.
// Pure: reads State only. Mutable data is the vignette sprites in res.light (key vigKey); this module keeps no state and no module-level effects.
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { clamp } from '../core/math.ts'
import { getResources } from '../assets/resources.ts'
import { VIG_STEP, vigKey } from './keys.ts'
import { ctx2d, newCanvas } from './light.ts'
import type { Quality } from './quality.ts'
import { beaconBlend } from './view.ts'
import type { View } from './view.ts'

const WARM = '#ffb36b', WARM_ALPHA = 0.55 // Beacon multiply tint (style §5)
const WHITE_OUT = '#fff4d6', WHITE_OUT_ALPHA = 0.85
const HIT = '#ff3b2a', HIT_FLASH_ALPHA = 0.35, HIT_VIG_ALPHA = 0.6
const LOW_HP_BASE = 0.25, LOW_HP_PULSE = 0.15, HEARTBEAT_HZ = 70 / 60 // 70 BPM
const FLAME_OUT = '#000000', FLAME_OUT_ALPHA = 0.5
const FLARE_ALPHA = 0.25
const REDUCED_FLASH = 0.3 // settings.reducedFlash scales every flash layer (same constant as glow.ts)

function fillScreen(ctx: CanvasRenderingContext2D, v: View, color: string, alpha: number): void {
  ctx.fillStyle = color
  ctx.globalAlpha = alpha
  ctx.fillRect(0, 0, v.cw, v.ch)
}

// Pass 15. Whole cave tinted warm once the Beacon is lit (tiles the memory layer never touched show too). The darkness already faded in pass 14.
export function drawBeaconMode(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const k = beaconBlend(s)
  if (k <= 0) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'multiply'
  fillScreen(ctx, v, WARM, WARM_ALPHA * k)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

// Pass 19, first half: Beacon white-out, damage flash (both x0.3 with reducedFlash) and the perfect-parry flare wash (additive).
// `_q`: the flashes are drawn at every quality (they are gameplay feedback); the parameter keeps the pass signature uniform with drawVignettes.
export function drawFlashes(ctx: CanvasRenderingContext2D, s: State, v: View, _q: Quality): void {
  const rf = s.settings.reducedFlash ? REDUCED_FLASH : 1
  const white = clamp(s.fx.beaconFlash / T.beacon.flashS, 0, 1)
  const hit = clamp(s.player.hitFlash / T.hurt.flashS, 0, 1)
  const flare = clamp(s.fx.flare / T.parry.flareS, 0, 1)
  if (white <= 0 && hit <= 0 && flare <= 0) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  if (white > 0) fillScreen(ctx, v, WHITE_OUT, WHITE_OUT_ALPHA * white * rf)
  if (hit > 0) fillScreen(ctx, v, HIT, HIT_FLASH_ALPHA * hit * rf)
  if (flare > 0) {
    ctx.globalCompositeOperation = 'lighter'
    fillScreen(ctx, v, WHITE_OUT, FLARE_ALPHA * flare * rf)
    ctx.globalCompositeOperation = 'source-over'
  }
  ctx.globalAlpha = 1
}

// Radial vignette sprite in `hex` (transparent centre, opaque corners), cached in res.light. Canvas size is the CSS size rounded up to
// VIG_STEP, drawn stretched to the backing store: the gradient is smooth, so the stretch is invisible.
// ponytail: cache entries are never evicted; a window resize adds at most one entry per size step and colour (2 colours). Upgrade: LRU.
function vignette(hex: string, w: number, h: number): HTMLCanvasElement {
  const bw = Math.max(1, Math.ceil(w / VIG_STEP)) * VIG_STEP, bh = Math.max(1, Math.ceil(h / VIG_STEP)) * VIG_STEP
  const cache = getResources().light, key = vigKey(hex, bw, bh)
  let sprite = cache.get(key)
  if (sprite) return sprite
  sprite = newCanvas(bw, bh)
  const g = ctx2d(sprite), rgb = parseInt(hex.slice(1), 16), c = (rgb >> 16 & 255) + ',' + (rgb >> 8 & 255) + ',' + (rgb & 255)
  const grad = g.createRadialGradient(bw / 2, bh / 2, 0.45 * Math.min(bw, bh), bw / 2, bh / 2, 0.75 * Math.hypot(bw, bh) / 2)
  grad.addColorStop(0, 'rgba(' + c + ',0)')
  grad.addColorStop(1, 'rgba(' + c + ',1)')
  g.fillStyle = grad
  g.fillRect(0, 0, bw, bh)
  cache.set(key, sprite)
  return sprite
}

function drawVignette(ctx: CanvasRenderingContext2D, v: View, hex: string, alpha: number): void {
  if (alpha <= 0) return
  ctx.globalAlpha = clamp(alpha, 0, 1)
  ctx.drawImage(vignette(hex, v.w, v.h), 0, 0, v.cw, v.ch)
}

// Pass 19, second half: hit vignette, low-HP heartbeat vignette (hp 1 full, hp 2 half strength; no pulse with reducedFlash), flame-out
// vignette (descent only). Skipped entirely when the quality level has no vignette (q.vignette false at level 3).
export function drawVignettes(ctx: CanvasRenderingContext2D, s: State, v: View, q: Quality): void {
  if (!q.vignette) return
  const p = s.player
  const hit = HIT_VIG_ALPHA * clamp(p.hitFlash / T.hurt.flashS, 0, 1)
  const pulse = s.settings.reducedFlash ? 0 : LOW_HP_PULSE * Math.sin(s.meta.time * 2 * Math.PI * HEARTBEAT_HZ)
  const low = p.hp === 1 ? LOW_HP_BASE + pulse : p.hp === 2 ? 0.5 * (LOW_HP_BASE + pulse) : 0
  const red = Math.max(hit, low)
  const out = p.energy <= 0 && s.meta.phase === 'descent'
  if (red <= 0 && !out) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  if (out) drawVignette(ctx, v, FLAME_OUT, FLAME_OUT_ALPHA)
  drawVignette(ctx, v, HIT, red)
  ctx.globalAlpha = 1
}
