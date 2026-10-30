// Player collision adds the Beacon's rounded physical base to the established tile solver.
// Grid solidity/pathfinding stays separate: the Beacon remains an interactable destination.
import type { State } from '../core/types.ts'
import { TILE, tileToWorld } from './grid.ts'
import { circleHitsSolid, moveCircle } from './collide.ts'
import type { MoveRes } from './collide.ts'
import { beaconBaseDistance, beaconFootprint } from './beacon-position.ts'
import type { BeaconFootprint } from './beacon-position.ts'
const EPS = 1e-9
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const hitsBase = (b: BeaconFootprint | null, x: number, y: number, r: number): boolean =>
  b !== null && beaconBaseDistance(b, x, y) < r - EPS
export function playerHitsSolid(s: State, x: number, y: number, r: number): boolean {
  return circleHitsSolid(s, x, y, r) || hitsBase(beaconFootprint(s), x, y, r)
}
// Deterministic nearest tile landing for debug teleport/noclip exit, including the Beacon base.
export function nearestPlayerFloor(s: State, tile: number, radius: number, r: number): number {
  const w = s.world.w, h = s.world.h, x = tile % w, y = Math.floor(tile / w)
  for (let d = 0; d <= radius; d++) for (let ty = Math.max(0, y - d); ty <= Math.min(h - 1, y + d); ty++) {
    for (let tx = Math.max(0, x - d); tx <= Math.min(w - 1, x + d); tx++) {
      if (Math.max(Math.abs(tx - x), Math.abs(ty - y)) !== d) continue
      if (!playerHitsSolid(s, tileToWorld(tx), tileToWorld(ty), r)) return ty * w + tx
    }
  }
  return -1
}
export function movePlayerCircle(s: State, x: number, y: number, dx: number, dy: number, r: number): MoveRes {
  if (!(r > 0) || ![x, y, dx, dy, r].every(Number.isFinite)) throw new RangeError('player movement needs finite coordinates and positive radius')
  const b = beaconFootprint(s), p: MoveRes = { x, y, hitX: false, hitY: false }
  // Repair an older HMR position inside the newly introduced prop without needing player input.
  if (b && hitsBase(b, x, y, r)) {
    const cx = clamp(x, b.x0, b.x1), ox = x - cx, oy = y - b.y, length = Math.hypot(ox, oy)
    p.x = length > EPS ? cx + ox / length * (b.r + r) : x
    p.y = length > EPS ? b.y + oy / length * (b.r + r) : b.y + b.r + r
    if (circleHitsSolid(s, p.x, p.y, r)) {
      const free = nearestPlayerFloor(s, Math.floor(y / TILE) * s.world.w + Math.floor(x / TILE), s.world.w + s.world.h, r)
      if (free >= 0) { p.x = tileToWorld(free % s.world.w); p.y = tileToWorld(Math.floor(free / s.world.w)) }
    }
    p.hitX = Math.abs(p.x - x) > EPS; p.hitY = Math.abs(p.y - y) > EPS
  }
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (.9 * r)))
  for (let step = 0; step < n; step++) for (const axis of ['x', 'y'] as const) {
    const oldX = p.x, oldY = p.y, delta = (axis === 'x' ? dx : dy) / n
    const grid = moveCircle(s, p.x, p.y, axis === 'x' ? delta : 0, axis === 'y' ? delta : 0, r)
    p.x = grid.x; p.y = grid.y; p.hitX ||= grid.hitX; p.hitY ||= grid.hitY
    if (b && hitsBase(b, p.x, p.y, r)) {
      const cx = clamp(p.x, b.x0, b.x1), cross = axis === 'x' ? p.y - b.y : p.x - cx
      const extent = Math.sqrt(Math.max(0, (b.r + r) ** 2 - cross * cross))
      if (axis === 'x') {
        const side = oldX < b.x0 ? -1 : oldX > b.x1 ? 1 : -Math.sign(delta) || 1
        p.x = (side < 0 ? b.x0 : b.x1) + side * extent; p.hitX = true
      } else {
        const side = Math.sign(oldY - b.y) || -Math.sign(delta) || 1
        p.y = b.y + side * extent; p.hitY = true
      }
    }
    if (circleHitsSolid(s, p.x, p.y, r) || hitsBase(b, p.x, p.y, r)) {
      p.x = oldX; p.y = oldY
      if (axis === 'x') p.hitX = true; else p.hitY = true
    }
  }
  return p
}
