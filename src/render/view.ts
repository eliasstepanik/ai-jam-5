// L4 render: camera transform, integer device zoom, pixel snap, culling rect. Spec: docs/architecture-render.md §4.1-4.4,
// architecture-render-3.md §2, R-017 (shakeOffset lives in systems/camera.ts), R-131 (zoom in device px). Pure: no State writes.
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { clamp } from '../core/math.ts'
import { shakeOffset } from '../systems/camera.ts'
import { deviceZoom } from './keys.ts'

export type View = {
  dpr: number; cw: number; ch: number; w: number; h: number
  z: number; ox: number; oy: number
  x0: number; y0: number; x1: number; y1: number // visible world rect (px), padded by 1 tile
  tx0: number; ty0: number; tx1: number; ty1: number // visible tile range, clamped to the map
}

const REDUCED_SHAKE = 0.4 // settings.reducedFlash scales the shake (render.md §4.4)
const BEACON_BLEND_S = 1.5 // Beacon-lit transition length (render-3 §2)

// Host sets setTransform(dpr, 0, 0, dpr, 0, 0) just before render, so ctx.getTransform().a is the dpr.
export function makeView(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): View {
  const dpr = ctx.getTransform().a
  const cw = Math.round(w * dpr)
  const ch = Math.round(h * dpr)
  const z = deviceZoom(ch) // equals viewZoomCss(h, dpr) * dpr, the zoom update aims with (R-131)
  const { x: sx, y: sy } = shakeOffset(s)
  const k = s.settings.reducedFlash ? REDUCED_SHAKE : 1
  const ox = Math.round(cw / 2 - (s.cam.x + sx * k) * z) // shake enters before rounding: shaken frames stay pixel-snapped
  const oy = Math.round(ch / 2 - (s.cam.y + sy * k) * z)
  const x0 = -ox / z - TILE, y0 = -oy / z - TILE
  const x1 = (cw - ox) / z + TILE, y1 = (ch - oy) / z + TILE
  return { dpr, cw, ch, w, h, z, ox, oy, x0, y0, x1, y1,
    tx0: Math.max(0, Math.floor(x0 / TILE)), ty0: Math.max(0, Math.floor(y0 / TILE)),
    tx1: Math.min(s.world.w - 1, Math.floor(x1 / TILE)), ty1: Math.min(s.world.h - 1, Math.floor(y1 / TILE)) }
}

// World space: one world px = z device px, origin at the snapped camera offset.
export const worldXf = (ctx: CanvasRenderingContext2D, v: View): void => ctx.setTransform(v.z, 0, 0, v.z, v.ox, v.oy)
// Screen space in CSS px (HUD, overlays): backing store scaled by dpr.
export const screenXf = (ctx: CanvasRenderingContext2D, v: View): void => ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
// World px -> CSS px.
export const toScreen = (v: View, x: number, y: number): [number, number] => [(x * v.z + v.ox) / v.dpr, (y * v.z + v.oy) / v.dpr]

// Point inside the visible world rect (already padded by 1 tile), edges included. GAP G3.
export const inView = (v: View, x: number, y: number): boolean => x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1

// Eased 0..1 ramp after the Beacon is lit, 0 before. GAP G3, State field world.beaconLitAt.
// Escape without a recorded ignition (beaconLit false or beaconLitAt unset = 0, e.g. tests and debug phase jumps) counts as
// fully faded (1): the ramp would return 0 there and leave the screen dark for good.
export function beaconBlend(s: State): number {
  if (s.meta.phase === 'escape' && (!s.world.beaconLit || s.world.beaconLitAt <= 0)) return 1
  if (!s.world.beaconLit) return 0
  const k = clamp((s.meta.time - s.world.beaconLitAt) / BEACON_BLEND_S, 0, 1)
  return k * k * (3 - 2 * k)
}
