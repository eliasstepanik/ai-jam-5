// Real animated sprites reflected about their ground contact, compressed vertically for the cave projection.
import type { State } from '../core/types.ts'
import { CAVE_DRESSING } from '../core/cave-props.ts'
import { dirIndex } from '../core/grid.ts'
import { drawPlayerBody } from './entities-player.ts'
import { MON_FOOT, monsterFrame, monsterDirection } from './entities.ts'
import { charFrame, drawAtlas } from './charatlas.ts'
import { drawDressingProp } from './dressing.ts'
import type { DressingProp } from './dressing.ts'
export function reflectActors(g: CanvasRenderingContext2D, s: State, left: number, top: number, w: number, h: number, props: DressingProp[]): void {
  const near = (x: number, y: number): boolean => x + 40 >= left && x - 40 <= left + w && y <= top + h + 5 && y + 34 >= top
  const reflect = (footY: number, draw: () => void): void => {
    g.save(); g.setTransform(1, 0, 0, -0.45, -left, footY * 1.45 - top)
    draw(); g.restore()
  }
  if (near(s.player.x, s.player.y)) reflect(s.player.y, () => drawPlayerBody(g, s, 1))
  for (const m of s.monsters) if (near(m.x, m.y)) reflect(m.y, () => {
    const [anim, i] = monsterFrame(s, m), f = charFrame(m.kind, anim, dirIndex(monsterDirection(s, m)), i)
    drawAtlas(g, f, Math.round(m.x) - 32, Math.round(m.y - MON_FOOT[m.kind]) - 32)
  })
  for (const p of props) if (CAVE_DRESSING[p.def].layer === 'actor' && near(p.x, p.y)) reflect(p.y, () => drawDressingProp(g, p))
}
