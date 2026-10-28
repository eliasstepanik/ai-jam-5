// L4 render: frame orchestrator (A17). Spec: docs/architecture-render.md §3 (passes 0-23, sketch), architecture-modules-render.md
// (index.ts row, seam S1), R-094 (drawScreen in ui/menus.ts), R-095 (this module calls startPreload), R-096 (drawDebug is game.ts's).
// Pure with respect to State: reads s only. Mutable data lives in getResources(); this module keeps no state and no module-level effects.
// No Math.random, Date.now or performance.now here: clocks sit in quality.ts, cosmetic noise in the passes.
import type { State } from '../core/types.ts'
import { getResources } from '../assets/resources.ts'
import { startPreload } from '../assets/images.ts'
import { drawHud } from '../ui/hud.ts'
import { drawScreen } from '../ui/menus.ts'
import { actorRows, drawRowEntities } from './entities.ts'
import { drawEyes, drawGlow } from './glow.ts'
import { drawStrikeLines } from './telegraph.ts'
import { drawDarkness } from './light.ts'
import { memoryCanvas } from './memory.ts'
import { drawPuddles } from './puddles.ts'
import { drawDescentFx } from './descent-fx.ts'
import { drawVineGlow } from './vine-glow.ts'
import { drawDraft } from './draft.ts'
import { drawFallbackDressing } from './dressing.ts'
import { drawQuakeScars } from './cave-details.ts'
import { drawMist } from './mist.ts'
import { drawPixelFire } from './pixel-fire.ts'
import { vineSites } from './vine-sites.ts'
import { drawEscapeWisp } from './wisp.ts'
import { drawCopperTrail } from './copper-trail.ts'
import { drawOreEmission } from './ore-emission.ts'
import { drawZonePalette } from './zone-palette.ts'
import { drawBeaconMode, drawFlashes, drawVignettes } from './overlay.ts'
import { consumeEvents, drawParticles } from './particles.ts'
import { drawRocks } from './props.ts'
import { currentQuality, frameBegin, passMark, qualityTick } from './quality.ts'
import { drawFloor, drawWallRow } from './tiles.ts'
import { makeView, screenXf, worldXf } from './view.ts'

// Draws one frame in CSS-pixel size w x h (host contract: main.ts has set setTransform(dpr,...) and wrapped the call in save/restore).
// Re-exported by game.ts (A30), which calls drawDebug after it returns (R-096).
export function render(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const res = getResources()
  startPreload(res) // R-095: idempotent, begins loading sheets and screen art on the first frame
  frameBegin() // pass 0
  const sc = s.meta.screen
  // Pass 1: title and help draw their own backdrop. An empty world (title, generation pending) has nothing for the world passes.
  if (sc === 'title' || sc === 'help' || s.world.tiles === '') {
    drawScreen(ctx, s, w, h)
    return
  }
  consumeEvents(s) // pass 2: spawn cosmetic particles from new fx events (cursor lives in the render registry)
  const q = currentQuality(s)
  const v = makeView(ctx, s, w, h) // pass 4; reads the dpr from the host transform, so it runs before the clear resets it
  ctx.setTransform(1, 0, 0, 1, 0, 0) // pass 3
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, v.cw, v.ch)
  passMark('clear')
  worldXf(ctx, v)
  ctx.imageSmoothingEnabled = false
  passMark('view')
  drawFloor(ctx, s, v, q) // pass 5a. Pass 6 (decor) is closed: ground overlays are part of the floor chunks (G6).
  drawPuddles(ctx, s, v)
  drawFallbackDressing(ctx, s, v)
  drawQuakeScars(ctx, s, v)
  passMark('tiles')
  drawStrikeLines(ctx, s, v) // pass 6b: windup ground line under the actors
  actorRows(s, v) // buckets monsters, player, pickups, landmarks, landed rocks and non-south veins by foot row (R-180)
  for (let ty = v.ty0; ty <= v.ty1; ty++) { // pass 5b with 7-11: one wall row, then the actors whose foot row is ty
    drawWallRow(ctx, s, v, ty)
    drawRowEntities(ctx, s, v, ty)
  }
  drawRocks(ctx, s, v) // pass 12: telegraph shadows and falling boulders above every row; landed rocks sit in the buckets
  drawParticles(ctx, s, v, 'normal') // pass 13: dust and grit under the darkness
  drawDescentFx(ctx, s, v) // pass 13b: depth motes and falling pebbles, under the darkness (saves and restores its own state)
  drawZonePalette(ctx, s, v)
  passMark('ents')
  // Pass 14. memoryCanvas runs once per frame, before the darkness, and hands over the up-to-date explored-tile canvas (C4).
  // drawDarkness leaves identity transform, source-over, alpha 1 and smoothing off on every path.
  drawDarkness(ctx, s, v, q, memoryCanvas(s), vineSites(s, v))
  drawBeaconMode(ctx, s, v) // pass 15: warm multiply once the Beacon is lit; sets its own identity transform and resets composite and alpha
  passMark('dark')
  worldXf(ctx, v)
  drawMist(ctx, s, v) // Shadow pixels stay visible over explored memory outside torch range.
  ctx.globalCompositeOperation = 'lighter' // 16-17: additive only, never reveals bodies the darkness hid
  drawOreEmission(ctx, s, v)
  drawVineGlow(ctx, s, v, q) // pass 16b: vine halos and cores (own save/restore)
  drawDraft(ctx, s, v, q) // pass 16c: guide motes and warm bleed toward the Beacon (own save/restore)
  drawEyes(ctx, s, v)
  drawGlow(ctx, s, v, q)
  drawParticles(ctx, s, v, 'add') // pass 18: sparks above the darkness
  drawPixelFire(ctx, s, v)
  drawEscapeWisp(ctx, s, v)
  drawCopperTrail(ctx, s, v)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  passMark('glow')
  drawFlashes(ctx, s, v, q) // pass 19: white-out, damage flash, flare wash, then the vignettes (device px, identity transform)
  drawVignettes(ctx, s, v, q)
  passMark('ovl')
  // Pass 20/21: screen space in CSS px; composite and alpha are clean, so the HUD and panels start from defaults.
  screenXf(ctx, v)
  if (sc === 'playing') drawHud(ctx, s, w, h)
  else drawScreen(ctx, s, w, h) // paused, dead, won: panel over the frozen world
  passMark('hud')
  qualityTick(s) // pass 23
}
