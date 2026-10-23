import type { State } from '../core/types.ts'
import { forN4, idx, isSolidAt, isSolidTile, TILE, worldToTile } from './grid.ts'

export type MoveRes = { x: number; y: number; hitX: boolean; hitY: boolean }
const EPS = 1e-9
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

export function circleRectOverlap(cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return Math.hypot(cx - clamp(cx, x0, x1), cy - clamp(cy, y0, y1)) < r - EPS
}

export function circleHitsSolid(s: State, x: number, y: number, r: number): boolean {
  for (let ty = worldToTile(y - r); ty <= worldToTile(y + r - EPS); ty++) {
    for (let tx = worldToTile(x - r); tx <= worldToTile(x + r - EPS); tx++) {
      if (isSolidTile(s, tx, ty) && circleRectOverlap(x, y, r, tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE)) return true
    }
  }
  return false
}

// Degenerate starts inside a wall: back out along the active movement axis.
// At rest use the lowest-index free neighbour, as required by WQ1 §3.
function pushInside(s: State, p: MoveRes, tx: number, ty: number, r: number, axis: 'x' | 'y', delta: number): void {
  let ax = axis, sign = -Math.sign(delta)
  if (sign === 0) {
    let best = Infinity
    const i = idx(s, tx, ty)
    forN4(s, i, j => { if (j < best && !isSolidAt(s, j)) best = j })
    if (best !== Infinity) {
      ax = Math.floor(best / s.world.w) === ty ? 'x' : 'y'
      sign = best < i ? -1 : 1
    } else sign = -1
  }
  if (ax === 'x') p.x = (tx + (sign > 0 ? 1 : 0)) * TILE + sign * r
  else p.y = (ty + (sign > 0 ? 1 : 0)) * TILE + sign * r
}

function resolve(s: State, p: MoveRes, r: number, axis: 'x' | 'y', delta: number): void {
  const tx0 = worldToTile(p.x - r), tx1 = worldToTile(p.x + r - EPS)
  const ty0 = worldToTile(p.y - r), ty1 = worldToTile(p.y + r - EPS)
  for (let pass = 0; pass < 2; pass++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!isSolidTile(s, tx, ty)) continue
        const cx = clamp(p.x, tx * TILE, (tx + 1) * TILE), cy = clamp(p.y, ty * TILE, (ty + 1) * TILE)
        const ox = p.x - cx, oy = p.y - cy, d = Math.hypot(ox, oy)
        if (d >= r - EPS) continue
        const oldX = p.x, oldY = p.y
        // Resolve only the axis being moved. Radial pushes at each tile corner stole tangential motion at wall seams.
        const cross = axis === 'x' ? oy : ox
        const along = axis === 'x' ? ox : oy
        if (d > 1e-6 && Math.abs(cross) < r) {
          const extent = Math.sqrt(Math.max(0, r * r - cross * cross))
          const side = along === 0 ? -Math.sign(delta) || -1 : Math.sign(along)
          p[axis] = (axis === 'x' ? cx : cy) + side * extent
        } else pushInside(s, p, tx, ty, r, axis, delta)
        if (Math.abs(p.x - oldX) > EPS) p.hitX = true
        if (Math.abs(p.y - oldY) > EPS) p.hitY = true
      }
    }
  }
}

export function moveCircle(s: State, x: number, y: number, dx: number, dy: number, r: number): MoveRes {
  if (!(r > 0) || ![x, y, dx, dy, r].every(Number.isFinite)) throw new RangeError('moveCircle needs finite coordinates and a positive radius')
  const p: MoveRes = { x, y, hitX: false, hitY: false }
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (0.9 * r)))
  for (let step = 0; step < n; step++) {
    for (const axis of ['x', 'y'] as const) {
      const oldX = p.x, oldY = p.y, wasFree = !circleHitsSolid(s, oldX, oldY, r)
      const delta = (axis === 'x' ? dx : dy) / n
      p[axis] += delta
      resolve(s, p, r, axis, delta)
      // ponytail: two push passes can leave a large circle wedged between corners.
      // Reject that axis move from a free start; use swept contacts if this feels sticky.
      if (wasFree && circleHitsSolid(s, p.x, p.y, r)) {
        p.x = oldX
        p.y = oldY
        if (axis === 'x') p.hitX = true
        else p.hitY = true
      }
    }
  }
  return p
}
