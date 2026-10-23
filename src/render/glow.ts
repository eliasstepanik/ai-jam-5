// L4 render: additive glow pass (pass 17, composite 'lighter', world transform). Spec: docs/architecture-render-3.md §1
// (layer table) and §4 (flare), architecture-render-2.md §3.3 (swing arc), §5.6 (flame-out ember), R-088 (drawGlowSprite
// signature). Glow sprites are coloured radial gradients cached in the registry (res.light, key glowKey); this module keeps no
// state and never writes State. Eyes (drawEyes, pass 16) use the entities.ts helpers. Rocks have no glow layer (render-3 §1 table); their telegraph is in props.ts.
import type { MonsterKind, State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { TILE } from '../core/state.ts'
import { clamp } from '../core/math.ts'
import { hash2, vnoise } from '../core/noise.ts'
import { flameRadius } from '../systems/light.ts'
import { getResources } from '../assets/resources.ts'
import type { Quality } from './quality.ts'
import type { View } from './view.ts'
import { FLAME_COL } from './flame.ts'
import { FACE_H } from './tiles-paint.ts'
import { PLAYER_FOOT } from './entities-player.ts'
import { GLOW_BUCKETS, bucketOf, glowKey } from './keys.ts'
import { ctx2d, newCanvas } from './light.ts'
import { EYES_ID, MON_SCALE, MON_FOOT, drawFrame, entityInView, eyeAlpha, eyeAnim, eyeFrame, eyeVisible, monsterDirection, torchTip } from './entities.ts'

export type TipFn = (s: State) => { x: number; y: number }

const RESIN = '#d9861c', PLANT = '#b6ff8a' // pickup glow colours (render-3 §1)
const CRYSTAL = { sodium: '#ffe14a', copper: '#1fd6b8', strontium: '#e0182d' } as const // style §4.4 "Crystal light"
const BEACON_COL = '#ffb347', BEACON_CORE = '#fff4d6', SHAFT_COL = '#cfe3ff', FLARE_COL = '#fff4d6'
const REDUCED_FLASH = 0.3 // settings.reducedFlash scales every flash layer (ui-2 §6, render-3 §4)
const VEIN_R = 10 // vein glint radius
const SHAFT_R = 48 // entrance shaft radius (its dust motes stay within 40 px of the centre)
const VEIN_PAD = 32 // vein glints show only within R + 32 (render-3 §1)
const MOTES = 6, MOTE_SALT = 31 // entrance dust motes
const SPARK_ARC_R = 22, SPARK_ARC_W = 6 // swing arc (render-2 §3.3)
const EYE_IDLE = '#6b4fb8', EYE_TELEGRAPH = '#b48cff' // eye halo colours (render-2 §3.2, style §4)
const EYE_HALO_R: Record<MonsterKind, number> = { lurker: 4, stalker: 6, devourer: 9 } // render-3 §1: 4 / 6 / 9

function glowSprite(hex: string, b: number): HTMLCanvasElement {
  const cache = getResources().light
  const key = glowKey(hex, b)
  let sprite = cache.get(key)
  if (sprite) return sprite
  sprite = newCanvas(b, b)
  const g = ctx2d(sprite)
  const rgb = parseInt(hex.slice(1), 16)
  const c = (rgb >> 16 & 255) + ',' + (rgb >> 8 & 255) + ',' + (rgb & 255)
  const grad = g.createRadialGradient(b / 2, b / 2, 0, b / 2, b / 2, b / 2)
  grad.addColorStop(0, 'rgba(' + c + ',1)')
  grad.addColorStop(0.25, 'rgba(' + c + ',0.55)')
  grad.addColorStop(0.6, 'rgba(' + c + ',0.15)')
  grad.addColorStop(1, 'rgba(' + c + ',0)')
  g.fillStyle = grad
  g.fillRect(0, 0, b, b)
  cache.set(key, sprite)
  return sprite
}

// One additive glow sprite centred on world (x, y) with world radius r. The bucket is chosen from the device-px diameter
// (current transform scale), so the sprite is never upscaled more than once. Composite op is the caller's ('lighter').
export function drawGlowSprite(ctx: CanvasRenderingContext2D, hex: string, x: number, y: number, r: number, alpha: number): void {
  if (alpha <= 0 || r <= 0) return
  const b = bucketOf(2 * r * ctx.getTransform().a, GLOW_BUCKETS)
  ctx.globalAlpha = alpha
  ctx.drawImage(glowSprite(hex, b), x - r, y - r, 2 * r, 2 * r)
}

// Radius-aware cull: the glow's bounding square [x - r, x + r] x [y - r, y + r] meets the View's padded rect (edges included, like inView).
// ponytail: square, not circle, so a glow just past a rect corner may still draw; harmless (additive, off-screen) and cheaper.
const glowInView = (v: View, x: number, y: number, r: number): boolean => x + r >= v.x0 && x - r <= v.x1 && y + r >= v.y0 && y - r <= v.y1

const tileCenter = (i: number, w: number): [number, number] => [(i % w + 0.5) * TILE, (Math.floor(i / w) + 0.5) * TILE]

// Pass 17. Sets 'lighter' and leaves it (the orchestrator resets to source-over); resets globalAlpha to 1.
// `tipOf` defaults to torchTip(s) from entities.ts (tests may inject another); core flame, flare, ember, Beacon and shaft are drawn at every quality.
export function drawGlow(ctx: CanvasRenderingContext2D, s: State, v: View, q: Quality, tipOf: TipFn = torchTip): void {
  const p = s.player
  const t = s.meta.time
  const escape = s.meta.phase === 'escape'
  const e = clamp(p.energy / p.energyMax, 0, 1)
  const R = flameRadius(s)
  const rf = s.settings.reducedFlash ? REDUCED_FLASH : 1
  ctx.globalCompositeOperation = 'lighter'

  if (q.glow) {
    for (const k of s.pickups) {
      if (glowInView(v, k.x, k.y, T.pickup.radiusPx)) drawGlowSprite(ctx, k.kind === 'resin' ? RESIN : PLANT, k.x, k.y, T.pickup.radiusPx,
        0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.5 * 2 * Math.PI)))
    }
    if (!escape) {
      for (const vein of s.veins) {
        const [x, y] = tileCenter(vein.tile, s.world.w)
        const drawY = y - (vein.stand === vein.tile + s.world.w ? 8 : FACE_H)
        if (Math.hypot(x - p.x, y - p.y) <= R + VEIN_PAD && glowInView(v, x, drawY, VEIN_R)) drawGlowSprite(ctx, CRYSTAL[vein.mineral], x, drawY, VEIN_R, 0.3)
      }
    }
  }

  // Entrance shaft with a few rising dust motes.
  const en = s.world.entrance
  const ex = (en.tx + 0.5) * TILE, ey = (en.ty + 0.5) * TILE
  if (glowInView(v, ex, ey, SHAFT_R)) {
    drawGlowSprite(ctx, SHAFT_COL, ex, ey, SHAFT_R, 0.25)
    for (let i = 0; i < MOTES; i++) {
      const a = hash2(i, 0, MOTE_SALT) * 2 * Math.PI, d = 6 + hash2(i, 1, MOTE_SALT) * 30
      const rise = (t * 6 + hash2(i, 2, MOTE_SALT) * 40) % 40
      drawGlowSprite(ctx, SHAFT_COL, ex + Math.cos(a) * d + 2 * vnoise(t * 0.5 + i, MOTE_SALT), ey + 20 - rise, 2, 0.35)
    }
  }

  // Beacon fire: brighter while held, full and steady once lit. beaconFlash adds a short white burst (rf for reducedFlash).
  const bc = s.world.beacon
  const bx = (bc.tx + 0.5) * TILE, by = (bc.ty + 0.5) * TILE
  const hold = clamp(p.beaconHold / T.beacon.holdS, 0, 1)
  const fireA = s.world.beaconLit ? 0.8 : 0.4 + 0.3 * hold
  const fireR = s.world.beaconLit ? 64 : 40
  if (glowInView(v, bx, by, fireR)) { // the 16 px core lies inside the fire glow
    drawGlowSprite(ctx, BEACON_COL, bx, by, fireR, fireA)
    drawGlowSprite(ctx, BEACON_CORE, bx, by, 16, fireA)
  }
  const bf = clamp(s.fx.beaconFlash / T.beacon.flashS, 0, 1)
  const flashR = 64 + 96 * bf
  if (bf > 0 && glowInView(v, bx, by, flashR)) drawGlowSprite(ctx, BEACON_CORE, bx, by, flashR, 0.8 * bf * rf)

  if (!escape && p.energy > 0) {
    const tip = tipOf(s)
    const tx = tip.x + 0.8 * vnoise(t * 7, 11), ty = tip.y + 0.8 * vnoise(t * 7, 13)
    {
      const col = FLAME_COL[p.activeMineral]
      const f = 0.8 + 0.4 * e
      if (q.glow) drawGlowSprite(ctx, col.mantle, p.x, p.y, 0.9 * R, 0.1 + 0.08 * e)
      drawGlowSprite(ctx, col.mantle, tx, ty, 14 * f, 0.55)
      if (q.glow) drawGlowSprite(ctx, col.fringe, tx, ty - 2, 20 * f, 0.35)
      drawGlowSprite(ctx, col.core, tx, ty, 6 * f, 0.9)
      if (q.glow) drawGlowSprite(ctx, col.core, tx, ty - 4 - 3 * vnoise(t * 9, 17), 5, 0.6)
    }
    const sw = p.swing
    if (sw.active) {
      const half = T.swing.arcDeg * Math.PI / 360
      ctx.beginPath()
      ctx.arc(p.x, p.y - PLAYER_FOOT, SPARK_ARC_R, sw.dir - half, sw.dir + half)
      ctx.lineWidth = SPARK_ARC_W
      ctx.strokeStyle = FLAME_COL[p.activeMineral].mantle
      ctx.globalAlpha = clamp(1 - sw.t / T.swing.activeS, 0, 1)
      ctx.stroke()
    }
  }

  // Perfect-parry flare: grows with R, fades with fx.flare.
  const fl = clamp(s.fx.flare / T.parry.flareS, 0, 1)
  if (fl > 0) drawGlowSprite(ctx, FLARE_COL, p.x, p.y, R * (1 + 0.6 * fl), 0.7 * fl * rf)
  ctx.globalAlpha = 1
}

// Pass 16. Eyes of shades outside the light: additive halo plus the eyes sprite, same direction and scale as the body.
// Sets 'lighter' and leaves it (like drawGlow; the orchestrator resets), resets globalAlpha; drawn at every quality (eyes are never dropped).
// ponytail: the halo sits on the monster centre; the spec's per-kind, per-direction authored eye centres (render-2 §3.2) arrive
// with the art. Upgrade: add (ex, ey) = centre * MON_SCALE to the halo position once the delivered eye anchors exist.
export function drawEyes(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  ctx.globalCompositeOperation = 'lighter'
  for (const m of s.monsters) {
    if (!entityInView(v, m.x, m.y) || !eyeVisible(s, m)) continue
    const a = eyeAlpha(s, m)
    if (a <= 0) continue // dying eyes are fully faded
    const [act, f] = eyeFrame(s, m), y = m.y - MON_FOOT[m.kind]
    drawGlowSprite(ctx, eyeAnim(m) === 'telegraph' ? EYE_TELEGRAPH : EYE_IDLE, m.x, y, EYE_HALO_R[m.kind], a)
    drawFrame(ctx, EYES_ID[m.kind], act + '-' + monsterDirection(s, m), f, m.x, y, MON_SCALE[m.kind], a)
  }
  ctx.globalAlpha = 1
}
