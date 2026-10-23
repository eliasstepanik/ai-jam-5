// L0 player gait (issue #79): which walk / run clip plays, its stride, the integrated cycle phase and the frame picked from it.
// Pure and DOM-free so src/checks can assert it (R-043: checks import L0-L3 only). The phase lives in State (player.gaitPhase, cycles
// 0..1) and is advanced once per sim tick by systems/movement.ts; render/entities-player.ts only maps phase to a frame.
import { T } from './tuning.ts'
import { clamp } from './math.ts'

// Ground covered by one full cycle of the 4-frame player walk / run clips (two steps), in px. Tuned by eye against the east-facing
// frames of characters.png, not measured: matching speed / stride makes the feet advance with the ground; change these two numbers if
// the art changes or the feet look too fast or slow.
// ponytail: one stride per clip, so a clip is exact only at its authored speed band; upgrade: per-frame stride table if it still skates.
export const WALK_STRIDE_PX = 44
export const RUN_STRIDE_PX = 52
export const GAIT_MIN_HZ = 0.5 // cycles/s floor: slow wall-sliding keeps visibly moving instead of freezing
export const GAIT_MAX_HZ = 8 // cycles/s ceiling (32 frames/s): fast noclip stays readable instead of aliasing at 60 fps

// Playback rate in clip cycles per second for a player moving at `speed` px/s with a clip whose cycle covers `stridePx`.
export const gaitHz = (speed: number, stridePx: number): number => clamp(speed / stridePx, GAIT_MIN_HZ, GAIT_MAX_HZ)

export type GaitSet = 'escape' | 'lit' | 'unlit'

export const WALK_MIN_SPEED = 10 // render-2 §3.3: walk clip above this speed (px/s); at or below it the idle clip plays
export const RUN_MIN_SPEED = T.player.walkPxS + 1 // ordinary descent walking must not select the sprint clip

// Same choice the renderer uses for the clip tables: escape = flame-free run, lit torch = walk/run, flame out = unlit walk.
export const gaitSetOf = (escape: boolean, energy: number): GaitSet => (escape ? 'escape' : energy > 0 ? 'lit' : 'unlit')

// True when the run clip plays at `speed` (above RUN_MIN_SPEED), false for the walk clip.
export const gaitRuns = (speed: number): boolean => speed > RUN_MIN_SPEED

// Stride (px per clip cycle) of the clip that plays: the escape table uses the run clip for walk and run, the unlit table the
// walk clip for both, the lit table switches at RUN_MIN_SPEED.
export const gaitStride = (set: GaitSet, speed: number): number =>
  set === 'escape' ? RUN_STRIDE_PX : set === 'unlit' ? WALK_STRIDE_PX : gaitRuns(speed) ? RUN_STRIDE_PX : WALK_STRIDE_PX

// Next phase (cycles, kept in [0,1) so floats never grow) after one tick of `dt` s at `speed` px/s. Idle holds the phase.
// ponytail: walk <-> run switches keep the phase but change clip, so the frame can step once at the switch (a clip switch inevitably
// does); sync the two clips' foot contacts if it shows.
export const gaitAdvance = (phase: number, speed: number, set: GaitSet, dt: number): number =>
  speed > WALK_MIN_SPEED ? (phase + gaitHz(speed, gaitStride(set, speed)) * dt) % 1 : phase

// Frame index at `phase` (cycles) of a clip whose frames last `durs` ms each: the cycle is laid out over the frames' own durations.
export function gaitFrame(phase: number, durs: readonly number[]): number {
  const total = durs.reduce((a, d) => a + d, 0)
  if (durs.length === 0 || total <= 0) return 0
  let t = (((phase % 1) + 1) % 1) * total
  for (let i = 0; i < durs.length; i++) {
    t -= durs[i]
    if (t < 0) return i
  }
  return durs.length - 1
}
