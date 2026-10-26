// L4 ui: detailed AI debug overlay (R-096, monsters-ai-2 §9). The developer panel calls this when showPaths is enabled.
// Access is guarded by game.ts: development sessions or an explicit ?debug=1 opt-in.
// Smoke-tested by hand in `npm run dev` only: checks import L0-L3 and cannot reach src/ui. Pure draw: never writes State.
// ponytail: dev-only, allocates a few strings and a label list per frame; no pooling.
import type { Monster, MonsterKind, State } from '../core/types.ts'
import { clamp } from '../core/math.ts'
import { deg, T, zt } from '../core/tuning.ts'
import { STALKER_BEHIND_S } from '../systems/ai-stalker.ts'
import { lightRadius } from '../systems/light.ts'
import { lungeHazard } from '../systems/monsters.ts'
import { getResources } from '../assets/resources.ts'
import { makeView, screenXf, toScreen, worldXf } from '../render/view.ts'
import type { View } from '../render/view.ts'
import { FONT } from './draw.ts'

const KIND_COL: Record<MonsterKind, string> = { lurker: '#00e5ff', stalker: '#ffe600', devourer: '#ff2bd6' }
const KINDS: readonly MonsterKind[] = ['lurker', 'stalker', 'devourer']
const BAR_PX = 24 // behindT bar width, world px

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

// Lunge speed: the live one during a lunge, the planned one (as startLunge computes it) during a windup.
function lungeLen(s: State, m: Monster): number {
  const K = T.monsters[m.kind]
  const vL = m.ai === 'lunge' ? Math.hypot(m.vx, m.vy)
    : Math.max(30, Math.hypot(m.x - s.player.x, m.y - s.player.y) - T.player.radiusPx - K.radiusPx) / K.contactS
  return vL * (K.contactS + K.lungeOverrunS)
}

function monsterLayer(ctx: CanvasRenderingContext2D, s: State, one: number, labels: Label[]): void {
  const p = s.player
  for (const m of s.monsters) {
    const col = KIND_COL[m.kind], K = T.monsters[m.kind]
    circle(ctx, p.x, p.y, m.ringRadius, col, [4 * one, 4 * one]) // ring incl. drift (m.ringRadius is what the brain steers to)
    const tx = p.x + Math.cos(m.ringAngle) * m.ringRadius, ty = p.y + Math.sin(m.ringAngle) * m.ringRadius
    line(ctx, m.x, m.y, tx, ty, col) // ring target
    ctx.setLineDash([])
    line(ctx, m.x, m.y, m.x + m.vx * 0.25, m.y + m.vy * 0.25, '#ffffff') // velocity, 0.25 s ahead
    if (m.ai === 'windup' || m.ai === 'lunge') {
      const len = lungeLen(s, m), ex = m.x + Math.cos(m.lungeDir) * len, ey = m.y + Math.sin(m.lungeDir) * len
      ctx.globalAlpha = 0.25
      ctx.lineCap = 'round'
      ctx.lineWidth = 2 * K.radiusPx // capsule of the lunge sweep
      line(ctx, m.x, m.y, ex, ey, '#ff3030')
      ctx.lineCap = 'butt'
      ctx.lineWidth = one
      ctx.globalAlpha = 1
      line(ctx, m.x, m.y, ex, ey, '#ff3030') // lungeHazard line (locked direction)
    }
    if (m.contactT >= 0) { // bite latch
      ctx.fillStyle = '#ff3030'
      ctx.beginPath()
      ctx.arc(m.x, m.y, 4 * one, 0, Math.PI * 2)
      ctx.fill()
    }
    if (m.kind === 'stalker') { // behindT bar over the shade
      ctx.fillStyle = '#400'
      ctx.fillRect(m.x - BAR_PX / 2, m.y - K.radiusPx - 6 * one, BAR_PX, 3 * one)
      ctx.fillStyle = m.behindT + 1e-9 >= STALKER_BEHIND_S ? '#ff3030' : '#ffe600'
      ctx.fillRect(m.x - BAR_PX / 2, m.y - K.radiusPx - 6 * one, BAR_PX * clamp(m.behindT / STALKER_BEHIND_S, 0, 1), 3 * one)
    }
    const str = `${m.ai} ${m.aiT.toFixed(2)}/${m.aiDur.toFixed(2)} ${m.lungeCd.toFixed(2)} ${lungeHazard(s, m).toFixed(3)}`
      + (m.fleeing ? ' F' : '') + (m.stuckT > 0 ? ' S' + m.stuckT.toFixed(2) : '') + (m.contactT >= 0 ? ' L' + m.contactT.toFixed(2) : '')
    labels.push({ x: m.x, y: m.y + K.radiusPx + 4 * one, str, col })
  }
}

function worldLayer(ctx: CanvasRenderingContext2D, s: State, v: View): Label[] {
  const one = v.dpr / v.z, p = s.player, R = lightRadius(s), labels: Label[] = []
  ctx.lineWidth = one
  circle(ctx, p.x, p.y, R, '#ffffff') // light
  circle(ctx, p.x, p.y, R + T.director.spawnGapPx[0], '#888888', [6 * one, 4 * one]) // spawn annulus
  circle(ctx, p.x, p.y, R + T.director.spawnGapPx[1], '#888888', [6 * one, 4 * one])
  circle(ctx, p.x, p.y, R + 220, '#666666', [one, 3 * one]) // eye range
  if (s.monsters.some(m => m.kind === 'stalker')) { // 140 degree wedge behind the facing (|off| > stalkerBehindDeg = 110 -> +-70 deg)
    const half = Math.PI - deg(T.ai.stalkerBehindDeg), mid = p.facing + Math.PI
    ctx.fillStyle = 'rgba(255,40,40,0.18)'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.arc(p.x, p.y, R + 100, mid - half, mid + half)
    ctx.closePath()
    ctx.fill()
  }

  ctx.setLineDash([])
  monsterLayer(ctx, s, one, labels)
  return labels
}

function panelLines(s: State): string[] {
  const d = s.director, p = s.player, z = s.meta.zone, esc = s.meta.phase === 'escape'
  const A = esc ? 1 : T.minerals.table[p.activeMineral].attractMul
  const cap = esc ? T.escape.maxAlive : clamp(Math.round(zt(T.director.maxAlive, z) * A), 1, T.director.monstersMax)
  const interval = esc ? T.escape.spawnIntervalS : zt(T.director.spawnIntervalS, z) / (A * (p.energy <= 0 ? T.director.flameOutSpawnMul : 1))
  let live = 0, used = 0
  for (const m of s.monsters) {
    if (m.ai !== 'dying') live += 1
    if (m.ai === 'windup' || m.ai === 'lunge') used += 1
  }
  const lam = KINDS.map(k => {
    const m = s.monsters.find(o => o.kind === k)
    return k[0] + ' ' + (m ? lungeHazard(s, m).toFixed(3) : '-')
  }).join('  ')
  const mins = Math.max(s.meta.time, 1) / 60
  const pr = p.parry, perf = getResources().perf
  let sum = 0
  for (const f of perf.frameMs) sum += f
  const fps = sum > 0 ? 1000 * perf.frameMs.length / sum : 0
  const out = [
    `alive ${live}/${cap}  (L${d.alive.lurker} S${d.alive.stalker} D${d.alive.devourer})  slots ${used}/${esc ? T.escape.attackSlots : zt(T.director.attackSlots, z)}`,
    `spawnT ${d.spawnT.toFixed(2)}  interval ${interval.toFixed(2)}  A ${A.toFixed(2)}`,
    `lambda ${lam}`,
    `relocates ${d.relocates} (${(d.relocates / mins).toFixed(2)}/min)`,
    `parry ${pr.lastGrade} ${pr.lastDelta.toFixed(3)}s`,
    `fps ${fps.toFixed(0)}`,
  ]
  for (const k of Object.keys(perf.pass)) if (k !== '@') out.push(`pass ${k} ${perf.pass[k].toFixed(2)}ms`) // '@' is the mark timestamp, not a timing
  return out
}

export function drawAiDebug(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  ctx.save()
  const sc = s.meta.screen
  const labels: Label[] = []
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  if (s.world.tiles !== '' && sc !== 'title' && sc !== 'help') {
    const v = makeView(ctx, s, w, h) // before any transform change: reads the dpr from the host transform
    worldXf(ctx, v)
    labels.push(...worldLayer(ctx, s, v))
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
  }
  ctx.setLineDash([])
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `11px ${FONT}`
  const lines = panelLines(s)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(4, 4, 360, lines.length * 13 + 6)
  ctx.fillStyle = '#e0ffe0'
  lines.forEach((str, i) => ctx.fillText(str, 8, 7 + i * 13))
  ctx.restore()
}
