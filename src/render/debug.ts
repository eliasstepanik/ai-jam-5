// Ground-plane colliders, actual combat volumes, and player/enemy animation labels. Read-only with respect to State.
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { T, deg } from '../core/tuning.ts'
import { getSolid } from '../world/caches.ts'
import { MON_FOOT, entityInView, monsterFrame } from './entities.ts'
import { animLen } from './charatlas.ts'
import { PLAYER_FOOT, playerPose } from './entities-player.ts'
import { makeView, screenXf, worldXf, toScreen } from './view.ts'

function circle(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.strokeStyle = color; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke()
}

function capsule(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, r: number): void {
  const a = Math.atan2(y1 - y0, x1 - x0)
  c.beginPath(); c.arc(x0, y0, r, a + Math.PI / 2, a + 3 * Math.PI / 2)
  c.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2); c.closePath(); c.stroke()
}

function animationLabel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): void {
  const width = ctx.measureText(label).width + 8
  ctx.fillStyle = 'rgba(6,8,11,0.9)'; ctx.fillRect(x - width / 2, y - 15, width, 17)
  ctx.fillStyle = '#f4e6b4'; ctx.fillText(label, x, y)
}

export function drawDebugWorld(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const g = s.debug
  if ((!g.overlay && !g.hurtboxes && !g.animations) || s.world.tiles === '' || s.meta.screen === 'title' || s.meta.screen === 'help' || s.meta.screen === 'settings') return
  const v = makeView(ctx, s, w, h), p = s.player
  ctx.save(); worldXf(ctx, v); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 1 / v.z
  if (g.overlay) {
    const solid = getSolid(s)
    ctx.strokeStyle = 'rgba(101,217,239,0.42)'
    for (let ty = v.ty0; ty <= v.ty1; ty++) for (let tx = v.tx0; tx <= v.tx1; tx++) {
      if (solid[ty * s.world.w + tx]) ctx.strokeRect(tx * TILE, ty * TILE, TILE, TILE)
    }
    circle(ctx, p.x, p.y, T.player.radiusPx, '#65d9ef')
    ctx.strokeStyle = '#65d9ef'; ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke()
  }
  if (g.hurtboxes) {
    circle(ctx, p.x, p.y, T.player.radiusPx, p.hurtT > 0 || p.roll.invuln > 0 ? '#a7ff80' : '#ffb573')
    if (p.swing.active) {
      const half = deg(T.swing.arcDeg / 2)
      ctx.strokeStyle = '#ffd27a'; ctx.beginPath(); ctx.moveTo(p.x, p.y)
      ctx.arc(p.x, p.y, T.swing.reachPx, p.swing.dir - half, p.swing.dir + half); ctx.closePath(); ctx.stroke()
    }
  }
  for (const m of s.monsters) {
    if (!entityInView(v, m.x, m.y) || !(m.seen || g.noFog || g.reveal || s.meta.phase === 'escape')) continue
    const K = T.monsters[m.kind]
    if (g.overlay) circle(ctx, m.x, m.y, K.radiusPx, '#65d9ef')
    if (g.hurtboxes && m.ai !== 'dying') {
      ctx.strokeStyle = m.ai === 'lunge' ? '#ff6262' : '#ffb573'
      if (m.ai === 'lunge') capsule(ctx, m.lastX, m.lastY, m.x, m.y, K.radiusPx + K.biteSlackPx)
      else circle(ctx, m.x, m.y, K.radiusPx + K.biteSlackPx, '#ffb573')
    }
  }
  if (g.animations) {
    screenXf(ctx, v); ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    if (entityInView(v, p.x, p.y)) {
      const { anim, frame } = playerPose(s), [x, y] = toScreen(v, p.x, p.y - PLAYER_FOOT - 36)
      animationLabel(ctx, 'player | ' + anim + ' ' + (frame + 1) + '/' + animLen('player', anim), x, y)
    }
    for (const m of s.monsters) {
      if (!entityInView(v, m.x, m.y) || !(m.seen || g.noFog || g.reveal || s.meta.phase === 'escape')) continue
      const [anim, frame] = monsterFrame(s, m), [x, y] = toScreen(v, m.x, m.y - MON_FOOT[m.kind] - 36)
      const label = m.kind + ' #' + m.id + ' | ' + m.ai + ' > ' + anim + ' ' + (frame + 1) + '/' + animLen(m.kind, anim)
      animationLabel(ctx, label, x, y)
    }
  }
  ctx.restore()
}
