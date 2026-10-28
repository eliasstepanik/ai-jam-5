// Apply the same real wall-alpha occlusion to above-darkness eyes and shadow particles.
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { FACE_H, WALL_PAD } from './tiles-paint.ts'
import { drawWallRow } from './tiles.ts'
import type { View } from './view.ts'

export function eraseForeground(g: CanvasRenderingContext2D, s: State, v: View,
  footY: number, x: number, y: number, w: number, h: number): void {
  g.save()
  g.setTransform(1, 0, 0, 1, -x, -y)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'destination-out'
  const walls = { ...v, tx0: Math.max(0, Math.floor(x / TILE)), tx1: Math.min(s.world.w - 1, Math.floor((x + w - 1) / TILE)) }
  // Later foot rows cover the actor. Same-row walls are behind it.
  for (let ty = Math.floor(footY / TILE) + 1; ty <= Math.min(s.world.h - 1, Math.floor((y + h - 1 + FACE_H + WALL_PAD) / TILE)); ty++) {
    drawWallRow(g, s, walls, ty)
  }
  g.restore()
}
