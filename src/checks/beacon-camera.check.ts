// #141 edge camera/world boundary and #143 solid Beacon base with accessible interaction.
import { init } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { beaconFootprint, beaconBaseDistance, beaconInReach } from '../world/beacon-position.ts'
import { movePlayerCircle, playerHitsSolid } from '../world/player-collide.ts'
import { clearCaches } from '../world/caches.ts'
import { stepCamera } from '../systems/camera.ts'
import { stepMovement, stepRoll } from '../systems/movement.ts'
import { stepBeacon } from '../systems/beacon.ts'
import { debugAction } from '../systems/debug.ts'
import { debugTeleport } from '../systems/debug-navigation.ts'
import type { Intent } from '../systems/intent.ts'
const DT = 1 / 60, R = T.player.radiusPx
const ok = (v: unknown, msg: string): void => { if (!v) throw Error('Beacon/camera: ' + msg) }
function room() {
  const s = init(), w = 20, h = 16, tiles = '.'.repeat(w * h)
  Object.assign(s.world, { w, h, tiles, tilesHash: fnv1a(tiles), beacon: { tx: 10, ty: 8 } })
  s.meta.screen = 'playing'; s.meta.runId = 41143; clearCaches()
  return s
}
function intent(x: number, y: number): Intent {
  const length = Math.hypot(x, y) || 1
  return { mx: x / length, my: y / length, moving: !!(x || y), aimX: 0, aimY: 0,
    swing: false, roll: false, interact: false, interactEdge: false, toss: false, shake: false, select: null }
}
function edges(): void {
  for (const noclip of [false, true]) for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const s = room(), w = s.world.w * 32, h = s.world.h * 32
    s.debug.noclip = noclip; s.debug.speedMul = 10; s.meta.phase = 'escape'
    s.player.x = dx < 0 ? R + 4 : dx > 0 ? w - R - 4 : w / 2
    s.player.y = dy < 0 ? R + 4 : dy > 0 ? h - R - 4 : h / 2
    const it = intent(dx, dy), view = { w: 1920, h: 1080, dpr: 2 }
    for (let i = 0; i < 240; i++) {
      stepMovement(s, it, DT); stepCamera(s, DT, view)
      ok(s.player.x >= R - 1e-8 && s.player.x <= w - R + 1e-8 && s.player.y >= R - 1e-8 && s.player.y <= h - R + 1e-8, 'open map boundary blocks every edge/corner in both modes')
    }
    ok(Math.abs(s.cam.x - s.player.x) < .001 && Math.abs(s.cam.y - s.player.y) < .001, 'camera follows to every edge/corner without viewport clamp')
    ok(s.player.gaitSpeed < 1e-7, 'blocked boundary does not animate running in place')
    const x = s.cam.x, y = s.cam.y
    stepCamera(s, DT, { w: 0, h: 0, dpr: 1 }); ok(Math.abs(s.cam.x - x) < .001 && Math.abs(s.cam.y - y) < .001, 'viewport resize does not shift edge camera')
  }
}
function base(): void {
  const s = room(), b = beaconFootprint(s)!, x = (b.x0 + b.x1) / 2
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8, cx = x + Math.cos(angle) * 120, cy = b.y + Math.sin(angle) * 120
    const p = movePlayerCircle(s, cx, cy, -Math.cos(angle) * 120, -Math.sin(angle) * 120, R)
    ok(!playerHitsSolid(s, p.x, p.y, R) && (p.hitX || p.hitY), 'high-speed approach hits rounded base from all directions')
    ok(beaconBaseDistance(b, p.x, p.y) >= R - 1e-7, 'no penetration at final contact')
  }
  const tangent = movePlayerCircle(s, x - 120, b.y - b.r - R, 240, 0, R)
  ok(Math.abs(tangent.x - x - 120) < 1e-8 && !tangent.hitX, 'tangential movement slides past without sticking')
  const repaired = movePlayerCircle(s, x, b.y, 0, 0, R)
  ok(!playerHitsSolid(s, repaired.x, repaired.y, R), 'HMR start inside newly added base is repaired at rest')
  for (const [px, py] of [[b.x0-b.r-R,b.y],[b.x1+b.r+R,b.y],[x,b.y-b.r-R],[x,b.y+b.r+R]]) {
    const q = room(); q.player.x = px; q.player.y = py; q.player.energy = 100
    const it = { ...intent(0,0), interact: true, interactEdge: true }
    ok(beaconInReach(q, T.beacon.reachPx), 'all sides remain in interaction reach at contact')
    for (let i = 0; i < 300; i++) stepBeacon(q, it, DT, q.player.energy)
    ok(q.world.beaconLit && q.meta.phase === 'escape' && !playerHitsSolid(q, px, py, R), 'normal five-second activation works beside each side')
  }
  s.player.x = x - 120; s.player.y = b.y; s.player.energy = 0; s.meta.phase = 'escape'
  const roll = { ...intent(1,0), roll: true }
  for (let i = 0; i < 30; i++) { stepRoll(s, { ...roll, roll: i === 0 }, DT); stepMovement(s, roll, DT) }
  ok(s.player.x <= b.x0-b.r-R+1e-8 && !playerHitsSolid(s,s.player.x,s.player.y,R), 'dodge roll cannot tunnel through base')
  s.debug.noclip = true; s.player.x = x; s.player.y = b.y; debugAction(s,'noclip')
  ok(!s.debug.noclip && !playerHitsSolid(s,s.player.x,s.player.y,R), 'noclip exit finds a clear stand outside Beacon')
  ok(debugTeleport(s,'beacon') && !playerHitsSolid(s,s.player.x,s.player.y,R) && beaconInReach(s,T.beacon.reachPx), 'debug teleport lands at a usable stand')
  ok(s.cam.x === s.player.x && s.cam.y === s.player.y, 'teleport camera centres immediately')
}
export function run(): void { edges(); base() }
