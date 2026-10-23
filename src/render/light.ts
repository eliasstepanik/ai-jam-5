// L4 render: darkness pass (pass 14). Spec: docs/architecture-render-2.md §5.1, §5.3-5.6, architecture-render-3.md §2, §3.2,
// architecture-modules-render.md row light.ts, R-083, R-145. Mask sprites live in the registry (res.light, key maskKey), the dark
// canvas in res.dark; this module keeps no state (hot-reload rule) and never writes State. Flicker is render-only and is
// computed from T.flame (architecture-tuning.md §3) because T, not a FLAME.flickerFreq table, exists in the code.
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { TILE } from '../core/state.ts'
import { flameRadius } from '../systems/light.ts'
import { getResources } from '../assets/resources.ts'
import type { Canvas2D } from '../assets/resources.ts'
import type { Quality } from './quality.ts'
import { beaconBlend } from './view.ts'
import type { View } from './view.ts'
import { MASK_BUCKETS, bucketOf, maskKey } from './keys.ts'
import type { MaskKind } from './keys.ts'

export type LightSource = { x: number; y: number; r: number; kind: MaskKind }
export type MaskStamp = (c: CanvasRenderingContext2D, L: LightSource, v: View, r: number, s: State) => void

const DARK_DPR_CAP = 1 // dark canvas never exceeds CSS resolution: the mask is soft (render-2 §5.1)
const MASK_OUTER = 1.25 // sprite radius / gameplay radius: the gameplay edge sits in the fade band (render-2 §5.4)
const SHAFT_R = 72, BEACON_R = 96 // world px (render-2 §5.6)
const FLICKER_PHASE = 1.7 // second sine phase (architecture-tuning.md §3)

// Alpha stops per mask profile (render-2 §5.4). Colour is irrelevant for destination-out; copper reuses the plain profile.
const PLAIN: readonly (readonly [number, number])[] = [[0, 1], [0.5, 1], [0.8, 0.65], [0.92, 0.25], [1, 0]]
const MASK_STOPS: Record<MaskKind, readonly (readonly [number, number])[]> = {
  none: PLAIN,
  copper: PLAIN,
  sodium: [[0, 1], [0.58, 1], [0.82, 0.6], [0.94, 0.2], [1, 0]],
  strontium: [[0, 0.9], [0.4, 0.85], [0.75, 0.45], [0.9, 0.12], [1, 0]],
  beacon: [[0, 1], [0.3, 0.9], [0.7, 0.4], [1, 0]],
  shaft: [[0, 0.85], [0.5, 0.5], [1, 0]],
  ember: [[0, 0.55], [0.6, 0.3], [1, 0]],
}

// Canvas creation is lazy and only here (no DOM at import). Plain Node has no document: tests install a stub.
export function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d')
  if (!g) throw new Error('2d canvas context unavailable')
  return g
}

// Radius multiplier of the player's flame: two non-harmonic sines, wider when the energy is low (tuning §3). Pure in (s).
// Module-private: glow.ts and entities.ts do not import it; tests read it back through the mask stamp size.
function flicker(s: State): number {
  const F = T.flame
  const p = s.player
  const e = Math.max(0, p.energy)
  const amp = F.flickerAmp * T.minerals.table[p.activeMineral].flickerMul
    + (e < F.flickerLowBelowE ? F.flickerLowAmp * (1 - e / F.flickerLowBelowE) : 0)
  const t = s.meta.time
  return 1 + amp * 0.5 * (Math.sin(2 * Math.PI * F.flickerHzA * t) + Math.sin(2 * Math.PI * F.flickerHzB * t + FLICKER_PHASE))
}

// Cosmetic mask sources. Gameplay visibility is insideLight only; these only shape the mask. R-083 names a systems
// lightSources(s) that the code does not have, so render derives the three sources from the exports it does have.
// ponytail: allocates one small array per frame (<= 3 objects); upgrade: reuse a registry scratch array if a profile shows GC.
function maskSources(s: State): LightSource[] {
  const p = s.player
  const R = flameRadius(s) // never LIGHT_ALL, also in escape (the darkness fade keeps a normal flame mask)
  const out: LightSource[] = [p.energy <= 0
    ? { x: p.x, y: p.y, r: T.flame.radiusOutPx, kind: 'ember' } // flame out: MIN_PLAYER_GLOW = 22 px, silhouette stays readable
    : { x: p.x, y: p.y, r: R, kind: p.activeMineral }]
  const en = s.world.entrance
  out.push({ x: (en.tx + 0.5) * TILE, y: (en.ty + 0.5) * TILE, r: SHAFT_R, kind: 'shaft' })
  if (!s.world.beaconLit && p.beaconHold > 0) {
    const b = s.world.beacon
    out.push({ x: (b.tx + 0.5) * TILE, y: (b.ty + 0.5) * TILE, r: BEACON_R * Math.min(1, p.beaconHold / T.beacon.holdS), kind: 'beacon' })
  }
  return out
}

function maskSprite(kind: MaskKind, b: number): HTMLCanvasElement {
  const cache = getResources().light
  const key = maskKey(kind, b)
  let sprite = cache.get(key)
  if (sprite) return sprite
  sprite = newCanvas(b, b)
  const g = ctx2d(sprite)
  const grad = g.createRadialGradient(b / 2, b / 2, 0, b / 2, b / 2, b / 2)
  for (const [at, a] of MASK_STOPS[kind]) grad.addColorStop(at, 'rgba(255,255,255,' + a + ')')
  g.fillStyle = grad
  g.fillRect(0, 0, b, b)
  cache.set(key, sprite)
  return sprite
}

// Stamps one radial mask into the dark canvas (composite destination-out is set by the caller). `r` = dark px per device px.
// The bucket follows the unflickered diameter so flicker never swaps sprites; flicker only scales the draw.
export const stampRadial: MaskStamp = (c, L, v, r, s) => {
  const xd = (L.x * v.z + v.ox) * r
  const yd = (L.y * v.z + v.oy) * r
  const px = L.r * MASK_OUTER * v.z * r
  const f = L.kind === 'beacon' || L.kind === 'shaft' ? 1 : flicker(s)
  const rd = px * f
  if (xd + rd < 0 || xd - rd > v.cw * r || yd + rd < 0 || yd - rd > v.ch * r) return
  c.drawImage(maskSprite(L.kind, bucketOf(2 * px, MASK_BUCKETS)), xd - rd, yd - rd, 2 * rd, 2 * rd)
}

// Resized in place; never recreated (render-2 §5.1).
function ensureDark(v: View, q: Quality): Canvas2D {
  const res = getResources()
  const k = Math.min(v.dpr, DARK_DPR_CAP) * q.darkRes
  const dw = Math.max(1, Math.ceil(v.w * k)), dh = Math.max(1, Math.ceil(v.h * k)) // >= 1: drawImage of a 0-sized canvas throws
  let d = res.dark
  if (!d) {
    const canvas = newCanvas(dw, dh)
    d = res.dark = { canvas, ctx: ctx2d(canvas), w: dw, h: dh }
  } else if (d.w !== dw || d.h !== dh) {
    d.canvas.width = dw
    d.canvas.height = dh
    d.w = dw
    d.h = dh
  }
  return d
}

// Pass 14. `memory` is the explored-tile canvas (320x240, 1 px per tile) built by memory.ts (A15); by default the registry
// canvas res.memory.canvas, so A17 may pass memoryCanvas(s) explicitly. Without it the unexplored area stays black.
// Reveal and a finished Beacon blend draw no darkness at all. Escape does NOT return early: lightRadius is LIGHT_ALL from
// the step the Beacon is lit, but the darkness still fades out with alpha 1 - k over 1.5 s (render-3 §2, render-2 §5.3);
// the masks use flameRadius, so the player's flame stays a normal flame during the fade.
// Postcondition, on EVERY exit path (reveal, finished blend, normal, escape fade): identity transform, source-over, alpha 1,
// smoothing off. The caller (A17) must set worldXf again before the next world-space pass; pass 15 fills (0,0,cw,ch) as is.
export function drawDarkness(ctx: CanvasRenderingContext2D, s: State, v: View, q: Quality,
  memory: CanvasImageSource | null = getResources().memory.canvas?.canvas ?? null): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.imageSmoothingEnabled = false
  if (s.debug.reveal || s.debug.noFog) return
  const k = beaconBlend(s)
  if (k >= 1) return
  const d = ensureDark(v, q)
  const c = d.ctx
  const r = d.w / v.cw
  c.globalCompositeOperation = 'source-over'
  c.globalAlpha = 1
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.fillStyle = '#000'
  c.fillRect(0, 0, d.w, d.h) // off-map area and everything the memory layer does not cover
  if (memory) {
    c.imageSmoothingEnabled = true // soft memory edges
    const sx = v.tx0, sy = v.ty0, sw = v.tx1 - v.tx0 + 1, sh = v.ty1 - v.ty0 + 1
    const kt = TILE * v.z * r
    c.drawImage(memory, sx, sy, sw, sh, (sx * TILE * v.z + v.ox) * r, (sy * TILE * v.z + v.oy) * r, sw * kt, sh * kt)
  }
  c.globalCompositeOperation = 'destination-out'
  for (const L of maskSources(s)) stampRadial(c, L, v, r, s)
  c.globalCompositeOperation = 'source-over'
  ctx.imageSmoothingEnabled = true
  ctx.globalAlpha = 1 - k
  ctx.drawImage(d.canvas, 0, 0, d.w, d.h, 0, 0, v.cw, v.ch)
  ctx.globalAlpha = 1
  ctx.imageSmoothingEnabled = false
}
