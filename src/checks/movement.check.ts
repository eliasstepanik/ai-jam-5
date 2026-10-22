// A32 movement checks: wall pushing never overlaps a solid tile, substep count, acceleration/friction/escape speeds, wall slide.
// Spec: architecture-systems-4.md §8 #8, architecture-systems.md §5.1-§5.2, tuning player/escape rows, R-012 (collision lives in world/).
// Exports run(); no side effect on import; DOM-free; all state is local to each scenario (hand-built grids, no cave generation).
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { clearCaches } from '../world/caches.ts'
import { isSolidTile, TILE } from '../world/grid.ts'
import { moveCircle } from '../world/collide.ts'
import { resolveIntent } from '../systems/intent.ts'
import { stepMovement } from '../systems/movement.ts'

const DT = 1 / 60
const R = T.player.radiusPx

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: movement: ' + msg)
}
const near = (a: number, b: number, tol: number, msg: string): void =>
  ok(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ' + b + ' +-' + tol + ')')

// 12 x 12 room: solid border, floor inside. Player starts mid-room.
function room(): State {
  const s = init(), w = 12, h = 12
  let tiles = ''
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles += x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.'
  Object.assign(s.world, { w, h, tiles, tilesHash: fnv1a(tiles) })
  s.meta.runId = 1
  clearCaches()
  Object.assign(s.player, { x: 6 * TILE, y: 6 * TILE })
  return s
}

const keysInput = (...keys: string[]): Input => ({
  keys: new Set(keys), pressed: new Set(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 },
})
const drive = (s: State, input: Input): void => stepMovement(s, resolveIntent(s, input), DT)

// Closest-point distance from the player centre to every solid tile; the minimum must stay >= r - 1e-6.
function minWallGap(s: State): number {
  let best = Infinity
  for (let ty = 0; ty < s.world.h; ty++) {
    for (let tx = 0; tx < s.world.w; tx++) {
      if (!isSolidTile(s, tx, ty)) continue
      const cx = Math.max(tx * TILE, Math.min((tx + 1) * TILE, s.player.x))
      const cy = Math.max(ty * TILE, Math.min((ty + 1) * TILE, s.player.y))
      best = Math.min(best, Math.hypot(s.player.x - cx, s.player.y - cy))
    }
  }
  return best
}

export function run(): void {
  // 1. §8 #8: 120 steps pushing into each wall (and each corner) never overlap a solid tile.
  const dirs: [string, string[]][] = [
    ['right', ['KeyD']], ['left', ['KeyA']], ['down', ['KeyS']], ['up', ['KeyW']],
    ['down-right', ['KeyD', 'KeyS']], ['up-left', ['KeyA', 'KeyW']], ['down-left', ['KeyA', 'KeyS']], ['up-right', ['KeyD', 'KeyW']],
  ]
  for (const [name, keys] of dirs) {
    for (const esc of [false, true]) {
      const s = room()
      s.meta.phase = esc ? 'escape' : 'descent'
      let hit = false
      for (let k = 0; k < 120; k++) {
        drive(s, keysInput(...keys))
        ok(minWallGap(s) >= R - 1e-6, name + (esc ? ' (escape)' : '') + ': step ' + k + ' overlaps a wall, gap ' + minWallGap(s))
        if (s.player.vx === 0 || s.player.vy === 0) hit = true
      }
      ok(hit, name + ': a wall contact zeroed a velocity axis')
    }
  }
  // Resting against the right wall: x pinned at wall edge - r, vx zeroed each step.
  {
    const s = room()
    for (let k = 0; k < 120; k++) drive(s, keysInput('KeyD'))
    near(s.player.x, 11 * TILE - R, 1e-6, 'pinned against the right wall at edge - r')
    ok(s.player.vx === 0, 'vx zeroed by the wall')
    near(s.player.y, 6 * TILE, 1e-9, 'y untouched by a pure x push')
  }

  // 2. Substeps (§5.2 #4): n = ceil(hypot / (0.9 r)). A 9.3 px/step lunge at r = 9 is 2 substeps; the 7 px roll step is 1.
  {
    const lunge = 560 / 60, r = T.monsters.lurker.radiusPx
    ok(Math.ceil(lunge / (0.9 * r)) === 2, 'lunge step ' + lunge + ' px at r=9 needs 2 substeps')
    ok(Math.ceil((T.roll.speedPxS / 60) / (0.9 * R)) === 1, 'roll step 7 px at r=10 needs 1 substep')
    // behaviour: a 9.3 px step aimed at a 6 px-thick-in-reach wall from 8 px away is stopped, not tunnelled.
    const s = room() // wall tile column 11 starts at x = 352; circle r = 9 at x = 352 - 9 - 3 = 340
    const res = moveCircle(s, 340, 6 * TILE, lunge, 0, r)
    near(res.x, 352 - r, 1e-6, 'fast move stops at the wall (no tunnelling)')
    ok(res.hitX && !res.hitY, 'hitX only')
    // a 40 px step (far above 0.9 r) cannot skip the 32 px wall either
    const far = moveCircle(s, 300, 6 * TILE, 60, 0, r)
    near(far.x, 352 - r, 1e-6, 'a 60 px move cannot tunnel through the border')
  }

  // 3. Velocity model: accelerate toward walkPxS, clamp at it, diagonal is normalised, friction stops, never overshoots.
  {
    const s = room()
    drive(s, keysInput('KeyD'))
    near(s.player.vx, T.player.accelPxS2 * DT, 1e-9, 'first step accelerates by accel * dt')
    for (let k = 0; k < 30; k++) drive(s, keysInput('KeyD'))
    near(s.player.vx, T.player.walkPxS, 1e-9, 'steady speed is walkPxS (120)')
    const x0 = s.player.x
    drive(s, keysInput('KeyD'))
    near(s.player.x - x0, T.player.walkPxS * DT, 1e-9, 'steady step moves walkPxS * dt = 2 px')
    for (let k = 0; k < 30; k++) drive(s, keysInput())
    ok(s.player.vx === 0 && s.player.vy === 0, 'friction stops the player')
    ok(Math.abs(s.player.vx) < 1e-12, 'friction does not overshoot into negative velocity')
  }
  {
    const s = room()
    for (let k = 0; k < 40; k++) drive(s, keysInput('KeyD', 'KeyS'))
    near(Math.hypot(s.player.vx, s.player.vy), T.player.walkPxS, 1e-9, 'diagonal speed is walkPxS, not walkPxS * sqrt2')
    near(s.player.vx, s.player.vy, 1e-9, 'diagonal splits evenly')
  }
  // Friction: from 120 px/s at frictionPxS2 1100 -> 120 / (1100 / 60) = 6.5 -> 7 steps to rest.
  {
    const s = room()
    s.player.vx = T.player.walkPxS
    let n = 0
    while (s.player.vx > 0 && n < 100) { drive(s, keysInput()); n++ }
    ok(n === Math.ceil(T.player.walkPxS / (T.player.frictionPxS2 * DT)), 'friction stops a full-speed player in ceil(120 / (1100/60)) steps (got ' + n + ')')
  }

  // 4. Escape: sprintMul doubles the top speed (240), faster accel, friction * frictionMul.
  {
    const s = room()
    s.meta.phase = 'escape'
    s.player.x = 3 * TILE; s.player.y = 6 * TILE
    drive(s, keysInput('KeyD'))
    near(s.player.vx, T.escape.accelPxS2 * DT, 1e-9, 'escape accelerates by escape.accelPxS2 * dt (30)')
    for (let k = 0; k < 10; k++) drive(s, keysInput('KeyD'))
    near(s.player.vx, T.player.walkPxS * T.escape.sprintMul, 1e-9, 'escape steady speed is 240 px/s')
    s.player.x = 3 * TILE
    s.player.vx = 240
    let n = 0
    while (s.player.vx > 0 && n < 100) { drive(s, keysInput()); n++ }
    ok(n === Math.ceil(240 / (T.player.frictionPxS2 * T.escape.frictionMul * DT)), 'escape friction is frictionMul times stronger (got ' + n + ' steps)')
  }

  // 5. Rolling: stepRoll owns the velocity, so stepMovement leaves vx/vy alone but still collides.
  {
    const s = room()
    Object.assign(s.player, { x: 10 * TILE, vx: T.roll.speedPxS })
    s.player.roll.t = 0.2
    drive(s, keysInput('KeyA'))
    ok(s.player.vx === T.roll.speedPxS, 'rolling: velocity not touched by stepMovement')
    for (let k = 0; k < 10; k++) { s.player.roll.t = 0.2; drive(s, keysInput('KeyA')) }
    ok(minWallGap(s) >= R - 1e-6 && s.player.vx === 0, 'rolling into a wall: collision still runs and zeroes vx')
  }

  // 6. Wall slide (ponytail in movement.ts): pressing diagonally into a wall keeps the free-axis speed, no sticking.
  {
    const s = room()
    for (let k = 0; k < 40; k++) drive(s, keysInput('KeyD'))
    s.player.vx = 0
    const y0 = s.player.y
    for (let k = 0; k < 30; k++) drive(s, keysInput('KeyD', 'KeyS'))
    ok(s.player.y > y0 + 30 * (T.player.walkPxS / Math.SQRT2) * DT * 0.5, 'sliding down the wall keeps moving (y advanced ' + (s.player.y - y0) + ')')
    ok(minWallGap(s) >= R - 1e-6, 'sliding never overlaps')
  }
}
