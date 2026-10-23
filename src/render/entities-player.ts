// L4 render: player body from the character atlas (pass 11), torch tip, hit flash and the atlas frame-timing helpers shared with
// entities.ts. Spec: docs/architecture-render-2.md §3.3, R-180 (foot offset 24), R-184 (64x64, pivot 32,32, scale 1.0, never
// rotated or mirrored), R-185 (flame palette swap). Reads State and the image registry only; writes registry caches (swapped, tints).
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { clamp } from '../core/math.ts'
import { WALK_MIN_SPEED, gaitFrame, gaitRuns, gaitSetOf } from '../core/gait.ts'
import { dirIndex } from '../core/grid.ts'
import type { Dir8 } from '../core/grid.ts'
import { getResources } from '../assets/resources.ts'
import type { Resources } from '../assets/resources.ts'
import { animLen, animLoop, charFrame, drawAtlas, flameAnchor, swappedFrame } from './charatlas.ts'
import type { AtlasFrame, FlameMaterial } from './charatlas.ts'
import { ctx2d, newCanvas } from './light.ts'

export const PLAYER_FOOT = 24 // authored sole offset below the atlas pivot; State position is the ground contact
const PIVOT = 32 // source px of the 64x64 frame pivot (R-184)
const FRAME_PX = 64
const TINT_CAP = 64 // render-3 §5: res.images.tints is capped at 64 entries
const HIT_TINT = '#ffffff'
// DEFAULT: the characters sheet index of charatlas.ts (SHEET, private there); the flash only builds once that sheet is decoded.
const CHAR_SHEET = 1
const DIRS: readonly Dir8[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] // clockwise on screen (y down)

// Nearest of the eight directions to `a` (any radians). Math.round resolves halfway ties toward +infinity, which is clockwise on
// screen (R-155); TIE_EPS keeps the tie for boundary angles that float division lands a hair below .5.
const TIE_EPS = 1e-9
export const directionOf = (a: number): Dir8 => DIRS[((Math.round(a / (Math.PI / 4) + TIE_EPS) % 8) + 8) % 8]

// Device-pixel snap of a world coordinate (render.md §4.3); z is View.z.
export const snap = (v: number, z: number): number => Math.round(v * z) / z

// Total length of an animation in ms, summed from the per-frame duration_ms of the first direction (equal in all eight).
export function animMs(character: string, animation: string): number {
  let total = 0
  for (let i = 0, n = animLen(character, animation); i < n; i++) total += charFrame(character, animation, 0, i).dur
  return total
}

// Frame index after `ms` of playback using each frame's own duration: loops wrap, one-shots hold the last frame.
export function frameAt(character: string, animation: string, ms: number): number {
  const n = animLen(character, animation), total = animMs(character, animation)
  if (n === 0 || total <= 0) return 0
  let t = animLoop(character, animation) ? ((ms % total) + total) % total : clamp(ms, 0, total)
  for (let i = 0; i < n; i++) {
    t -= charFrame(character, animation, 0, i).dur
    if (t < 0) return i
  }
  return n - 1
}

// Frame index when `frac` (0..1) of a one-shot has elapsed: the animation is stretched to the gameplay duration of its state.
export const fitFrame = (character: string, animation: string, frac: number): number =>
  frameAt(character, animation, clamp(frac, 0, 1) * animMs(character, animation))

type TorchSet = { idle: string; hurt: string; death: string; walk: string; run: string; swing: string | null; mine: string | null }
const SETS: Record<'escape' | 'lit' | 'unlit', TorchSet> = {
  escape: { idle: 'idle_no_torch', hurt: 'hurt_no_torch', death: 'death_without_torch', walk: 'run_without_torch', run: 'run_without_torch', swing: null, mine: null },
  lit: { idle: 'idle_lit_torch_base', hurt: 'hurt_lit_torch_base', death: 'death_with_unlit_torch', walk: 'walk_lit_torch_base', run: 'run_lit_torch_base',
    swing: 'swing_lit_torch_base', mine: 'material_change_lit_torch_base' },
  // BUG-003: derive an unlit walk from the delivered lit walk, removing only reserved flame pixels at draw time.
  unlit: { idle: 'idle_unlit_torch', hurt: 'hurt_unlit_torch', death: 'death_with_unlit_torch', walk: 'walk_unlit_torch', run: 'walk_unlit_torch',
    swing: null, mine: null },
}

// Frame of a walk / run clip at the integrated gait phase (core/gait.ts), laid over the clip's own frame durations.
const gaitClipFrame = (anim: string, phase: number): number =>
  gaitFrame(phase, Array.from({ length: animLen('player', anim) }, (_, i) => charFrame('player', anim, 0, i).dur))

// Animation, frame index and atlas direction of the player body. Priority death > roll > hurt > swing > mining > walk > idle.
// DEFAULT: swing and mining have art for the lit torch only; in the escape or with an unlit torch they fall through to walk/idle.
// DEFAULT: death uses the retained facing (State keeps no start-of-death velocity), so the direction holds from the first frame.
export function playerPose(s: State): { anim: string; frame: number; dir: number } {
  const p = s.player, esc = s.meta.phase === 'escape', ms = s.meta.time * 1000, speed = Math.hypot(p.vx, p.vy)
  const set = SETS[gaitSetOf(esc, p.energy)]
  const dir = dirIndex(directionOf(esc && speed > WALK_MIN_SPEED ? Math.atan2(p.vy, p.vx) : p.facing))
  const pose = (anim: string, frame: number) => ({ anim, frame, dir })
  if (s.meta.screen === 'dead') {
    return { anim: set.death, frame: frameAt('player', set.death, (s.meta.time - (s.result ? s.result.endAt : s.meta.time)) * 1000), dir: dirIndex(directionOf(p.facing)) }
  }
  if (p.roll.t > 0) return pose('dodge_roll_no_torch', fitFrame('player', 'dodge_roll_no_torch', 1 - p.roll.t / T.roll.durationS))
  if (p.hitFlash > 0) return pose(set.hurt, frameAt('player', set.hurt, (T.hurt.flashS - p.hitFlash) * 1000))
  if (p.swing.active && set.swing) return pose(set.swing, fitFrame('player', set.swing, p.swing.t / T.swing.activeS))
  if (p.mining.targetTile >= 0 && set.mine) return pose(set.mine, fitFrame('player', set.mine, p.mining.progress / T.mining.holdS))
  if (speed > WALK_MIN_SPEED) {
    const anim = gaitRuns(speed) ? set.run : set.walk
    return pose(anim, gaitClipFrame(anim, p.gaitPhase))
  }
  return pose(set.idle, frameAt('player', set.idle, ms))
}

const playerFrame = (s: State): AtlasFrame => {
  const { anim, frame, dir } = playerPose(s)
  return charFrame('player', anim, dir, frame)
}

// Flame colour of the active mineral; plain orange (activeMineral 'none') is the sheet's own 'base' palette.
const flameMaterial = (s: State): FlameMaterial => s.player.energy <= 0 ? 'unlit' : s.player.activeMineral === 'none' ? 'base' : s.player.activeMineral

// White silhouette of the drawn frame, cached in res.images.tints under 'atlas|x|y|material' (FIFO, TINT_CAP entries).
// ponytail: FIFO eviction, not true LRU; upgrade: re-insert on hit if flash tints thrash.
function flashCanvas(res: Resources, f: AtlasFrame, mat: FlameMaterial): HTMLCanvasElement {
  const tints = res.images.tints, key = 'atlas|' + f.x + '|' + f.y + '|' + mat
  let c = tints.get(key)
  if (c) return c
  c = newCanvas(FRAME_PX, FRAME_PX)
  const g = ctx2d(c)
  g.drawImage(swappedFrame(res, f, mat), 0, 0)
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = HIT_TINT
  g.fillRect(0, 0, FRAME_PX, FRAME_PX)
  tints.set(key, c)
  if (tints.size > TINT_CAP) {
    const [old, oc] = tints.entries().next().value as [string, HTMLCanvasElement]
    tints.delete(old)
    oc.width = oc.height = 0
  }
  return c
}

// Pass 11 body. Lit torch frames with a flame are drawn palette-swapped (R-185). Hit flash: a second draw of the same frame,
// white-tinted, alpha hitFlash / flashS (render-2 §3.3).
export function drawPlayerBody(ctx: CanvasRenderingContext2D, s: State, z: number): void {
  const p = s.player, f = playerFrame(s), x = snap(p.x, z) - PIVOT, y = snap(p.y - PLAYER_FOOT, z) - PIVOT
  const res = getResources(), mat = f.flame ? flameMaterial(s) : 'base'
  if (mat === 'base') drawAtlas(ctx, f, x, y)
  else ctx.drawImage(swappedFrame(res, f, mat), x, y)
  if (p.hitFlash > 0 && res.images.sheetState[CHAR_SHEET] === 'ok') {
    ctx.globalAlpha = clamp(p.hitFlash / T.hurt.flashS, 0, 1)
    ctx.drawImage(flashCanvas(res, f, mat), x, y)
    ctx.globalAlpha = 1
  }
}

// World torch tip: ground position minus the sole offset, plus the atlas flame anchor relative to its pivot. Frames without an anchor use
// charatlas' (-12, -11) fallback. The escape has no torch: the player centre is returned and drawGlow skips the effect there.
export function torchTip(s: State): { x: number; y: number } {
  const p = s.player
  if (s.meta.phase === 'escape') return { x: p.x, y: p.y }
  const a = flameAnchor(playerFrame(s))
  return { x: p.x + a[0] - PIVOT, y: p.y - PLAYER_FOOT + a[1] - PIVOT }
}
