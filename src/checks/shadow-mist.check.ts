// #83 shadow mist: every monster kind emits wisps with its own profile, the emission follows the AI state (idle, moving, windup, lunge,
// dying, frozen AI), it is capped per monster and globally, scales with the quality tier, honours reducedFlash and the caller's
// visibility filter, moves with meta.time, and never writes State (rng streams included). Runs the PRODUCTION code of systems/mist.ts;
// render/mist.ts is a thin caller that pulls in the DOM resource store and cannot be imported here (R-043, browser-verified).
import type { Monster, MonsterKind, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { spawnMonster } from '../entities/monster.ts'
import type { MistMode } from '../systems/mist.ts'
import { MIST, MIST_GLOBAL_CAP, eachMist, mistCount, mistMode } from '../systems/mist.ts'

const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: shadow-mist: ' + msg) }
const KINDS: MonsterKind[] = ['lurker', 'stalker', 'devourer']
type W = { kind: MonsterKind; x: number; y: number; r: number; a: number }
const ALL = (): boolean => true

function world(): State {
  const s = init()
  s.player.x = 400
  s.player.y = 400
  s.meta.time = 12.3
  return s
}
const mon = (s: State, kind: MonsterKind, ai: Monster['ai'], vx = 0, vy = 0): Monster => {
  const m = spawnMonster(s, kind, 500, 400, 100)
  m.ai = ai
  m.vx = vx
  m.vy = vy
  m.aiT = 0
  m.aiDur = 0.5
  return m
}
function wisps(s: State, qMul = 1, visible: (m: Monster) => boolean = ALL): W[] {
  const out: W[] = []
  const n = eachMist(s, qMul, visible, (kind, x, y, r, a) => { out.push({ kind, x, y, r, a }) })
  ok(n === out.length, `eachMist returns the number of emits (${n} vs ${out.length})`)
  return out
}
const sum = (w: W[], f: (e: W) => number): number => w.reduce((t, e) => t + f(e), 0)
const mean = (w: W[], f: (e: W) => number): number => sum(w, f) / w.length
const one = (kind: MonsterKind, ai: Monster['ai'], vx = 0, vy = 0, edit?: (s: State, m: Monster) => void): { s: State; m: Monster; w: W[] } => {
  const s = world(), m = mon(s, kind, ai, vx, vy)
  edit?.(s, m)
  return { s, m, w: wisps(s) }
}

function perKind(): void {
  const idle = KINDS.map(k => one(k, 'ring').w)
  for (let i = 0; i < 3; i++) {
    ok(idle[i].length === MIST[KINDS[i]].n, `${KINDS[i]} idles with its profile count ${MIST[KINDS[i]].n}, got ${idle[i].length}`)
    ok(idle[i].every(e => e.kind === KINDS[i] && e.r > 0 && e.a >= 0 && e.a <= 1), `${KINDS[i]} wisps are well formed`)
    ok(sum(idle[i], e => e.a) > 0, `${KINDS[i]} wisps are visible`)
    ok(idle[i].every(e => Math.abs(e.x - 500) <= MIST[KINDS[i]].spread + 0.001), `${KINDS[i]} idle wisps stay inside the profile spread`)
  }
  // distinct per type: count and size grow lurker < stalker < devourer, and the devourer cloud is the widest
  ok(idle[0].length < idle[1].length && idle[1].length < idle[2].length, 'wisp count: lurker < stalker < devourer')
  ok(mean(idle[0], e => e.r) < mean(idle[1], e => e.r) && mean(idle[1], e => e.r) < mean(idle[2], e => e.r), 'wisp radius: lurker < stalker < devourer')
  const spreadOf = (w: W[]): number => Math.max(...w.map(e => Math.abs(e.x - 500)))
  ok(spreadOf(idle[2]) > spreadOf(idle[0]), 'the devourer cloud is wider than the lurker cloud')
}

function states(): void {
  for (const k of KINDS) {
    const idle = one(k, 'ring'), wind = one(k, 'windup'), lunge = one(k, 'lunge', 200, 0)
    ok(mistMode(idle.s, idle.m) === 'idle' && mistMode(wind.s, wind.m) === 'windup' && mistMode(lunge.s, lunge.m) === 'lunge', `${k} modes`)
    ok(wind.w.length > idle.w.length && lunge.w.length > wind.w.length, `${k}: windup (${wind.w.length}) and lunge (${lunge.w.length}) are thicker than idle (${idle.w.length})`)
    ok(mean(wind.w, e => e.a) > mean(idle.w, e => e.a), `${k}: windup wisps are denser in colour than idle ones`)
    // moving: a slow drift counts as idle, real speed is 'move' with a trail behind the velocity
    const slow = one(k, 'ring', 3, 0), move = one(k, 'ring', 180, 0)
    ok(mistMode(slow.s, slow.m) === 'idle' && mistMode(move.s, move.m) === 'move', `${k}: 5 px/s separates idle from move`)
    const edge = (v: number): MistMode => { const o = one(k, 'ring', v, 0); return mistMode(o.s, o.m) }
    ok(edge(4.9) === 'idle' && edge(5.1) === 'move', `${k}: the move threshold sits at 5 px/s`)
    const still = idle.w, n = Math.min(still.length, move.w.length)
    ok(move.w.length > still.length, `${k}: moving mist is denser`)
    let behind = 0
    for (let i = 0; i < n; i++) {
      ok(move.w[i].x <= still[i].x + 1e-9, `${k} wisp ${i} never leads the body`)
      if (move.w[i].x < still[i].x - 0.01) behind++
      ok(Math.abs(move.w[i].y - still[i].y) < 1e-9, `${k} wisp ${i} keeps its row when moving along x`)
    }
    ok(behind >= 1, `${k}: moving wisps trail behind the body`)
    const up = one(k, 'ring', 0, -180).w
    ok(up.some((e, i) => i < n && e.y > still[i].y + 0.01) && up.every((e, i) => i >= n || e.y >= still[i].y - 1e-9), `${k}: moving north trails to the south`)
    // frozen AI (dev panel): lunging and moving shades idle
    const fz = one(k, 'lunge', 200, 0, s => { s.debug.freezeAi = true })
    ok(mistMode(fz.s, fz.m) === 'idle' && fz.w.length === idle.w.length, `${k}: freezeAi holds the mist at idle (${fz.w.length})`)
    ok(fz.w.every((e, i) => e.x === idle.w[i].x && e.y === idle.w[i].y && e.a === idle.w[i].a), `${k}: freezeAi mist equals the idle mist`)
    // reducedFlash drops the thickening and the opacity boost
    const calm = one(k, 'lunge', 0, 0, s => { s.settings.reducedFlash = true }), loud = one(k, 'lunge', 0, 0)
    ok(calm.w.length === idle.w.length, `${k}: reducedFlash lunge count equals idle (${calm.w.length})`)
    ok(mean(calm.w, e => e.a) < mean(loud.w, e => e.a), `${k}: reducedFlash dims the lunge mist`)
  }
}

function dying(): void {
  for (const k of KINDS) {
    const at = (t: number): { s: State; m: Monster; w: W[] } => one(k, 'dying', 0, 0, (_s, m) => { m.aiT = t * m.aiDur })
    const t0 = at(0), t5 = at(0.5), t1 = at(1)
    ok(mistMode(t0.s, t0.m) === 'dying', `${k}: dying mode`)
    ok(sum(t0.w, e => e.a) > 0, `${k}: dying starts visible`)
    ok(sum(t5.w, e => e.a) < sum(t0.w, e => e.a) && sum(t1.w, e => e.a) === 0, `${k}: mist dissipates over the death animation`)
    ok(Math.max(...t5.w.map(e => Math.abs(e.x - 500))) > Math.max(...t0.w.map(e => Math.abs(e.x - 500))), `${k}: the dying cloud spreads outward`)
    ok(t5.w.length === t0.w.length, `${k}: dying keeps the wisp count (it only fades)`)
    ok(t0.w.every((e, i) => t5.w[i].r < e.r && t1.w[i].r < t5.w[i].r), `${k}: every dying wisp shrinks while it disperses`)
    // aiT/aiDur is clamped to 0..1, and a zero-length animation counts as finished
    const same = (a: W[], b: W[]): boolean => JSON.stringify(a) === JSON.stringify(b)
    ok(same(at(2).w, t1.w) && same(at(-1).w, t0.w), `${k}: dying progress clamps to 0..1`)
    ok(same(one(k, 'dying', 0, 0, (_s, m) => { m.aiT = 0; m.aiDur = 0 }).w, t1.w), `${k}: dying with aiDur 0 is finished`)
  }
}

function caps(): void {
  for (const k of KINDS) {
    const s = world(), m = mon(s, k, 'lunge')
    ok(mistCount(s, m, 1) <= MIST[k].cap, `${k}: lunge count within the per-monster cap`)
    ok(mistCount(s, m, 100) === MIST[k].cap, `${k}: the per-monster cap binds (${mistCount(s, m, 100)} vs ${MIST[k].cap})`)
    ok(wisps(s, 100).length === MIST[k].cap, `${k}: eachMist emits at most the per-monster cap`)
    ok(mistCount(s, m, 0) === 0 && wisps(s, 0).length === 0, `${k}: quality multiplier 0 emits nothing`)
    ok(mistCount(s, m, 0.5) < mistCount(s, m, 1) && mistCount(s, m, 0.25) < mistCount(s, m, 0.5), `${k}: lower quality tiers thin the mist`)
  }
  const s = world()
  for (let i = 0; i < 40; i++) mon(s, KINDS[i % 3], 'lunge')
  ok(wisps(s).length === MIST_GLOBAL_CAP, `40 lunging monsters stop at the global cap ${MIST_GLOBAL_CAP}, got ${wisps(s).length}`)
  ok(MIST_GLOBAL_CAP <= 512, 'the global cap fits the particle pool')
  // monsters the caller culls neither emit nor use up the budget
  const h = world()
  for (let i = 0; i < 12; i++) mon(h, 'devourer', 'lunge')
  const shown = mon(h, 'lurker', 'ring'), w = wisps(h, 1, m => m === shown)
  ok(w.length === MIST.lurker.n && w.every(e => e.kind === 'lurker'), `culled monsters emit nothing and do not eat the budget (${w.length})`)
  ok(wisps(h, 1, () => false).length === 0, 'visible filter false emits nothing')
  ok(wisps(world()).length === 0, 'no monsters, no mist')
}

function readOnly(): void {
  const build = (): State => {
    const s = world()
    for (const k of KINDS) mon(s, k, 'lunge', 120, 30)
    mon(s, 'devourer', 'dying')
    return s
  }
  const s = build()
  const before = JSON.stringify(s), rng = JSON.stringify(s.rng)
  const a = wisps(s), b = wisps(s)
  ok(JSON.stringify(s) === before && JSON.stringify(s.rng) === rng, 'eachMist writes nothing to State and consumes no rng stream')
  ok(a.length > 0 && JSON.stringify(a) === JSON.stringify(b), 'two calls on the same State agree')
  ok(JSON.stringify(wisps(build())) === JSON.stringify(a), 'two identical worlds produce identical mist')
  s.meta.time += 0.5
  ok(JSON.stringify(wisps(s)) !== JSON.stringify(a), 'the mist drifts with meta.time')
  // each wisp fades in and out over its life: sampled over two lives the opacity reaches ~0 and ~peak, never above the peak
  for (const k of KINDS) {
    const f = one(k, 'ring'), P = MIST[k]
    let lo = Infinity, hi = 0, rlo = Infinity, rhi = 0
    for (let t = 0; t < 2 * P.life; t += 0.01) {
      f.s.meta.time = t
      for (const e of wisps(f.s)) { lo = Math.min(lo, e.a); hi = Math.max(hi, e.a); rlo = Math.min(rlo, e.r); rhi = Math.max(rhi, e.r) }
    }
    ok(rlo >= 0.2 * P.r - 1e-9 && rlo < 0.22 * P.r && rhi <= P.r + 1e-9 && rhi > 0.98 * P.r, `${k}: wisps shrink from 1.0 to 0.2 of the profile radius (${rlo.toFixed(2)}..${rhi.toFixed(2)} of ${P.r})`)
    ok(lo < 0.02 * P.alpha && hi > 0.95 * P.alpha && hi <= P.alpha + 1e-9, `${k}: wisp opacity fades in and out (min ${lo.toFixed(4)}, max ${hi.toFixed(4)}, peak ${P.alpha})`)
  }
  const ids = world(), p = mon(ids, 'lurker', 'ring'), q = mon(ids, 'lurker', 'ring')
  ok(JSON.stringify(wisps(ids, 1, m => m === p)) !== JSON.stringify(wisps(ids, 1, m => m === q)), 'two monsters of one kind get different clouds')
}

// Per-wisp comparisons. Worlds are built the same way, so wisp i is the same wisp in every mode and only the mode differs.
function perWisp(): void {
  const ext = (k: MonsterKind, ai: Monster['ai'], vx: number, t = 12.3): W[] => { const o = one(k, ai, vx); o.s.meta.time = t; return wisps(o.s) }
  const trails: number[] = [], rises: number[] = []
  for (const k of KINDS) {
    const idle = one(k, 'ring').w
    for (const ai of ['windup', 'lunge'] as const) { // reducedFlash: neither thicker nor more opaque, wisp for wisp
      const calm = one(k, ai, 0, 0, s => { s.settings.reducedFlash = true }).w, loud = one(k, ai).w
      ok(calm.length === idle.length && calm.every((e, i) => e.a === idle[i].a && e.x === idle[i].x && e.y === idle[i].y && e.r === idle[i].r), `${k} ${ai}: reducedFlash wisps equal the idle wisps`)
      ok(loud.every((e, i) => i >= idle.length || e.a > idle[i].a), `${k} ${ai}: normal ${ai} wisps are more opaque than the idle ones`)
    }
    // trail: a lunge drags its wisps back along the velocity like a walk does, up to the speed clamp
    const lg0 = ext(k, 'lunge', 0), lg = ext(k, 'lunge', 200)
    ok(lg.length === lg0.length && lg.every((e, i) => e.x <= lg0[i].x + 1e-9 && e.y === lg0[i].y && e.r === lg0[i].r && e.a === lg0[i].a), `${k}: a lunge only moves the wisps back`)
    ok(lg.some((e, i) => e.x < lg0[i].x - 0.01), `${k}: lunging wisps trail behind the body`)
    const off = (v: number): number[] => ext(k, 'lunge', v).map((e, i) => lg0[i].x - e.x)
    const o60 = off(60), o240 = off(240), o1000 = off(1000)
    ok(o60.some(d => d > 0.01) && o240.every((d, i) => Math.abs(d - 4 * o60[i]) < 1e-9), `${k}: the trail grows in proportion to speed up to 240 px/s`)
    ok(o1000.every((d, i) => Math.abs(d - o240[i]) < 1e-9), `${k}: the trail stops growing at 240 px/s`)
    // trail length per unit velocity (oldest wisp of a life sampled every 0.01 s) and climb per life (median slope of idle wisps)
    let tr = 0
    const slope: number[] = []
    for (let t = 0; t < MIST[k].life; t += 0.01) {
      const a = ext(k, 'lunge', 0, t), b = ext(k, 'lunge', 100, t), c = ext(k, 'ring', 0, t), d = ext(k, 'ring', 0, t + 0.002)
      tr = Math.max(tr, ...a.map((e, i) => (e.x - b[i].x) / 100))
      c.forEach((e, i) => {
        slope.push((e.y - d[i].y) / 0.002 * MIST[k].life)
        if (d[i].r < e.r) ok(Math.abs(e.r - d[i].r - MIST[k].r * 0.8 * 0.002 / MIST[k].life) < 1e-8, `${k}: surviving particles shrink at a constant rate`)
        else ok(d[i].r > MIST[k].r * 0.99, `${k}: only a new life may grow`)
      })
    }
    trails.push(tr)
    rises.push(slope.sort((p, q) => p - q)[slope.length >> 1])
    ok(tr > 0.97 * MIST[k].trail && tr <= MIST[k].trail + 1e-9, `${k}: trail ${tr.toFixed(3)} s follows the profile ${MIST[k].trail}`)
    ok(Math.abs(rises[rises.length - 1] - MIST[k].rise) < 1e-6 && MIST[k].rise > 0 && MIST[k].rise <= 6, `${k}: idle wisps climb ${rises[rises.length - 1]} px per life`)
    // the death burst lies on an ellipse: 1.5 spreads wide, flattened to 0.6 of that tall (3/4 view)
    const b0 = one(k, 'dying').w, b1 = one(k, 'dying', 0, 0, (_s, m) => { m.aiT = m.aiDur }).w, B = 1.5 * MIST[k].spread
    ok(b0.every((e, i) => Math.abs(((b1[i].x - e.x) / B) ** 2 + ((b1[i].y - e.y) / (0.6 * B)) ** 2 - 1) < 1e-9), `${k}: the death burst is a 1.5-spread ellipse flattened to 0.6`)
  }
  ok(trails[1] > trails[0] * 1.3 && trails[1] > trails[2] * 1.3, `the stalker trails longest per unit velocity (${trails.map(v => v.toFixed(3))})`)
  ok(rises[2] > rises[0] && rises[2] > rises[1], `the devourer climbs highest (${rises.map(v => v.toFixed(2))})`)
}

export function run(): void {
  perKind()
  states()
  perWisp()
  dying()
  caps()
  readOnly()
}
