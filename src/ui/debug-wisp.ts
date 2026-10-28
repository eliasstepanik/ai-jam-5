// L4 ui: read-only escape-wisp debug overlay (debug.wispViz toggle). Draws the cached route polyline, the current seek
// target, the orb's velocity, the lead/leash/reseed rings and a state readout. Pure draw: never writes State.
// Smoke-tested by hand in `npm run dev` only: checks import L0-L3 and cannot reach src/ui.
// ponytail: dev-only, allocates labels per frame; no pooling (same ceiling as debug-ai.ts).
import type { State } from '../core/types.ts'
import { makeView, screenXf, toScreen, worldXf } from '../render/view.ts'
import type { View } from '../render/view.ts'
import { tileToWorld } from '../world/grid.ts'
import { WISP_LEAD_MAX_PX, WISP_LEAD_MIN_PX, WISP_LEASH, WISP_RESEED_PX, wispAt } from '../systems/escape-wisp.ts'
import { FONT } from './draw.ts'

// Thresholds derived from the exported escape-wisp.ts constants (the leash check in stepWisp is WISP_LEAD_MAX_PX * WISP_LEASH).
const LEASH_PX = WISP_LEAD_MAX_PX * WISP_LEASH // pull-back radius (escape-wisp.ts stepWisp)
const RESEED_NEAR_PX = WISP_RESEED_PX * 0.8 // warning band before the hard reseed at WISP_RESEED_PX
const PANEL_TOP = 140 // below the AI debug panel (debug-ai.ts draws its block at y=4, ~136 px tall); dev-only fixed offset
const VEL_S = 0.25 // velocity arrow shows 0.25 s ahead (same lead as debug-ai.ts)
const ROUTE_COL = '#7ec8ff'
const TARGET_COL = '#ffe394'
const OK_COL = '#00ff88'
const LEASH_COL = '#ff3030'
const RISK_COL = '#ff9800'

type Label = { x: number; y: number; str: string; col: string }

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  ctx.strokeStyle = col
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

// follow / leashed / reseed-risk, mirroring the thresholds in escape-wisp.ts stepWisp (leashed target = player, reseed at WISP_RESEED_PX).
function orbState(s: State): { st: string; col: string; dist: number } {
  const dist = Math.hypot(s.wisp.wx - s.player.x, s.wisp.wy - s.player.y)
  if (dist > LEASH_PX) return { st: 'leashed', col: LEASH_COL, dist }
  if (dist > RESEED_NEAR_PX) return { st: 'reseed-risk', col: RISK_COL, dist }
  return { st: 'follow', col: OK_COL, dist }
}

function worldLayer(ctx: CanvasRenderingContext2D, s: State, v: View, labels: Label[]): void {
  const one = v.dpr / v.z, w = s.wisp, p = s.player, mw = s.world.w
  ctx.lineWidth = one
  // Route polyline: player -> path tile centres. path is exit-first, path[0] is the player-side tile (downhill order).
  ctx.strokeStyle = ROUTE_COL
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  for (const id of w.path) ctx.lineTo(tileToWorld(id % mw), tileToWorld(Math.floor(id / mw)))
  ctx.stroke()
  ctx.fillStyle = ROUTE_COL // tile centre dots
  for (const id of w.path) {
    ctx.beginPath()
    ctx.arc(tileToWorld(id % mw), tileToWorld(Math.floor(id / mw)), 2 * one, 0, Math.PI * 2)
    ctx.fill()
  }
  // Exit tile highlight and a faint orb -> exit line.
  const ex = tileToWorld(s.world.exit.tx), ey = tileToWorld(s.world.exit.ty)
  circle(ctx, ex, ey, 10 * one, '#ffd27a')
  ctx.globalAlpha = 0.3
  line(ctx, w.wx, w.wy, ex, ey, '#ffd27a')
  ctx.globalAlpha = 1
  // Current seek target: the route point at the eased lead d (what stepWisp feeds the seek).
  const target = { x: 0, y: 0 }
  wispAt(s, w.d, target)
  line(ctx, w.wx, w.wy, target.x, target.y, TARGET_COL)
  circle(ctx, target.x, target.y, 4 * one, TARGET_COL)
  // Rings around the player: lead min/max, leash, reseed.
  circle(ctx, p.x, p.y, WISP_LEAD_MIN_PX, '#4a6a8a')
  circle(ctx, p.x, p.y, WISP_LEAD_MAX_PX, '#4a6a8a')
  circle(ctx, p.x, p.y, LEASH_PX, LEASH_COL)
  circle(ctx, p.x, p.y, WISP_RESEED_PX, RISK_COL)
  labels.push({ x: p.x, y: p.y - WISP_LEAD_MIN_PX - 10 * one, str: `lead ${WISP_LEAD_MIN_PX}`, col: '#8fa8c8' })
  labels.push({ x: p.x, y: p.y - WISP_LEAD_MAX_PX - 10 * one, str: `lead ${WISP_LEAD_MAX_PX}`, col: '#8fa8c8' })
  labels.push({ x: p.x, y: p.y - LEASH_PX - 10 * one, str: `leash ${LEASH_PX.toFixed(0)}`, col: LEASH_COL })
  labels.push({ x: p.x, y: p.y - WISP_RESEED_PX - 10 * one, str: `reseed ${WISP_RESEED_PX}`, col: RISK_COL })
  // Orb: state ring, velocity vector, readouts.
  const { st, col, dist } = orbState(s)
  circle(ctx, w.wx, w.wy, 10 * one, col)
  line(ctx, w.wx, w.wy, w.wx + w.wvx * VEL_S, w.wy + w.wvy * VEL_S, '#ffffff')
  labels.push({ x: w.wx, y: w.wy - 16 * one, str: `d=${w.d.toFixed(0)}  dist=${dist.toFixed(0)}  state=${st}`, col: TARGET_COL })
  labels.push({ x: w.wx, y: w.wy + 12 * one, str: `${Math.hypot(w.wvx, w.wvy).toFixed(0)} px/s`, col: '#ffffff' })
}

function panelLines(s: State): string[] {
  const w = s.wisp
  return [
    `wisp.on ${w.on}  phase ${s.meta.phase}`,
    `d ${w.d.toFixed(1)} px  path ${w.path.length} tiles`,
    `sigs ss ${w.ss} ps ${w.ps}  p0 ${w.p0}`,
    `orb ${w.wx.toFixed(0)},${w.wy.toFixed(0)}  v ${Math.hypot(w.wvx, w.wvy).toFixed(0)} px/s`,
  ]
}

export function drawWispViz(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  if (!s.wisp.on || s.meta.phase !== 'escape') { // compact off-line so the toggle visibly does something
    const dpr = ctx.getTransform().a
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = `11px ${FONT}`
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(4, PANEL_TOP, 200, 19)
    ctx.fillStyle = '#e0ffe0'
    ctx.fillText(`wisp: off (phase ${s.meta.phase})`, 8, PANEL_TOP + 4)
    ctx.restore()
    return
  }
  const v = makeView(ctx, s, w, h) // before any transform change: reads the dpr from the host transform
  const labels: Label[] = []
  worldXf(ctx, v)
  worldLayer(ctx, s, v, labels)
  screenXf(ctx, v)
  ctx.font = `10px ${FONT}`
  ctx.textAlign = 'center'
  for (const l of labels) {
    const [x, y] = toScreen(v, l.x, l.y)
    ctx.fillStyle = '#000000'
    ctx.fillText(l.str, x + 1, y + 1)
    ctx.fillStyle = l.col
    ctx.fillText(l.str, x, y)
  }
  ctx.textAlign = 'left'
  ctx.font = `11px ${FONT}`
  const lines = panelLines(s)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(4, PANEL_TOP, 300, lines.length * 13 + 6)
  ctx.fillStyle = '#e0ffe0'
  lines.forEach((str, i) => ctx.fillText(str, 8, PANEL_TOP + 3 + i * 13))
  ctx.restore()
}
