// L4 ui: monster behaviour debug overlay for issue #113 (debug.aiViz toggle). Draws the awareness ring and state
// label, the sensing shapes (view cone / hunting range circle / hearing radius), the detection meter, the patrol
// home circle and waypoint line, the retreat and stalker-commit latches, the separation radius and the director
// near ring plus the flow-field window. Pure draw: never writes State and never touches a derived cache
// (checks import L0-L3 only; smoke-tested by hand in `npm run dev`).
// ponytail: dev-only, allocates labels per frame; no pooling (same ceiling as debug-ai.ts).
import type { State } from '../core/types.ts'
import type { Awareness } from '../core/types-monster.ts'
import { T } from '../core/tuning.ts'
import { TILE } from '../core/state.ts'
import { nearCount } from '../systems/ai-retreat.ts'
import { makeView, screenXf, toScreen, worldXf } from '../render/view.ts'
import type { View } from '../render/view.ts'
import { FONT } from './draw.ts'

const AWARE_COL: Record<Awareness, string> = { unaware: '#9e9e9e', suspicious: '#ffe600', hunting: '#ff3030', searching: '#ff9800' }
const HEAR_COL = '#6a5cff'
const SEP_COL = '#3dffb0'
const PATROL_COL = '#4a6a8a'
const RETREAT_COL = '#ff9800'
const STALK_COL = '#ffe600'
const NEAR_COL = '#8fa8c8'
const FLOW_WIN_COL = '#00ff88'
const BAR_PX = 24 // detection meter width, world px (same as debug-ai.ts behindT bar)
const LATCH_PX = 60 // retreat/stalk direction line length, world px

type Label = { x: number; y: number; str: string; col: string }

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, dash: number[] = []): void {
  ctx.strokeStyle = col
  ctx.setLineDash(dash)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string): void {
  ctx.strokeStyle = col
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}

// Draws every living monster; returns true if any is stuck past flowStuckT (flow window box is worth drawing).
function monsterLayer(ctx: CanvasRenderingContext2D, s: State, one: number, labels: Label[]): boolean {
  const p = s.player
  let anyStuck = false
  for (const m of s.monsters) {
    if (m.ai === 'dying') continue
    const acol = AWARE_COL[m.awareness], K = T.monsters[m.kind]
    ctx.globalAlpha = 0.25
    circle(ctx, m.x, m.y, T.ai.separationPx, SEP_COL) // separation radius (faint)
    if (m.awareness === 'hunting') { // hunting senses cone-less at range*1.5 (awareness.ts stepAwareness)
      ctx.globalAlpha = 0.3
      circle(ctx, m.x, m.y, T.ai.viewRange * 1.5, acol)
    } else { // view cone: T.ai.viewRange / viewHalfAngle around m.facing
      ctx.globalAlpha = 0.12
      ctx.fillStyle = acol
      ctx.beginPath()
      ctx.moveTo(m.x, m.y)
      ctx.arc(m.x, m.y, T.ai.viewRange, m.facing - T.ai.viewHalfAngle, m.facing + T.ai.viewHalfAngle)
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalAlpha = 0.3
    circle(ctx, m.x, m.y, T.ai.hearRadius, HEAR_COL, [3 * one, 3 * one]) // hearing (canHear: no LOS test)
    ctx.globalAlpha = 1
    if (m.awareness === 'unaware') { // patrol brain runs while unaware (patrolBrain)
      circle(ctx, m.homeX, m.homeY, T.ai.patrolRadius, PATROL_COL, [2 * one, 4 * one])
      if (m.patrolT !== 0) line(ctx, m.x, m.y, m.patrolX, m.patrolY, PATROL_COL)
    }
    if (m.retreatT > 0) { // retreat latch: flee direction away from the player (retreatBrain)
      const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1
      line(ctx, m.x, m.y, m.x + (dx / d) * LATCH_PX, m.y + (dy / d) * LATCH_PX, RETREAT_COL)
      labels.push({ x: m.x, y: m.y - K.radiusPx - 20 * one, str: `RETREAT ${m.retreatT.toFixed(1)}s`, col: RETREAT_COL })
    }
    if (m.stalkT > 0) { // stalker commit latch: approach along the locked angle (stalkCommitT window)
      line(ctx, m.x, m.y, m.x + Math.cos(m.stalkAngle) * LATCH_PX, m.y + Math.sin(m.stalkAngle) * LATCH_PX, STALK_COL)
      labels.push({ x: m.x, y: m.y - K.radiusPx - 32 * one, str: `stalk ${m.stalkT.toFixed(2)}s`, col: STALK_COL })
    }
    circle(ctx, m.x, m.y, K.radiusPx + 2 * one, acol) // awareness ring
    // detection meter: fills toward noticeT (unaware/suspicious) or drains toward loseT (hunting), per stepAwareness.
    const thr = m.awareness === 'hunting' ? T.ai.loseT : T.ai.noticeT
    const frac = Math.min(1, m.detectionTimer / thr)
    ctx.fillStyle = '#222222'
    ctx.fillRect(m.x - BAR_PX / 2, m.y - K.radiusPx - 10 * one, BAR_PX, 3 * one)
    ctx.fillStyle = acol
    ctx.fillRect(m.x - BAR_PX / 2, m.y - K.radiusPx - 10 * one, BAR_PX * frac, 3 * one)
    labels.push({ x: m.x, y: m.y + K.radiusPx + 3 * one, str: m.awareness, col: acol })
    if (m.stuckT > T.ai.flowStuckT) anyStuck = true
  }
  return anyStuck
}

function worldLayer(ctx: CanvasRenderingContext2D, s: State, v: View, labels: Label[]): void {
  const one = v.dpr / v.z, p = s.player
  ctx.lineWidth = one
  const anyStuck = monsterLayer(ctx, s, one, labels)
  circle(ctx, p.x, p.y, T.director.nearRadius, NEAR_COL, [6 * one, 4 * one]) // director near radius (nearCount/nearCap)
  ctx.setLineDash([])
  labels.push({ x: p.x, y: p.y - T.director.nearRadius - 12 * one, str: `near ${nearCount(s)}/${T.director.nearCap}`, col: NEAR_COL })
  if (anyStuck) { // flow-field window: T.ai.flowWindow tiles half-width, centred on the player tile (getFlowField key)
    const win = T.ai.flowWindow, ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE)
    ctx.globalAlpha = 0.4
    ctx.strokeStyle = FLOW_WIN_COL
    ctx.strokeRect((ptx - win) * TILE, (pty - win) * TILE, (2 * win + 1) * TILE, (2 * win + 1) * TILE)
    ctx.globalAlpha = 1
    // ponytail: no per-monster flow arrow here - flowDir -> getFlowField lazily BUILDS the flow cache (a module-level
    // side effect this overlay must not cause). debug-ai.ts (showPaths) already draws the arrow from the game's own field.
  }
}

function legendLines(): { str: string; col: string }[] {
  return [
    { str: 'AI VIZ (issue #113)', col: '#e0ffe0' },
    { str: 'ring + label = awareness', col: '#e0ffe0' },
    { str: `cone=view ${T.ai.viewRange} x/${T.ai.viewHalfAngle.toFixed(2)}rad  hear ${T.ai.hearRadius} dashed`, col: HEAR_COL },
    { str: `hunting circle=range*1.5  bar=detect/${T.ai.noticeT}|${T.ai.loseT}s`, col: '#e0ffe0' },
    { str: `home=patrol ${T.ai.patrolRadius}  near ring=nearRadius`, col: NEAR_COL },
    { str: 'flow arrow skipped: getFlowField builds cache', col: RETREAT_COL },
  ]
}

export function drawAiViz(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  const sc = s.meta.screen
  if (s.world.tiles !== '' && sc !== 'title' && sc !== 'help') {
    const v = makeView(ctx, s, w, h) // before any transform change: reads the dpr from the host transform
    const labels: Label[] = []
    worldXf(ctx, v)
    worldLayer(ctx, s, v, labels)
    screenXf(ctx, v)
    ctx.font = `10px ${FONT}`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    for (const l of labels) {
      const [x, y] = toScreen(v, l.x, l.y)
      ctx.fillStyle = '#000000'
      ctx.fillText(l.str, x + 1, y + 1)
      ctx.fillStyle = l.col
      ctx.fillText(l.str, x, y)
    }
    ctx.font = `11px ${FONT}` // compact legend, top-right (debug-wisp.ts owns the top-left panel)
    ctx.textAlign = 'left'
    const lines = legendLines()
    let bw = 0
    for (const l of lines) bw = Math.max(bw, ctx.measureText(l.str).width)
    bw += 12
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(w - bw - 4, 4, bw, lines.length * 13 + 6)
    lines.forEach((l, i) => {
      ctx.fillStyle = l.col
      ctx.fillText(l.str, w - bw + 4, 7 + i * 13)
    })
  }
  ctx.setLineDash([])
  ctx.restore()
}
