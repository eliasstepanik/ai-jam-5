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
import { FLAME_COL } from './flame.ts'
import { currentQuality } from './quality.ts'
import type { View } from './view.ts'
import { inView } from './view.ts'

const P_MAX = 512 // matches the registry arrays in assets/resources.ts
const TAU = Math.PI * 2
// Palette (<= 16 colours, one fillStyle per bucket). 3..6 are the flame mantle colours: none, then MINERALS order.
const C_DUST = 0, C_EMBER = 1, C_HOT = 2, C_FLAME = 3
const PAL: readonly string[] = ['#8c8070', '#ffb347', '#fff4d6', FLAME_COL.none.mantle,
  ...MINERALS.map(m => FLAME_COL[m].mantle)]

// Shape ids: 0 square, 1 streak along the launch direction, 2 fx_dust sprite (frame by age).
type Burst = {
  n: number; col: number; alt: number; add: 0 | 1; shape: 0 | 1 | 2
  vmin: number; vmax: number; life: number; size: number; drag: number; grav: number
  ang: number; spread: number; jit: number // launch angle +- spread/2 (TAU = all round); spawn offset +- jit/2 px
}
const BASE: Burst = { n: 0, col: C_HOT, alt: C_HOT, add: 1, shape: 0, vmin: 50, vmax: 140, life: 0.35, size: 1,
  drag: 2, grav: 0, ang: 0, spread: TAU, jit: 0 }
const DUST: Burst = { ...BASE, col: C_DUST, alt: C_DUST, add: 0, shape: 2, vmin: 20, vmax: 60, life: 0.5, size: 1, drag: 3, grav: -10 }

function burst(p: Particles, s: State, e: FxEvent, b: Burst): void {
  const n = Math.round(b.n * currentQuality(s).particles)
  for (let i = 0; i < n; i++) {
    const k = p.head
    p.head = (k + 1) % P_MAX // ponytail: ring overwrite drops the oldest spark when 512 are live. Upgrade: raise P_MAX with the registry.
    const ang = b.ang + (hash2(e.seq, i, 1) - 0.5) * b.spread, sp = b.vmin + (b.vmax - b.vmin) * hash2(e.seq, i, 2)
    p.x0[k] = e.x + (hash2(e.seq, i, 3) - 0.5) * b.jit
    p.y0[k] = e.y + (hash2(e.seq, i, 4) - 0.5) * b.jit
    p.vx[k] = Math.cos(ang) * sp
    p.vy[k] = Math.sin(ang) * sp
    p.born[k] = s.meta.time
    p.life[k] = b.life * (0.8 + 0.4 * hash2(e.seq, i, 5))
    p.size[k] = b.size
    p.drag[k] = b.drag
    p.grav[k] = b.grav
    p.col[k] = i & 1 ? b.alt : b.col
    p.add[k] = b.add
    p.shape[k] = b.shape
  }
}

const mineralCol = (a: number): number => C_FLAME + 1 + a // a = MINERALS index (payloads of mineDone and toss)

function spawn(p: Particles, s: State, e: FxEvent): void {
  switch (e.kind) {
    // ponytail: mineTick carries progress, not the mineral, so it sparks pale crystal light. Upgrade: look the vein up at e.x, e.y.
    case 'mineTick': burst(p, s, e, { ...BASE, n: 4, col: C_HOT, alt: C_HOT, grav: 120, jit: 4 }); break
    case 'mineDone': // a = -1: pouch full, nothing to show
      if (e.a >= 0 && e.a < MINERALS.length) burst(p, s, e, { ...BASE, n: 10, col: mineralCol(e.a), alt: C_HOT, grav: 120, jit: 6 })
      break
    case 'beaconLit':
      burst(p, s, e, { ...BASE, n: 48, col: C_EMBER, alt: C_HOT, vmin: 60, vmax: 300, life: 1.2, drag: 1.5, grav: -40, size: 2 })
      break
    case 'toss': // a = -1: denied, no flame left the hand
      if (e.a >= 0 && e.a < MINERALS.length) burst(p, s, e, { ...BASE, n: 16, col: mineralCol(e.a), alt: C_HOT, vmin: 40, vmax: 160, life: 0.5 })
      break
    case 'roll': // a = heading: dust kicks out behind the player
      burst(p, s, e, { ...DUST, n: 6, size: 0.5, ang: e.a + Math.PI, spread: 1.2, jit: 6 })
      break
    case 'rockLand': // a = 0 is the cosmetic-only landing; both draw the same dust ring
      burst(p, s, e, { ...DUST, n: 14, size: 1, jit: 10 })
      break
    // rockWarn and dodge are not in the spec table (DEFAULT): grit shaking loose above the marker, and a short spark streak.
    case 'rockWarn':
      burst(p, s, e, { ...BASE, n: 3, col: C_DUST, alt: C_DUST, add: 0, vmin: 0, vmax: 20, life: 0.4, drag: 1, grav: 90, jit: Math.max(8, e.a) })
      break
    case 'dodge':
      burst(p, s, e, { ...BASE, n: 4, col: C_EMBER, alt: C_HOT, shape: 1, vmin: 80, vmax: 160, life: 0.25, size: 4 })
      break
    default: break
  }
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

// Passes 13 ('normal', world transform, source-over) and 18 ('add', world transform, 'lighter'). Analytic: nothing is integrated,
// every particle is a pure function of (spawn data, meta.time). One fillStyle per palette bucket.
export function drawParticles(ctx: CanvasRenderingContext2D, s: State, v: View, pass: 'normal' | 'add'): void {
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
