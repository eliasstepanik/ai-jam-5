// A7 score checks. Spec: docs/architecture-scoring-and-save.md §2/§4/§7, architecture-tuning-2.md §7 (T.score pinned to the approved
// literals), R-080 (one score.check.ts, also asserts the 5488 worked win), R-040 (run(), no side effect on import, DOM-free, no node:).
// ponytail: the spec's "Best round trip through a fake store with a throwing setItem" is NOT here: src/core/storage.ts (B7) is not on
// master, so there is nothing to call. B7 adds that block to this file together with commitBest.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { DEPTH_MAX, computeScore, depthOf, zoneOfDepth } from '../core/score.ts'
import { T } from '../core/tuning.ts'
import { endRun } from '../systems/run.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: score: ' + msg)
}

// scoring-and-save §4 rows A-I: [depth, won, seconds, minerals used, hp left, depth pts, win, time, minerals, hp, score]. Literals from the spec table.
const ROWS: readonly (readonly [string, number, boolean, number, number, number, number, number, number, number, number, number])[] = [
  ['A', 15, false, 115, 1, 0, 1500, 0, 485, 25, 0, 2010],
  ['B', 25, false, 193, 3, 0, 2500, 0, 407, 75, 0, 2982],
  ['C', 35, false, 270, 5, 0, 3500, 0, 330, 125, 0, 3955],
  ['D', 40, false, 380, 6, 0, 4000, 0, 220, 150, 0, 4370],
  ['E', 40, true, 480, 6, 2, 4000, 1000, 120, 150, 100, 5370],
  ['F', 40, true, 417, 6, 3, 4000, 1000, 183, 150, 150, 5483],
  ['G', 40, true, 360, 8, 3, 4000, 1000, 240, 200, 150, 5590],
  ['H', 40, true, 307, 12, 5, 4000, 1000, 293, 300, 250, 5843],
  ['I', 0, false, 25, 0, 0, 0, 0, 575, 0, 0, 575],
]

function formula(): void {
  const w = T.score
  ok(w.depthPts === 100 && w.winPts === 1000 && w.timeCapS === 600 && w.mineralPts === 25 && w.hpPts === 50, 'T.score equals the approved literals 100/1000/600/25/50')
  let prev = -1
  for (const [name, depth, won, seconds, mineralsUsed, hpLeft, dp, win, time, min, hp, total] of ROWS) {
    const p = computeScore({ depth, won, seconds, mineralsUsed, hpLeft })
    ok(p.depth === dp && p.win === win && p.time === time && p.minerals === min && p.hp === hp, `row ${name}: parts ${JSON.stringify(p)}`)
    ok(p.total === total, `row ${name}: total ${p.total} === ${total}`)
    if (name !== 'I') { ok(total > prev, `row ${name}: score ordering A < B < ... < H`); prev = total }
  }
  ok(computeScore({ depth: 40, won: true, seconds: 412, mineralsUsed: 6, hpLeft: 3 }).total === 5488, 'worked win at 412 s, depth 40, 6 minerals, 3 HP scores 5488')
  ok(computeScore({ depth: 0, won: false, seconds: 9999, mineralsUsed: 0, hpLeft: 0 }).time === 0, 'time term is clamped at 0 past the 600 s cap')
  ok(computeScore({ depth: 40, won: true, seconds: 565, mineralsUsed: 0, hpLeft: 1 }).total === 5085, 'worst win (565 s, hp 1, 0 minerals) scores 5085')
}

function depthChecks(): void {
  ok(DEPTH_MAX === 40, 'DEPTH_MAX is 40')
  for (const n of [459, 510, 600, 690]) {
    ok(depthOf(0, n) === 0, `depthOf(0, ${n}) === 0`)
    ok(depthOf(n, n) === 40, `depthOf(${n}, ${n}) === 40`)
    ok(depthOf(-1, n) === 0, `depthOf(-1, ${n}) === 0 (unreachable)`)
    ok(depthOf(n * 2, n) === 40, `depthOf(2n, ${n}) clamps to 40`)
    let prev = 0
    for (let d = 0; d <= n; d++) {
      const v = depthOf(d, n)
      ok(Number.isInteger(v) && v >= prev && v <= 40, `depthOf(${d}, ${n}) = ${v} is an int, monotonic, in 0..40`)
      prev = v
    }
  }
  ok(depthOf(5, 0) === 0 && depthOf(5, -3) === 0, 'depthOf with beaconDist <= 0 is 0')
}

function zoneChecks(): void {
  const want: readonly (readonly [number, number])[] = [[0, 1], [9, 1], [10, 2], [19, 2], [20, 3], [29, 3], [30, 4], [40, 4]]
  for (const [depth, zone] of want) ok(zoneOfDepth(depth) === zone, `zoneOfDepth(${depth}) === ${zone}, got ${zoneOfDepth(depth)}`)
}

// endRun (A29) must route through computeScore: seconds = floor(steps / 60), hp counts only on a win.
function endRunChecks(): void {
  const mk = (): State => {
    const s = init()
    s.player.stats.maxDepth = 40
    s.player.stats.mineralsUsed = 6
    s.player.hp = 3
    s.meta.steps = 412 * 60 + 59 // floor(steps / 60) = 412
    return s
  }
  const won = mk()
  endRun(won, true)
  ok(won.result !== null && won.result.parts.total === 5488 && won.result.seconds === 412 && won.meta.screen === 'won', 'endRun(win) scores the 5488 worked win')
  const dead = mk()
  endRun(dead, false)
  ok(dead.result !== null && dead.result.hpLeft === 0 && dead.result.parts.total === 4000 + 188 + 150 && dead.meta.screen === 'dead', 'endRun(death) drops the win bonus and the HP term')
}

export function run(): void {
  formula()
  depthChecks()
  zoneChecks()
  endRunChecks()
}
