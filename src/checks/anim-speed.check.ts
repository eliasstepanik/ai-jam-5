// Walk / run clip playback follows the real movement speed (issue #79): gaitHz and the integrated phase in core/gait.ts,
// advanced by systems/movement.ts into player.gaitPhase. L0-L3 imports only (R-043); DOM-free. Expected values are literals: the tuned
// strides (walk 44 px, run 52 px per cycle) and the characters.json frame durations (walk 4 x 166.7, run 4 x 100 ms). The durations are
// copied here because render/charatlas.ts, the only reader of characters.json, is render code that checks must not import (R-043); the
// real clips are even, so no uneven-duration case comes from the data and gaitFrame is tested with literal uneven durations below.
import { GAIT_MAX_HZ, GAIT_MIN_HZ, RUN_MIN_SPEED, RUN_STRIDE_PX, WALK_MIN_SPEED, WALK_STRIDE_PX, gaitAdvance, gaitFrame, gaitHz, gaitRuns, gaitSetOf, gaitStride } from '../core/gait.ts'
import { init } from '../core/state.ts'
import type { State } from '../core/types.ts'
import { fnv1a } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { clearCaches } from '../world/caches.ts'
import { stepMovement } from '../systems/movement.ts'
import type { Intent } from '../systems/intent.ts'

const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: anim-speed: ' + msg) }
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9
const DT = 1 / 60
const WALK_DURS = [166.7, 166.6, 166.7, 166.7], RUN_DURS = [100, 100, 100, 100]
const back = (a: number, b: number): number => (b - a + 4) % 4 // forward frame steps from a to b on a 4-frame loop

function rate(): void {
  ok(WALK_STRIDE_PX === 44 && RUN_STRIDE_PX === 52, `stride constants 44 / 52, got ${WALK_STRIDE_PX} / ${RUN_STRIDE_PX}`)
  ok(GAIT_MIN_HZ === 0.5 && GAIT_MAX_HZ === 8, 'gait clamp 0.5..8 Hz')
  const walk = T.player.walkPxS, sprint = walk * T.escape.sprintMul
  ok(walk === 120 && sprint === 240, `tuned speeds 120 / 240, got ${walk} / ${sprint}`)
  ok(near(gaitHz(walk, 44), 120 / 44), `walk rate 120/44 Hz, got ${gaitHz(walk, 44)}`)
  ok(near(gaitHz(sprint, 52), 240 / 52), `run rate 240/52 Hz, got ${gaitHz(sprint, 52)}`)
  for (let v = 30; v <= 340; v += 5) { // no skating: ground per clip cycle equals the stride at every unclamped speed
    ok(near(v / gaitHz(v, WALK_STRIDE_PX), WALK_STRIDE_PX), `walk stride at ${v} px/s`)
    ok(near(v / gaitHz(v, RUN_STRIDE_PX), RUN_STRIDE_PX), `run stride at ${v} px/s`)
  }
  ok(near(gaitHz(60, 44) * 2, gaitHz(120, 44)) && near(gaitHz(240, 44), gaitHz(120, 44) * 2), 'rate scales linearly with speed')
  ok(gaitHz(walk, RUN_STRIDE_PX) < gaitHz(walk, WALK_STRIDE_PX), 'longer stride, lower rate')
  ok(gaitHz(0, 44) === 0.5 && gaitHz(1, 44) === 0.5 && gaitHz(10, 52) === 0.5, 'slow speeds clamp to the 0.5 Hz floor')
  ok(gaitHz(walk * 10, 44) === 8 && gaitHz(1e9, 52) === 8, 'fast noclip clamps to the 8 Hz ceiling')
}

function phase(): void {
  ok(WALK_MIN_SPEED === 10 && RUN_MIN_SPEED === 121, `thresholds 10 / 121, got ${WALK_MIN_SPEED} / ${RUN_MIN_SPEED}`)
  // stride choice: lit torch walks below the run threshold and runs above it; escape always uses the run clip; unlit the walk clip
  ok(gaitStride('lit', 120) === 44 && gaitStride('lit', 121) === 44 && gaitStride('lit', 122) === 52, 'lit stride switches 44 -> 52 above 121 px/s')
  ok(gaitStride('escape', 50) === 52 && gaitStride('escape', 240) === 52, 'escape stride is the run clip stride 52')
  ok(gaitStride('unlit', 50) === 44 && gaitStride('unlit', 240) === 44, 'unlit stride is the walk clip stride 44')
  ok(!gaitRuns(121) && gaitRuns(122), 'run clip only above 121 px/s')
  ok(gaitSetOf(true, 0) === 'escape' && gaitSetOf(false, 1) === 'lit' && gaitSetOf(false, 0) === 'unlit', 'torch set choice')
  // advance: speed / stride * dt cycles per tick
  ok(near(gaitAdvance(0, 100, 'lit', DT), 100 / 44 * DT), `walk tick 100/44*dt, got ${gaitAdvance(0, 100, 'lit', DT)}`)
  ok(near(gaitAdvance(0, 240, 'lit', DT), 240 / 52 * DT), `run tick 240/52*dt, got ${gaitAdvance(0, 240, 'lit', DT)}`)
  ok(near(gaitAdvance(0.25, 200, 'escape', DT), 0.25 + 200 / 52 * DT), 'escape tick uses the run stride and adds to the phase')
  ok(near(gaitAdvance(0, 100, 'unlit', DT), 100 / 44 * DT), 'unlit tick uses the walk stride')
  ok(near(gaitAdvance(0, 1000, 'lit', 1 / 16), 0.5), 'noclip speed is clamped at 8 Hz (8 * 1/16 = 0.5 cycle)')
  // idle: no advance at or below the walk threshold
  ok(gaitAdvance(0.4, 0, 'lit', DT) === 0.4 && gaitAdvance(0.4, 10, 'lit', DT) === 0.4, 'idle holds the phase')
  ok(gaitAdvance(0.4, 10.5, 'lit', DT) > 0.4, 'just above the walk threshold advances')
  // wrap + bounded + deterministic over a long run
  let a = 0, b = 0
  for (let i = 0; i < 400000; i++) {
    a = gaitAdvance(a, 100 + (i % 140), 'lit', DT); b = gaitAdvance(b, 100 + (i % 140), 'lit', DT)
    ok(a >= 0 && a < 1, `phase stays in [0,1), got ${a} at tick ${i}`)
  }
  ok(a === b, 'same input, same phase')
  // frame lookup over the real clip durations
  ok(gaitFrame(0, WALK_DURS) === 0 && gaitFrame(0.26, WALK_DURS) === 1 && gaitFrame(0.51, WALK_DURS) === 2 && gaitFrame(0.99, WALK_DURS) === 3, 'walk frames by phase')
  ok(gaitFrame(0.24, RUN_DURS) === 0 && gaitFrame(0.25, RUN_DURS) === 1 && gaitFrame(1.5, RUN_DURS) === 2 && gaitFrame(-0.1, RUN_DURS) === 3, 'run frames by phase, wrapped')
  ok(gaitFrame(0.5, []) === 0, 'empty clip gives frame 0')
  const UNEVEN = [300, 100, 100, 500] // total 1000 ms: frame boundaries at phase 0.3, 0.4, 0.5
  ok(gaitFrame(0.29, UNEVEN) === 0 && gaitFrame(0.31, UNEVEN) === 1 && gaitFrame(0.41, UNEVEN) === 2 && gaitFrame(0.51, UNEVEN) === 3 && gaitFrame(0.99, UNEVEN) === 3, 'uneven durations: frame by cumulative time')
}

// Defect A regression: the frame must move on by at most one step per tick while the speed ramps, whatever the run clock reads.
function continuity(): void {
  for (const [lo, hi, set, durs] of [[11, 120, 'lit', WALK_DURS], [122, 400, 'lit', RUN_DURS], [11, 400, 'escape', RUN_DURS]] as const) {
    for (const dir of [1, -1]) {
      let ph = 0.37, prev = gaitFrame(ph, durs)
      for (let i = 0; i <= 600; i++) {
        const v = dir > 0 ? lo + (hi - lo) * i / 600 : hi - (hi - lo) * i / 600
        ph = gaitAdvance(ph, v, set, DT)
        const f = gaitFrame(ph, durs)
        ok(back(prev, f) <= 1, `${set} ramp ${dir > 0 ? 'up' : 'down'}: frame ${prev} -> ${f} at ${v.toFixed(1)} px/s`)
        prev = f
      }
    }
  }
}

function room(): State {
  const s = init(), w = 40, h = 24
  const tiles = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.').join('')).join('')
  Object.assign(s.world, { w, h, tiles, tilesHash: fnv1a(tiles), explored: new Array(18).fill(0), entrance: { tx: 2, ty: 2 }, beacon: { tx: 6, ty: 6 }, beaconDist: 500 })
  s.meta.screen = 'playing'; s.meta.runId = 1; s.settings.loaded = true
  s.player.x = 100; s.player.y = 300
  clearCaches()
  return s
}

const intent = (mx: number, my = 0): Intent => ({ mx, my, moving: mx !== 0 || my !== 0, aimX: 0, aimY: 0, swing: false, roll: false, interact: false, interactEdge: false, toss: false, shake: false, select: null })

// The real movement function integrates the phase in State.
function stateLevel(): void {
  const s0 = init()
  ok(s0.player.gaitPhase === 0, `init() default gaitPhase 0, got ${s0.player.gaitPhase}`)
  const s = room(), p = s.player
  s.meta.time = 300 // late in a run: the old absolute-clock design scrambled the frame here
  for (let i = 0; i < 20; i++) stepMovement(s, intent(0), DT)
  ok(p.gaitPhase === 0 && p.vx === 0, `idle: gaitPhase stays 0, got ${p.gaitPhase}`)
  let moved = 0, prev = gaitFrame(p.gaitPhase, WALK_DURS), expect = 0
  for (let i = 0; i < 60; i++) { // 1 s from rest: accelerate to 120 px/s, walk clip all the way
    const before = p.gaitPhase
    stepMovement(s, intent(1), DT)
    const v = Math.hypot(p.vx, p.vy)
    if (v > WALK_MIN_SPEED) { expect = (before + gaitHz(v, 44) * DT) % 1; moved++ } else expect = before
    ok(near(p.gaitPhase, expect), `tick ${i}: gaitPhase ${p.gaitPhase} expected ${expect} at ${v} px/s`)
    const f = gaitFrame(p.gaitPhase, WALK_DURS)
    ok(back(prev, f) <= 1, `state ramp at t=300: frame ${prev} -> ${f} at tick ${i}`)
    prev = f
  }
  ok(moved > 40 && p.gaitPhase > 0 && p.gaitPhase < 1 && near(p.vx, 120), `phase advanced while moving (moved ${moved} ticks, phase ${p.gaitPhase}, vx ${p.vx})`)
  const held = p.gaitPhase
  p.vx = p.vy = 0
  for (let i = 0; i < 30; i++) stepMovement(s, intent(0), DT)
  ok(p.gaitPhase === held, `stopping holds the phase, ${held} -> ${p.gaitPhase}`)
  // determinism: the same inputs from the same state give the same phase, and gameplay values do not depend on it
  const run = (phase0: number): [number, number, number] => {
    const t = room(); t.player.gaitPhase = phase0
    for (let i = 0; i < 90; i++) stepMovement(t, intent(1), DT)
    return [t.player.gaitPhase, t.player.x, t.player.vx]
  }
  const r1 = run(0), r2 = run(0), r3 = run(0.9)
  ok(r1[0] === r2[0] && r1[1] === r2[1], 'same input, same gaitPhase and position')
  ok(r1[1] === r3[1] && r1[2] === r3[2], 'gaitPhase never feeds back into position or velocity')
  // noclip at 10x speed stays bounded and wraps
  s.debug.noclip = true; s.debug.speedMul = 10
  for (let i = 0; i < 100; i++) { stepMovement(s, intent(1), DT); ok(p.gaitPhase >= 0 && p.gaitPhase < 1, 'noclip phase stays in [0,1)') }
  ok(p.gaitPhase !== held, 'noclip movement advances the phase')
}

// Drive the real stepMovement `ticks` times; each tick the phase must advance by gaitHz(true speed, `stride`) * dt (idle holds it).
// Returns how many ticks moved, so a caller can prove the loop was not vacuous.
function drive(s: State, it: Intent, ticks: number, stride: number, what: string): number {
  const p = s.player
  let moved = 0
  for (let i = 0; i < ticks; i++) {
    const before = p.gaitPhase
    stepMovement(s, it, DT)
    const v = Math.hypot(p.vx, p.vy)
    const expect = v > WALK_MIN_SPEED ? (before + gaitHz(v, stride) * DT) % 1 : before
    if (v > WALK_MIN_SPEED) moved++
    ok(near(p.gaitPhase, expect), `${what}: tick ${i} gaitPhase ${p.gaitPhase} expected ${expect} (stride ${stride}) at ${v} px/s`)
  }
  return moved
}

// Axis and diagonal motion use the true speed hypot(vx, vy); torch set picks the stride through the real call site.
function stateSets(): void {
  const D = Math.SQRT1_2
  let s = room()
  ok(drive(s, intent(0, 1), 60, 44, 'lit vertical') > 40 && near(s.player.vy, 120) && s.player.vx === 0, 'vertical-only walk advances the phase')
  s = room()
  ok(drive(s, intent(D, D), 60, 44, 'lit diagonal') > 40 && near(Math.hypot(s.player.vx, s.player.vy), 120), 'diagonal walk advances at the true speed')
  s = room(); s.debug.noclip = true; s.debug.speedMul = 2 // 240 px/s: lit would pick the run stride 52
  s.player.energy = 0
  ok(drive(s, intent(1), 30, 44, 'unlit 240 px/s') === 30, 'unlit torch keeps the walk stride 44 even at 240 px/s')
  s = room(); s.debug.noclip = true; s.debug.speedMul = 2
  ok(drive(s, intent(1), 30, 52, 'lit 240 px/s') === 30, 'lit torch runs with stride 52 at 240 px/s')
  s = room(); s.debug.noclip = true; s.debug.speedMul = 0.5 // 60 px/s: lit would pick the walk stride 44
  s.meta.phase = 'escape'
  ok(drive(s, intent(1), 30, 52, 'escape 60 px/s') === 30, 'escape uses the run stride 52 even at 60 px/s')
  s = room(); s.meta.phase = 'escape' // real escape acceleration: slow start (stride 52, lit would say 44) then sprint
  ok(drive(s, intent(D, D), 90, 52, 'escape diagonal') > 60, 'escape sprint advances with stride 52')
  s = room(); s.player.energy = 0
  ok(drive(s, intent(0, -1), 60, 44, 'unlit vertical') > 40, 'unlit walk, vertical')
}

export function run(): void {
  rate()
  phase()
  continuity()
  stateLevel()
  stateSets()
}
