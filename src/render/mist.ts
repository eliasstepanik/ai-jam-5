// L4 render: shadow mist painter (issue #83). A thin caller: which wisps exist, where, how big and how opaque is decided by
// systems/mist.ts (eachMist, covered by checks/shadow-mist.check.ts). Pass 13 (source-over, world transform, under the darkness): the
// darkness pass dims the mist with everything else, so it shows at the edge of the light and is never lit up like the flame. Only
// monsters whose body is drawn get mist (an unseen shade stays eyes only). Nothing is stored: every wisp is analytic in meta.time.
// Opaque native squares replace the old colored discs; state/quality caps remain in eachMist.
import type { State } from '../core/types.ts'
import { currentQuality } from './quality.ts'
import { MON_FOOT, entityInView, monsterLit } from './entities.ts'
import type { View } from './view.ts'
import { eachMist } from '../systems/mist.ts'

export function drawMist(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000000'
  ctx.globalAlpha = 1
  eachMist(s, currentQuality(s).particles, m => monsterLit(s, m) && entityInView(v, m.x, m.y), (kind, x, y, r, a) => {
    if (a < 0.025) return
    const size = Math.max(1, Math.min(4, Math.round(r / 5 * Math.min(1, a * 8))))
    ctx.fillRect(Math.round(x), Math.round(y - MON_FOOT[kind]), size, size)
  })
  ctx.restore()
}
