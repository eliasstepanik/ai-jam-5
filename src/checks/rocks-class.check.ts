// Per-depth-class rock ramp (R-164): rampOf unit rows, the rocks.ts p2 size odds (seen through planRockFall, whose private p2 picks
// 1x1 vs 2x2) and the quake.ts rate (seen through the quakeT that stepQuake arms). Class 3 / undefined = T.rocks.rampS = 80.
// L0-L3 imports only; DOM-free; every scenario builds its own State; no module-level mutable state.
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { stepQuake } from '../systems/quake.ts'
import { planRockFall, rampOf } from '../systems/rocks.ts'
import { grid } from './rocks.check.ts'

const DT = 1 / 60
const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: rocks-class: ' + msg) }
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9

// Open 40x20 room, exit far left, player far right: every candidate footprint is placeable, so size is the only free variable.
function room(cls: number | undefined, escapeT: number): State {
  const rows = ['#'.repeat(40)]
  for (let y = 1; y < 19; y++) rows.push(y === 9 ? '#X' + '.'.repeat(36) + 'P#' : '#' + '.'.repeat(38) + '#')
  rows.push('#'.repeat(40))
  const s = grid(rows)
  s.world.depthClass = cls
  s.director.escapeT = escapeT
  return s
}

// Signature of N consecutive plans (planRockFall never commits, so the world stays fixed; the gameplay rng advances 40 draws per call).
function plans(cls: number | undefined, escapeT: number, n: number): { sig: string; big: number; made: number } {
  const s = room(cls, escapeT), out: string[] = []
  let big = 0
  for (let i = 0; i < n; i++) {
    const p = planRockFall(s)
    if (!p) continue
    if (p.size === 2) big++
    out.push(p.tx + ',' + p.ty + ',' + p.size)
  }
  return { sig: out.join(';'), big, made: out.length }
}

// quakeT that stepQuake arms on its first planning step, and the 0.75..1.25 jitter draw behind it (quakeT = u / rate).
function armed(cls: number | undefined): { quakeT: number; u: (rate: number) => number } {
  const s = room(cls, 40 - DT)
  s.director.quakeT = 0
  stepQuake(s, DT)
  ok(s.rocks.length === 1, 'stepQuake committed one rock in the open room (class ' + cls + ')')
  ok(near(s.director.escapeT, 40), 'escape clock advanced by dt')
  return { quakeT: s.director.quakeT, u: (rate) => s.director.quakeT * rate }
}

export function run(): void {
  const { rateStart, rateEnd, rampS, p2Start, p2End } = T.rocks
  ok(rampS === 80, 'T.rocks.rampS is the class-3 value 80')

  // (a) rampOf: per-class length, class 3 and undefined share T.rocks.rampS, clamped to 0..1.
  const len: [number | undefined, number][] = [[1, 40], [2, 55], [3, 80], [undefined, 80], [4, 105]]
  for (const [c, l] of len) {
    ok(rampOf(0, c) === 0, 'ramp 0 at escapeT 0, class ' + c)
    ok(near(rampOf(40, c), Math.min(1, 40 / l)), 'ramp at escapeT 40, class ' + c)
    ok(rampOf(l, c) === 1, 'exact class boundary saturates, class ' + c)
    ok(near(rampOf(l / 2, c), 0.5), 'half boundary is 0.5, class ' + c)
    ok(rampOf(l - 1e-6, c) < 1, 'just below the boundary is below 1, class ' + c)
    ok(rampOf(1e9, c) === 1, 'huge escapeT clamps to 1, class ' + c)
  }
  ok(rampOf(40, 1) === 1, 'class 1 saturated at 40')
  ok(near(rampOf(40, 2), 40 / 55), 'class 2 at 40 is 40/55')
  ok(rampOf(40, 3) === 0.5 && rampOf(40, undefined) === 0.5, 'class 3 and undefined at 40 are 0.5')
  ok(near(rampOf(40, 4), 40 / 105), 'class 4 at 40 is 40/105')

  // (b) rocks.ts p2: at escapeT 40 class 1 is saturated (p2End), class 3 / undefined sit halfway (p2Start..p2End).
  const N = 300
  const sat = plans(3, 1e9, N), c1 = plans(1, 40, N), c3 = plans(3, 40, N), cu = plans(undefined, 40, N), c0 = plans(1, 0, N)
  ok(sat.made === N && c1.made === N && c3.made === N, 'open room: every call yields a plan')
  ok(c1.sig === sat.sig, 'class 1 at 40 plans exactly like a saturated ramp (p2 = p2End)')
  ok(c3.sig !== c1.sig, 'class 3 at 40 differs from class 1 at 40 (M1: p2 ignoring depthClass)')
  ok(c1.big > c3.big, 'class 1 builds more 2x2 rocks than class 3 at escapeT 40: ' + c1.big + ' vs ' + c3.big)
  ok(cu.sig === c3.sig, 'undefined class plans exactly like class 3')
  ok(c0.sig === plans(3, 0, N).sig, 'escapeT 0: every class has p2Start, identical plans')
  ok(plans(2, 40, N).sig === plans(3, 40 * 80 / 55, N).sig, 'class 2 at 40 plans like class 3 at 40 * 80 / 55 (same ramp fraction)')
  ok(plans(4, 40, N).sig === plans(3, 40 * 80 / 105, N).sig, 'class 4 at 40 plans like class 3 at 40 * 80 / 105 (same ramp fraction)')
  ok(p2Start < p2End && c3.big > c0.big, 'class 3 at 40 builds more 2x2 than at escapeT 0 (p2 ramps with escapeT)')

  // (c) quake.ts rate: same seed, same world, same escapeT 40; stepQuake arms quakeT = u / rate with the same jitter u.
  const a = armed(1), b = armed(3), u = armed(undefined)
  const rate1 = rateEnd, rate3 = rateStart + (rateEnd - rateStart) * 0.5
  ok(near(a.u(rate1), b.u(rate3)), 'class 1 and class 3 draw the same jitter, so quakeT * rate matches (rate 1.6 vs 1.1)')
  const jitter = a.u(rate1)
  ok(jitter >= 0.75 && jitter <= 1.25, 'jitter in 0.75..1.25: ' + jitter)
  ok(a.quakeT >= T.rocks.minIntervalS && b.quakeT >= T.rocks.minIntervalS, 'interval above the minimum clamp')
  ok(near(a.quakeT, jitter / rate1) && near(b.quakeT, jitter / rate3), 'quakeT is jitter / rate per class')
  ok(a.quakeT < b.quakeT, 'class 1 rocks fall faster than class 3 at escapeT 40 (M2: quake rate ignoring depthClass)')
  ok(near(u.quakeT, b.quakeT), 'undefined class arms the same interval as class 3')
}
