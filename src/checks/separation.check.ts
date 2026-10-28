// Issue #113 gate-1 fix (G1-b): covers separate() in systems/monsters.ts (summed-push rewrite, chunk 40a).
// Method: shades are parked as 'stunned' with aiDur 1e9 (walks with zero velocity, perception frozen), so
// stepMonsters moves them only through separate(). Spec: docs/architecture-monsters-ai-2.md §3.4 (its
// per-pair wording is stale; the code sums pushes per shade and collides once - the code governs).
// Mutants proven RED by hand: push sign flipped, moveCircle swapped for a raw add (no wall clamp), zero-distance
// guard `L < 1e-6` changed to `L < 0`, outer pushable(a) guard dropped, inner pushable(b) guard dropped,
// constant push (no (1 - L / gap) falloff), summed push never applied, full instead of half push.
// ponytail: fixtures read geometry from tuning (radius + separationPx); upgrade: a shared checks/arena.ts.
import type { Monster, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { lightRadius } from '../systems/light.ts'
import { stepMonsters } from '../systems/monsters.ts'
import { startRun } from '../systems/run.ts'
import { circleHitsSolid } from '../world/collide.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const R = T.monsters.lurker.radiusPx
const GAP = 2 * R + T.ai.separationPx // push stops here (asymptotically)
const EPS = 1e-9

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

// Open floor, descent, director silenced, player mid-map; hash distinct per fixture (solid cache key).
function arena(hash: number, wallTx = -1): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.meta.phase = 'descent'
  s.director.spawnT = 1e9
  Object.assign(s, { monsters: [], pickups: [] })
  const { w, h } = s.world
  s.world.tiles = wallTx < 0 ? '.'.repeat(w * h) : ('.'.repeat(wallTx) + '#' + '.'.repeat(w - wallTx - 1)).repeat(h)
  s.world.tilesHash = hash
  s.player.x = w * 16
  s.player.y = h * 16
  return s
}

// A parked shade: only separate() can move it.
function park(s: State, x: number, y: number): Monster {
  const m = spawnMonster(s, 'lurker', x, y, lightRadius(s))
  m.ai = 'stunned'
  m.aiDur = 1e9
  m.awareness = 'hunting'
  return m
}

const dist = (a: Monster, b: Monster): number => Math.hypot(a.x - b.x, a.y - b.y)
const minPair = (ms: Monster[]): number => {
  let d = Infinity
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) d = Math.min(d, dist(ms[i], ms[j]))
  return d
}
const trace = (s: State, steps: number): string => {
  const out: string[] = []
  for (let k = 0; k < steps; k++) {
    stepMonsters(s, DT)
    out.push(s.monsters.map(m => m.x + ',' + m.y).join(';'))
  }
  return out.join('|')
}

// (1) a pair strictly separates every step, then sits at the separation gap.
function pairSeparates(): void {
  const s = arena(7301)
  const cx = s.player.x + 300, cy = s.player.y
  const a = park(s, cx - 5, cy), b = park(s, cx + 5, cy)
  let prev = dist(a, b)
  ok(prev < GAP, 'fixture: pair starts overlapping')
  stepMonsters(s, DT) // first step: each shade takes half of separationPxS * (1 - L / gap) * dt
  const half = 0.5 * T.ai.separationPxS * (1 - prev / GAP) * DT
  ok(Math.abs((cx - 5) - a.x - half) < 1e-9 && Math.abs(b.x - (cx + 5) - half) < 1e-9, 'first push is half the pair push per shade')
  prev = dist(a, b)
  for (let k = 0; k < 400; k++) {
    stepMonsters(s, DT)
    const d = dist(a, b)
    ok(d > prev || (k >= 100 && d >= prev), 'pair distance grows each step (step ' + k + ': ' + prev + ' -> ' + d + ')')
    ok(Math.abs(a.y - cy) < EPS && Math.abs(b.y - cy) < EPS, 'push stays on the pair axis')
    prev = d
  }
  ok(prev >= GAP - 0.01 && prev <= GAP + EPS, 'pair settles at the gap ' + GAP + ' (got ' + prev + ')')
  ok(Math.abs((a.x + b.x) / 2 - cx) < 1e-6, 'push is symmetric: midpoint stays put')
}

// (1b) a 3-shade cluster is pushed apart by the summed pushes.
function clusterSeparates(): void {
  const s = arena(7302)
  const cx = s.player.x + 300, cy = s.player.y
  const ms = [park(s, cx, cy - 4), park(s, cx - 4, cy + 3), park(s, cx + 4, cy + 3)]
  const before = minPair(ms)
  ok(before < 10, 'fixture: cluster starts tight')
  let prev = before
  for (let k = 0; k < 60; k++) {
    stepMonsters(s, DT)
    const d = minPair(ms)
    ok(d > prev, 'cluster min distance grows each step (step ' + k + ')')
    prev = d
  }
  for (let k = 0; k < 600; k++) stepMonsters(s, DT)
  ok(minPair(ms) >= GAP - 0.05, 'cluster reaches the gap (min ' + minPair(ms) + ')')
}

// (2) deterministic and order-independent: same setup twice is identical; swapping the shade order
// gives the same positions per place and opposite displacements.
function symmetric(): void {
  const run = (swap: boolean): { t: string, xs: number[] } => {
    const s = arena(7303)
    const cx = s.player.x + 300, cy = s.player.y
    const pts: [number, number][] = [[cx - 3, cy], [cx + 4, cy + 2]]
    if (swap) pts.reverse()
    const ms = pts.map(([x, y]) => park(s, x, y))
    const t = trace(s, 30)
    return { t, xs: swap ? [ms[1].x, ms[0].x] : [ms[0].x, ms[1].x] }
  }
  const a = run(false), b = run(false), c = run(true)
  ok(a.t === b.t, 'same setup twice: identical trace')
  ok(a.xs.every((x, i) => Math.abs(x - c.xs[i]) < 1e-9), 'swapped shade order: same final positions')
  ok(a.xs[0] < a.xs[1] && a.xs[1] - a.xs[0] > 7.07, 'left shade stays left and the pair opened')
}

// (3) pushing a cluster into a wall never puts a shade inside a solid tile.
function wallClamp(): void {
  const s0 = arena(7304)
  const wallTx = Math.floor((s0.player.x + 300) / 32) + 1
  const s = arena(7305, wallTx)
  const edge = wallTx * 32, cy = s.player.y
  const ms = [park(s, edge - R - 1, cy), park(s, edge - R - 8, cy), park(s, edge - R - 4, cy + 6)]
  for (const m of ms) ok(!circleHitsSolid(s, m.x, m.y, R), 'fixture: shade starts clear of the wall')
  for (let k = 0; k < 300; k++) {
    stepMonsters(s, DT)
    for (const m of ms) ok(!circleHitsSolid(s, m.x, m.y, R) && m.x + R <= edge + EPS, 'shade clear of the wall (step ' + k + ')')
  }
  ok(minPair(ms) > 8, 'cluster still opened along the wall')
}

// (4) coincident shades: no NaN / Infinity, no throw (moveCircle rejects non-finite input).
function coincident(): void {
  const s = arena(7306)
  const cx = s.player.x + 300, cy = s.player.y
  const ms = [park(s, cx, cy), park(s, cx, cy), park(s, cx + 6, cy)]
  for (let k = 0; k < 120; k++) {
    stepMonsters(s, DT)
    for (const m of ms) ok(Number.isFinite(m.x) && Number.isFinite(m.y), 'finite position with a coincident pair (step ' + k + ')')
  }
}

// (5) a windup shade is not pushable, and neither is its neighbour pair-wise. Both orders: windup at index 0
// exercises the outer pushable(a) guard in separate(), windup at index 1 the inner pushable(b) guard.
// (lunge / dying share pushable() but are not covered here: only windup is asserted.)
function unpushable(windupFirst: boolean): void {
  const s = arena(windupFirst ? 7307 : 7308)
  const cx = s.player.x + 300, cy = s.player.y
  const a = park(s, cx - 3, cy), b = park(s, cx + 3, cy)
  const w = windupFirst ? a : b
  w.ai = 'windup'
  w.aiDur = 1e9
  for (let k = 0; k < 30; k++) stepMonsters(s, DT)
  const who = windupFirst ? 'windup at index 0' : 'windup at index 1'
  ok(a.x === cx - 3 && b.x === cx + 3 && a.y === cy && b.y === cy, 'windup shade pair is left alone (' + who + ')')
}

export function run(): void {
  pairSeparates()
  clusterSeparates()
  symmetric()
  wallClamp()
  coincident()
  unpushable(true)
  unpushable(false)
}
