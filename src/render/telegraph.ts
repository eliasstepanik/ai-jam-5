// L4 render: ground strike line (playtest tuning 1b §5.4 channel 3). A dashed red line runs from a winding-up shade toward the player
// along its lunge direction and crawls toward the player; it exists only during the windup. Reads State, no rng, no writes.
// Imports only node-safe modules, so checks can load it (render code that reads characters.json cannot be imported by checks, R-043).
import type { Monster, State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { clamp } from '../core/math.ts'
import { lineOfSightPx } from '../world/los.ts'
import { inView } from './view.ts'
import type { View } from './view.ts'

const EYE_FLASH_S = 0.12 // bright eye flash at windup start, linear decay
const REDUCED_FLASH = 0.3 // settings.reducedFlash scales every flash layer (same constant as glow.ts)
const LINE_W = 2 // world px, times zoom through the world transform
const DASH = 6
const CRAWL_PX = 24 // dash offset travelled over one windup

// 0 outside the windup, 0..1 across it (aiT counts up from 0 at windup start, aiDur = telegraphS).
export const windupK = (m: Monster): number => (m.ai === 'windup' && m.aiDur > 0 ? clamp(m.aiT / m.aiDur, 0, 1) : 0)
// Eye flash: 1 at windup start, linear to 0 over EYE_FLASH_S.
export const eyeFlash = (m: Monster): number => (m.ai === 'windup' ? clamp(1 - m.aiT / EYE_FLASH_S, 0, 1) : 0)

export function drawStrikeLines(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const rf = s.settings.reducedFlash
  let saved = false
  for (const m of s.monsters) {
    if (m.ai !== 'windup' || !inView(v, m.x, m.y) || !lineOfSightPx(s, s.player.x, s.player.y, m.x, m.y)) continue
    const k = windupK(m), p = s.player, d = Math.hypot(p.x - m.x, p.y - m.y), len = Math.min(d, T.monsters[m.kind].lungeRangePx)
    if (!saved) { ctx.save(); saved = true; ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = LINE_W; ctx.lineCap = 'butt' }
    const c = Math.cos(m.lungeDir), n = Math.sin(m.lungeDir) // ponytail: line starts on the ground contact point; upgrade: per-kind mouth origin
    ctx.strokeStyle = `rgba(255,80,60,${(0.15 + 0.35 * k) * (rf ? REDUCED_FLASH : 1)})`
    // ponytail: reducedFlash only dims the line and freezes the dash crawl; no separate static style.
    ctx.setLineDash([DASH, DASH]); ctx.lineDashOffset = rf ? 0 : -k * CRAWL_PX
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + c * len, m.y + n * len); ctx.stroke()
  }
  if (saved) ctx.restore()
}
