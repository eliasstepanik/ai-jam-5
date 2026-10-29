// Persistent dodge reminder: starts under the escape announcement, then settles into the freed hotbar hint area.
import type { State } from '../core/types.ts'
import { escapeTipPose } from './escape-tip-pose.ts'
import type { HudLayout } from './layout.ts'
import { text } from './draw.ts'
import { STR } from './strings.ts'
export function drawEscapeTip(ctx: CanvasRenderingContext2D, s: State, l: HudLayout, color: string): void {
  if (s.meta.phase !== 'escape') return
  const p = escapeTipPose(s.director.escapeT, l)
  text(ctx, STR.dodgeHint, p.x, p.y, p.size, l.u, color, { align: 'center' })
}
