// Developer-only map and direct destination indicator. Cached terrain lives in the resource registry.
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { debugBearing } from '../systems/debug-navigation.ts'
import { makeView, screenXf, toScreen } from '../render/view.ts'
import type { View } from '../render/view.ts'
import { PLAYER_FOOT } from '../render/entities-player.ts'
import { drawMinimap } from './debug-map.ts'
import { FONT } from './draw.ts'

function arrow(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const p = s.player, [x, y] = toScreen(v, p.x, p.y - PLAYER_FOOT)
  const bearing = debugBearing(s, p.x, p.y - PLAYER_FOOT), at = debugBearing(s).distance <= TILE / 2
  const color = s.debug.arrowTarget === 'beacon' ? '#ffd27a' : '#70eda7'
  if (!at) {
    const radius = 44
    ctx.save(); ctx.translate(x + Math.cos(bearing.angle) * radius, y + Math.sin(bearing.angle) * radius)
    ctx.rotate(bearing.angle)
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7); ctx.closePath()
    ctx.lineWidth = 3; ctx.strokeStyle = '#101015'; ctx.stroke()
    ctx.fillStyle = color; ctx.fill(); ctx.restore()
  }
  const label = (at ? 'AT ' : '') + (s.debug.arrowTarget === 'beacon' ? 'BEACON' : 'EXIT') +
    (at ? '' : ' ' + Math.ceil(debugBearing(s).distance / TILE) + 't')
  ctx.font = '10px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.lineWidth = 3; ctx.strokeStyle = '#101015'; ctx.strokeText(label, x, y + 56)
  ctx.fillStyle = color; ctx.fillText(label, x, y + 56)
}

export function drawDebugNavigation(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  if (!s.world.tiles || s.meta.screen === 'title' || s.meta.screen === 'help' || (!s.debug.minimap && !s.debug.arrow)) return
  const v = makeView(ctx, s, w, h)
  ctx.save(); screenXf(ctx, v)
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
  if (s.debug.minimap) drawMinimap(ctx, s, w, h)
  if (s.debug.arrow) arrow(ctx, s, v)
  ctx.restore()
}
