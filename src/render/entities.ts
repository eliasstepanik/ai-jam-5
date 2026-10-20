// L4 render: monsters FULL (pass 10), eight-direction player body (pass 11), torch tip and the frame/angle/eye helpers glow.ts
// needs for pass 16. Spec: docs/architecture-render-2.md §3.2-3.3 and §2.3 (48 px entity margin), architecture-monsters-ai-2.md §6
// (eye visibility), architecture-assets-sprites.md §5 (eye fade), architecture-assets-pipeline.md §6 (actor fallback chain),
// R-154 (player art), R-155 (monster art).
// Actor art is never rotated or mirrored: the direction suffix of the animation key picks one of eight authored rows.
// Reads State and the image registry only (res.images); writes only registry caches (tints). No rng, no random calls.
import type { Monster, MonsterKind, State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { clamp } from '../core/math.ts'
import { hash2 } from '../core/noise.ts'
import { lightRadius } from '../systems/light.ts'
import { lineOfSightPx } from '../world/los.ts'
import { getResources } from '../assets/resources.ts'
import { SPRITES } from '../assets/sprites.ts'
import type { ActorId, Anim, Direction } from '../assets/sprites.ts'
import type { View } from './view.ts'
import { ctx2d, newCanvas } from './light.ts'

const MON_ID: Record<MonsterKind, ActorId> = { lurker: 'mon_lurker', stalker: 'mon_stalker', devourer: 'mon_devourer' }
export const EYES_ID: Record<MonsterKind, ActorId> = { lurker: 'mon_lurker_eyes', stalker: 'mon_stalker_eyes', devourer: 'mon_devourer_eyes' }
export const MON_SCALE: Record<MonsterKind, number> = { lurker: 0.5, stalker: 0.75, devourer: 1.5 } // R-155, body and eyes
const PLAYER_SCALE = 0.5 // R-154: 64x64 source drawn at 32x32 world px
const PIVOT = 32 // source px of the 64x64 actor frame pivot (R-154/R-155)
const CULL_MARGIN = 48 // render-2 §2.3: half the devourer canvas, added to the View rect (which already holds one tile)
const WALK_MIN_SPEED = 10 // render-2 §3.3: walk anim above this speed (px/s)
const WALK_ESCAPE_FPS = 1.6 // render-2 §3.3: walk fps multiplier in the escape
const MON_MOVE_SPEED = 5 // render-2 §3.2: faces its velocity above this speed (px/s), else the player
const IDLE_PHASE = 0.37 // render-2 §3.2: idle loop offset per monster id
const BLINK_EVERY_S = 3, BLINK_OPEN_S = 0.25, BLINK_CHANCE = 0.25, BLINK_SALT = 7 // render-2 §3.2 (stateless blink)
const DEATH_FADE_FRAMES = 3 // assets-sprites §5: eyes fade out over the first 3 death frames
const EYE_IDLE_A = 0.55 // render-3 §1 eye halo alpha (idle), telegraph is 1
const TINT_CAP = 64 // render-3 §5: res.images.tints is an LRU of at most 64 entries
const HIT_TINT = '#ffffff'
const DIRS: readonly Direction[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] // clockwise on screen (y down)

// Nearest of the eight directions to `a` (any radians). Math.round resolves halfway ties toward +infinity, which is clockwise on
// screen (R-155); TIE_EPS makes the tie hold for boundary angles that float division lands a hair below .5 (k*22.5 deg, any wrap).
// core/noise quantAngle (16 steps) is for non-actor sprites only.
const TIE_EPS = 1e-9
const directionOf = (a: number): Direction => DIRS[((Math.round(a / (Math.PI / 4) + TIE_EPS) % 8) + 8) % 8]

const loopFrame = (a: Anim, t: number, phase = 0, mul = 1): number => Math.floor(t * a.fps * mul + phase) % a.n
const onceFrame = (a: Anim, elapsed: number): number => clamp(Math.floor(elapsed * a.fps), 0, a.n - 1)

// Cull on [x0 - 48, x1 + 48] x [y0 - 48, y1 + 48]; view.ts inView has no entity margin and is left as is.
export const entityInView = (v: View, x: number, y: number): boolean =>
  x >= v.x0 - CULL_MARGIN && x <= v.x1 + CULL_MARGIN && y >= v.y0 - CULL_MARGIN && y <= v.y1 + CULL_MARGIN

// --- registry draw path (stand-in for assets/images.ts drawSprite, which is A10 and not on this branch) ---
// res.images.rects holds the resolved atlas rects 'id|anim|frame' -> [sheet, x, y, w, h] (resources.ts); images.ts fills it.
type Hit = { key: string; frame: number; rect: readonly number[] | null; sheet: HTMLImageElement | null }

// Fallback chain (pipeline §6): requested frame, previous frames of the same action/direction, same-id idle-<dir> frame 0, and for
// the player also idle-e frame 0 of the same set. Nothing found: rect is null and the caller draws nothing (stand-in art is A9).
function resolve(id: ActorId, key: string, frame: number): Hit {
  const im = getResources().images
  const find = (k: string, f: number): Hit | null => {
    const r = im.rects.get(id + '|' + k + '|' + f), sheet = r ? im.sheets[r[0]] : null
    return r && sheet ? { key: k, frame: f, rect: r, sheet } : null
  }
  for (let f = frame; f >= 0; f--) {
    const h = find(key, f)
    if (h) return h
  }
  const dir = key.slice(key.lastIndexOf('-') + 1)
  return find('idle-' + dir, 0) ?? (id.startsWith('player_') ? find('idle-e', 0) : null) ?? { key, frame, rect: null, sheet: null }
}

function tinted(id: ActorId, h: Hit, r: readonly number[], sheet: HTMLImageElement, hex: string): HTMLCanvasElement {
  const tints = getResources().images.tints, k = id + '|' + h.key + '|' + h.frame + '|' + hex
  let c = tints.get(k)
  if (c) return c
  c = newCanvas(r[3], r[4])
  const g = ctx2d(c)
  g.drawImage(sheet, r[1], r[2], r[3], r[4], 0, 0, r[3], r[4])
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = hex
  g.fillRect(0, 0, r[3], r[4])
  tints.set(k, c)
  if (tints.size > TINT_CAP) { // ponytail: FIFO eviction, not true LRU; upgrade: re-insert on hit if flash tints thrash
    const [old, oc] = tints.entries().next().value as [string, HTMLCanvasElement]
    tints.delete(old)
    oc.width = oc.height = 0
  }
  return c
}

// One actor frame centred on world (x, y), rotation 0, `scale` applied to the 64x64 source. Position snaps to the device grid
// (render.md §4.3). `anim` is the full key '<action>-<direction>'. A frame that is not loaded draws nothing.
// ponytail: no procedural stand-in art here; the spec puts it in the A9 actors module behind drawSprite (A10).
// Upgrade: replace the body with drawSprite once images.ts exists, keep the signature for glow.ts.
export function drawFrame(ctx: CanvasRenderingContext2D, id: ActorId, anim: string, frame: number,
  x: number, y: number, scale: number, alpha: number, tint: string | null = null): void {
  const h = resolve(id, anim, frame), r = h.rect
  if (!r || !h.sheet) return
  const z = ctx.getTransform().a, sx = Math.round(x * z) / z, sy = Math.round(y * z) / z
  const src = tint ? tinted(id, h, r, h.sheet, tint) : h.sheet
  ctx.globalAlpha = alpha
  if (tint) ctx.drawImage(src, 0, 0, r[3], r[4], sx - PIVOT * scale, sy - PIVOT * scale, r[3] * scale, r[4] * scale)
  else ctx.drawImage(src, r[1], r[2], r[3], r[4], sx - PIVOT * scale, sy - PIVOT * scale, r[3] * scale, r[4] * scale)
  ctx.globalAlpha = 1
}

// --- monsters ---
// Direction input: windup, lunge and dying use lungeDir (dying keeps the value it had, so death holds its direction), otherwise
// the velocity heading above 5 px/s, else the bearing to the player. Never a sprite rotation.
export function monsterAngle(s: State, m: Monster): number {
  if (m.ai === 'windup' || m.ai === 'lunge' || m.ai === 'dying') return m.lungeDir
  return Math.hypot(m.vx, m.vy) > MON_MOVE_SPEED ? Math.atan2(m.vy, m.vx) : Math.atan2(s.player.y - m.y, s.player.x - m.x)
}
export const monsterDirection = (s: State, m: Monster): Direction => directionOf(monsterAngle(s, m))

// [action, frame] of the body sprite; the draw key is `${action}-${direction}`. Frame counts and fps come from the manifest
// (the east row stands for all eight, R-155: per-direction counts are equal).
export function monsterFrame(s: State, m: Monster): [string, number] {
  const a = (action: string): Anim => SPRITES[MON_ID[m.kind]].anims[action + '-e']
  switch (m.ai) {
    case 'windup': {
      const action = m.kind === 'devourer' ? (m.beat === 0 ? 'telegraph_a' : 'telegraph_b') : 'telegraph'
      // aiT counts from the start of the whole windup; each beat plays its own anim from frame 0 (R-130: beat is a 0-based
      // index). onceFrame clamps a negative elapsed (aiT before the beat start) to frame 0.
      const K = T.monsters[m.kind]
      return [action, onceFrame(a(action), m.aiT - m.beat * K.telegraphS / K.beats)]
    }
    case 'lunge': return ['lunge', onceFrame(a('lunge'), m.aiT)]
    case 'dying': return ['death', onceFrame(a('death'), m.aiT)]
    default: return ['idle', loopFrame(a('idle'), s.meta.time, m.id * IDLE_PHASE)]
  }
}

export const eyeAnim = (m: Monster): 'idle' | 'telegraph' => (m.ai === 'windup' || m.ai === 'lunge' ? 'telegraph' : 'idle')

// [action, frame] of the eyes sprite: telegraph frame 0 while attacking, else the 3-frame blink for 0.25 s of some 3 s windows.
export function eyeFrame(s: State, m: Monster): [string, number] {
  const act = eyeAnim(m), t = s.meta.time
  if (act === 'idle' && t % BLINK_EVERY_S < BLINK_OPEN_S && hash2(Math.floor(t / BLINK_EVERY_S), m.id, BLINK_SALT) < BLINK_CHANCE) {
    return ['blink', onceFrame(SPRITES[EYES_ID[m.kind]].anims['blink-e'], t % BLINK_EVERY_S)]
  }
  return [act, 0]
}

// Dying eyes fade out over the first 3 death frames (assets-sprites §5 shared eyes rules, 'engine alpha'): fadeS = 3 / fps of the
// same kind's death anim. Spec conflicts resolved: monsters-ai-2 §6 says dying + unseen = eyes fade, render-2 §3.2 pass 16 sketch
// skips dying (the fade wins; glow.ts draws it from eyeAlpha); neither gives a duration, assets-sprites §5 does. A seen dying
// shade fades its pass-10 eyes the same way. ponytail: reads the east row, per-direction fps are equal (R-155).
const dyingFade = (m: Monster): number => {
  const fps = SPRITES[MON_ID[m.kind]].anims['death-e'].fps
  return fps > 0 ? clamp(1 - m.aiT * fps / DEATH_FADE_FRAMES, 0, 1) : 0
}

// Pass 16 halo/sprite alpha: 0.55 idle, 1 telegraph; a dying shade multiplies in dyingFade (assets-sprites §5).
export function eyeAlpha(_s: State, m: Monster): number {
  if (m.ai === 'dying') return EYE_IDLE_A * dyingFade(m)
  return eyeAnim(m) === 'telegraph' ? 1 : EYE_IDLE_A
}

// Body shown in pass 10: escape (cave lit) or m.seen, the stored mirror of the update-side insideLight test (monsters.ts).
const lit = (s: State, m: Monster): boolean => s.meta.phase === 'escape' || m.seen

// Pass 16 predicate (monsters-ai-2 §6): only unseen shades. Windup/lunge need only tile LOS (a telegraph is never invisible),
// everything else (idle, dying fade) needs LOS and d <= R + eyeRangeExtraPx. Remembered tiles add nothing: no LOS or range = hidden.
export function eyeVisible(s: State, m: Monster): boolean {
  if (lit(s, m)) return false
  const p = s.player
  if (m.ai !== 'windup' && m.ai !== 'lunge' && Math.hypot(m.x - p.x, m.y - p.y) > lightRadius(s) + T.ai.eyeRangeExtraPx) return false
  return lineOfSightPx(s, p.x, p.y, m.x, m.y)
}

// Pass 10, normal blend under the darkness. Array order (render-2 §3.2 draws `for m of s.monsters`, no y-sort).
export function drawMonsters(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  for (const m of s.monsters) {
    if (!entityInView(v, m.x, m.y) || !lit(s, m)) continue
    const dir = monsterDirection(s, m), sc = MON_SCALE[m.kind], [act, f] = monsterFrame(s, m), [ea, ef] = eyeFrame(s, m)
    drawFrame(ctx, MON_ID[m.kind], act + '-' + dir, f, m.x, m.y, sc, 1)
    drawFrame(ctx, EYES_ID[m.kind], ea + '-' + dir, ef, m.x, m.y, sc, m.ai === 'dying' ? dyingFade(m) : 1)
  }
}

// --- player ---
// Set, direction, action and frame of the player body (render-2 §3.3). Priority death > roll > hurt > swing > walk > idle.
// Direction: nearest to facing, or the velocity heading while moving in the escape; retained facing otherwise (State keeps it).
function playerPose(s: State): { id: ActorId; key: string; frame: number } {
  const p = s.player, esc = s.meta.phase === 'escape', time = s.meta.time, speed = Math.hypot(p.vx, p.vy)
  const id: ActorId = esc ? 'player_body' : 'player_body-torch'
  const dir = directionOf(esc && speed > WALK_MIN_SPEED ? Math.atan2(p.vy, p.vx) : p.facing)
  const a = (action: string): Anim => SPRITES[id].anims[action + '-' + dir]
  const at = (action: string, frame: number) => ({ id, key: action + '-' + dir, frame })
  if (s.meta.screen === 'dead') return at('death', onceFrame(a('death'), time - (s.result ? s.result.endAt : time)))
  if (p.roll.t > 0) return at('roll', onceFrame(a('roll'), T.roll.durationS - p.roll.t))
  if (p.hitFlash > 0) return at('hurt', onceFrame(a('hurt'), T.hurt.flashS - p.hitFlash))
  if (p.swing.active) return at('swing', onceFrame(a('swing'), p.swing.t))
  if (speed > WALK_MIN_SPEED) return at('walk', loopFrame(a('walk'), time, 0, esc ? WALK_ESCAPE_FPS : 1))
  return at('idle', loopFrame(a('idle'), time))
}

// Pass 11. Hit flash: a second draw of the same frame, white-tinted, alpha hitFlash / flashS.
export function drawPlayer(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const p = s.player
  if (!entityInView(v, p.x, p.y)) return
  const { id, key, frame } = playerPose(s)
  drawFrame(ctx, id, key, frame, p.x, p.y, PLAYER_SCALE, 1)
  if (p.hitFlash > 0) drawFrame(ctx, id, key, frame, p.x, p.y, PLAYER_SCALE, clamp(p.hitFlash / T.hurt.flashS, 0, 1), HIT_TINT)
}

// World position of the torch tip: player + (tip - [32, 32]) * 0.5, with the tip anchor of the frame that is actually drawn
// (fallback frames use their own anchor). Escape uses the no-torch set, which has no tip: the player centre is returned and
// drawGlow skips the torch effect there. Anchors come from the manifest (SPRITES torchTips); measured per-frame tips
// (sheetAnimations) have no registry slot yet.
export function torchTip(s: State): { x: number; y: number } {
  const p = s.player, { id, key, frame } = playerPose(s)
  if (id !== 'player_body-torch') return { x: p.x, y: p.y }
  const h = resolve(id, key, frame), tips = SPRITES['player_body-torch'].anims[h.key].torchTips
  const tip = tips ? tips[Math.min(h.frame, tips.length - 1)] : [PIVOT, PIVOT]
  return { x: p.x + (tip[0] - PIVOT) * PLAYER_SCALE, y: p.y + (tip[1] - PIVOT) * PLAYER_SCALE }
}
