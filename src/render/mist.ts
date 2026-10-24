// L4 render: shadow mist painter (issue #83). A thin caller: which wisps exist, where, how big and how opaque is decided by
// systems/mist.ts (eachMist, covered by checks/shadow-mist.check.ts). Pass 13 (source-over, world transform, under the darkness): the
// darkness pass dims the mist with everything else, so it shows at the edge of the light and is never lit up like the flame. Only
// monsters whose body is drawn get mist (an unseen shade stays eyes only). Nothing is stored: every wisp is analytic in meta.time.
// ponytail: one layer after the actors, so wisps overlap the sprite instead of sitting partly behind it, and a wisp is two stacked discs
// instead of a gradient. Upgrade: a back layer between the floor and the wall rows, and a baked radial-gradient sprite.
import type { MonsterKind, State } from '../core/types.ts'
import { currentQuality } from './quality.ts'
import { MON_FOOT, entityInView, monsterLit } from './entities.ts'
import type { View } from './view.ts'
import { eachMist } from '../systems/mist.ts'

const TAU = Math.PI * 2
const MIST_COL: Record<MonsterKind, string> = { lurker: '#2c2540', stalker: '#1f2d3d', devourer: '#1b1726' } // purple, steel blue, near black
const CORE = 0.55 // radius share of the denser inner disc

export function drawMist(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  eachMist(s, currentQuality(s).particles, m => monsterLit(s, m) && entityInView(v, m.x, m.y), (kind, x, y, r, a) => {
    const cy = y - MON_FOOT[kind] // the sprite centre sits MON_FOOT px above the ground contact point (R-180)
    ctx.fillStyle = MIST_COL[kind]
    ctx.globalAlpha = a * 0.5
    ctx.beginPath()
    ctx.arc(x, cy, r, 0, TAU)
    ctx.fill()
    ctx.globalAlpha = a
    ctx.beginPath()
    ctx.arc(x, cy, r * CORE, 0, TAU)
    ctx.fill()
  })
  ctx.globalAlpha = 1
}
