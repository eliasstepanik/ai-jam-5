// L4 render: cosmetic particles (B18). Spec: docs/architecture-render-2.md §4 (analytic pool, palette buckets, event table),
// architecture-rocks-2.md §6, passes 2 (consumeEvents), 13 (normal) and 18 (additive) of architecture-render.md §3.
// The pool is typed arrays in getResources().particles (never State, never module-level). Noise is the stateless
// hash2(e.seq, i, salt): no rand, no Math.random, no State writes, so a replay of the same events draws the same sparks.
import type { FxEvent, State } from '../core/types.ts'
import type { Particles } from '../assets/resources.ts'
import { getResources } from '../assets/resources.ts'
import { drawSprite } from '../assets/images.ts'
import { MINERALS } from '../core/state.ts'
import { hash2 } from '../core/noise.ts'
import { currentQuality } from './quality.ts'
import { drawMist } from './mist.ts'
import type { View } from './view.ts'
import { inView } from './view.ts'
import { WISP_LEAD_MIN_PX } from '../systems/escape-wisp.ts'
import { C_EMBER, C_FLAME, C_HOT, C_SPARK, COL_ARG, COL_SPARK, PAL, TABLE, TAU } from './particles-table.ts'
import type { Spec, SpawnKind } from './particles-table.ts'

const P_MAX = 512 // matches the registry arrays in assets/resources.ts
const REDUCED_FLASH = 0.3 // settings.reducedFlash scales the count of flash-type bursts (same constant as overlay.ts, glow.ts)
const ROW_STRIDE = 64 // hash index offset per table row, so rows of one event draw different noise (every row has n < 64)

// Palette index for a colour of the table: fixed (>= 0), or a marker: COL_SPARK = active flame spark, COL_FLAME (any other negative
// except COL_ARG) = active flame mantle, COL_ARG = mineral from e.a.
// -1 = draw nothing (denied toss, pouch full).
function colour(s: State, e: FxEvent, c: number): number {
  if (c >= 0) return c
  if (c === COL_ARG) return e.a >= 0 && e.a < MINERALS.length ? C_FLAME + 1 + e.a : -1
  const k = MINERALS.indexOf(s.player.activeMineral as typeof MINERALS[number]) + 1 // none = 0
  return (c === COL_SPARK ? C_SPARK : C_FLAME) + k
}

function burst(p: Particles, s: State, e: FxEvent, b: Spec, row: number): void {
  const col = colour(s, e, b.col), alt = colour(s, e, b.alt)
  if (col < 0 || alt < 0) return
  const flash = b.fl && s.settings.reducedFlash ? REDUCED_FLASH : 1
  const n = Math.round(b.n * flash * currentQuality(s).particles)
  const jit = b.jitArg ? Math.max(b.jit, e.a) : b.jit
  const base = b.dir === 1 ? e.a : b.dir === 2 ? e.a + Math.PI : 0
  for (let i = 0; i < n; i++) {
    const k = p.head, h = i + row * ROW_STRIDE
    p.head = (k + 1) % P_MAX // ponytail: ring overwrite drops the oldest spark when 512 are live. Upgrade: raise P_MAX with the registry.
    const ang = b.ring ? (i / n) * TAU : base + b.ang + (hash2(e.seq, h, 1) - 0.5) * b.spread
    const sp = b.ring ? b.vmax : b.vmin + (b.vmax - b.vmin) * hash2(e.seq, h, 2)
    p.x0[k] = e.x + (hash2(e.seq, h, 3) - 0.5) * jit
    p.y0[k] = e.y + (hash2(e.seq, h, 4) - 0.5) * jit
    p.vx[k] = Math.cos(ang) * sp
    p.vy[k] = Math.sin(ang) * sp
    p.born[k] = s.meta.time
    p.life[k] = b.life * (0.8 + 0.4 * hash2(e.seq, h, 5))
    p.size[k] = b.size
    p.drag[k] = b.drag
    p.grav[k] = b.grav
    p.col[k] = i & 1 ? alt : col
    p.add[k] = b.add
    p.shape[k] = b.shape
  }
}

// Kinds without a row (uiMove, uiConfirm, uiBack, copyLink) are screen sounds, not sparks.
function spawn(p: Particles, s: State, e: FxEvent): void {
  const rows = TABLE[e.kind as SpawnKind]
  if (rows) for (let r = 0; r < rows.length; r++) burst(p, s, e, rows[r], r)
}

// Pass 2. Spawns from events newer than the cursor. A fresh pool, a new run, or a seq counter that went backwards clears the pool,
// jumps the cursor to the newest event and spawns nothing (old events are history, not sparks).
export function consumeEvents(s: State): void {
  const p = getResources().particles
  const ev = s.fx.events
  if (p.runId !== s.meta.runId || p.lastSeq >= s.fx.seq) {
    p.life.fill(0)
    p.head = 0
    p.runId = s.meta.runId
    p.lastSeq = s.fx.seq - 1
    return
  }
  for (const e of ev) {
    if (e.seq <= p.lastSeq) continue
    spawn(p, s, e)
    p.lastSeq = e.seq
  }
}

// Escape guide wisp (#81), drawn in the additive pass so it glows through the darkness. Analytic like the pool: a pure function of
// (State.wisp, meta.time). Sparkles trail behind the separately rendered native body; reducedFlash
// holds the pulse and the sparkle jitter still, and the quality tier thins the trail. A frame allocates nothing.
const WISP_TRAIL = 6 // sparkles behind the orb at full quality
const WISP_GAP_PX = 14 // distance between sparkles behind the orb at full speed
const WISP_TRAIL_FULL_PX_S = 120 // orb speed at which the trail reaches full length; a slower orb pulls it in (rests as one dot)
function drawWispTrail(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const w = s.wisp
  if (!w.on || s.meta.screen !== 'playing' || s.meta.phase !== 'escape' || w.path.length < 2) return
  const t = s.meta.time, calm = s.settings.reducedFlash, fade = Math.min(1, w.d / WISP_LEAD_MIN_PX)
  const n = Math.round(WISP_TRAIL * currentQuality(s).particles), sp = Math.hypot(w.wvx, w.wvy), gap = WISP_GAP_PX * Math.min(1, sp / WISP_TRAIL_FULL_PX_S)
  for (let k = n; k > 0; k--) { // trail only; the native body has its own final pass
    if (k * gap < 1) continue // a resting orb draws no sparkles: stacked on the orb they would only brighten it (additive)
    const back = (k * gap) / (sp || 1) // sparkles hang behind the orb along its velocity
    const j = calm ? 0 : Math.floor(t * 10), jx = (hash2(j, k, 11) - 0.5) * 4, jy = (hash2(j, k, 12) - 0.5) * 4
    const x = w.wx - w.wvx * back + jx, y = w.wy - w.wvy * back + jy
    if (!inView(v, x, y)) continue
    const a = fade * (1 - k / (n + 1))
    ctx.globalAlpha = 0.7 * a
    ctx.fillStyle = PAL[k & 1 ? C_EMBER : C_HOT]
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2)
  }
  ctx.globalAlpha = 1
}

// Passes 13 ('normal', world transform, source-over) and 18 ('add', world transform, 'lighter'). Analytic: nothing is integrated,
// every particle is a pure function of (spawn data, meta.time). One fillStyle per palette bucket.
export function drawParticles(ctx: CanvasRenderingContext2D, s: State, v: View, pass: 'normal' | 'add'): void {
  if (pass === 'add') drawWispTrail(ctx, s, v)
  else drawMist(ctx, s, v) // #83: shadow mist of the monsters, first so sparks and dust lie on top of it
  const p = getResources().particles, want = pass === 'add' ? 1 : 0, now = s.meta.time
  for (let c = 0; c < PAL.length; c++) {
    const col = PAL[c]
    let set = false
    for (let i = 0; i < P_MAX; i++) {
      if (p.col[i] !== c || p.add[i] !== want || p.life[i] <= 0) continue
      const t = now - p.born[i], life = p.life[i]
      if (t < 0 || t > life) continue
      const d = p.drag[i], e = d > 0 ? (1 - Math.exp(-d * t)) / d : t
      const x = p.x0[i] + p.vx[i] * e, y = p.y0[i] + p.vy[i] * e + 0.5 * p.grav[i] * t * t
      if (!inView(v, x, y)) continue
      const a = 1 - t / life, sh = p.shape[i], size = p.size[i]
      if (sh === 2) {
        drawSprite(ctx, 'fx_dust', 'puff', Math.min(4, Math.floor((t / life) * 5)), x, y, 0, size, 0.7 * a, col)
        continue
      }
      if (!set) { ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1; set = true }
      ctx.globalAlpha = a
      if (sh === 1) {
        const vx = p.vx[i], vy = p.vy[i], m = Math.hypot(vx, vy) || 1
        ctx.beginPath()
        ctx.moveTo(Math.round(x), Math.round(y))
        ctx.lineTo(Math.round(x - (vx / m) * size), Math.round(y - (vy / m) * size))
        ctx.stroke()
      } else ctx.fillRect(Math.round(x), Math.round(y), size, size)
    }
  }
  ctx.globalAlpha = 1
}
