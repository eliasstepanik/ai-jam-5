// Smoke rows for src/systems/rocks.ts (B2r): plan filters, pending blocking, detour cap, landing, shrink, cancel, push-out.
// The independent-oracle property suite and mutants are B9 (rocks.check.ts). DOM-free; every scenario builds its own State.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { fnv1a, rand } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { clearCaches } from '../world/caches.ts'
import { commitRock, cosmeticRockLand, landRock, planRockFall } from '../systems/rocks.ts'

function ok(cond: boolean, msg: string): void { if (!cond) throw new Error('rocks-unit check: ' + msg) }

// '#' wall, 'X' exit, 'P' player (tile centre), everything else floor. The Beacon sits far off the map (clear zone never binds).
function grid(rows: string[]): State {
  const s = init(), w = rows[0].length, raw = rows.join(''), x = raw.indexOf('X'), p = raw.indexOf('P')
  Object.assign(s.world, { w, h: rows.length, tiles: raw.replace('X', '.').replace('P', '.'),
    entrance: { tx: x % w, ty: Math.floor(x / w) }, exit: { tx: x % w, ty: Math.floor(x / w) }, beacon: { tx: 900, ty: 900 } })
  s.world.tilesHash = fnv1a(s.world.tiles)
  s.meta.runId = 1
  s.meta.phase = 'escape'
  s.player.x = (p % w) * 32 + 16
  s.player.y = Math.floor(p / w) * 32 + 16
  clearCaches()
  return s
}

const at = (s: State, x: number, y: number): number => y * s.world.w + x
const wall = (n: number): string => '#'.repeat(n)

// Corridor of 28 floor tiles, exit at the west end, player at the east end.
const corridor = (): State => grid([wall(30), '#X' + '.'.repeat(26) + 'P#', wall(30)])

// Ring: short route A along row 1 (27 steps), long route B around rows 2..12 and row 13 (51 steps).
function ring(): State {
  const rows = [wall(30), '#X' + '.'.repeat(26) + 'P#']
  for (let y = 2; y <= 12; y++) rows.push('#.' + '#'.repeat(26) + '.#')
  rows.push('#' + '.'.repeat(28) + '#', wall(30))
  return grid(rows)
}

function planned(s: State, n: number): { tx: number; ty: number; tiles: number[] }[] {
  const out = []
  for (let i = 0; i < n; i++) { const p = planRockFall(s); if (p) out.push(p) }
  return out
}

function planning(): void {
  // Player mid-corridor (tile 20): everything west is the only route, so rocks may only land behind him (east side).
  const mid = (): State => { const s = corridor(); s.player.x = 20 * 32 + 16; return s }
  const s = mid()
  const g0 = s.rng.gameplay
  planRockFall(s)
  const ref = init(); ref.rng.gameplay = g0
  for (let i = 0; i < 40; i++) rand(ref, 'gameplay')
  ok(s.rng.gameplay === ref.rng.gameplay, 'planRockFall draws exactly 40 gameplay values')
  const plans = planned(mid(), 300)
  ok(plans.length > 0, 'corridor: some rock is planned behind the player')
  for (const p of plans) ok(p.tiles.length === 1 && p.tx >= 22, 'corridor: only behind the player, outside the 26 px gap, got tx ' + p.tx)
  // Exit clear zone: nothing within Chebyshev 5 of the exit, even when the whole map is otherwise legal.
  const o = grid([wall(30), ...Array.from({ length: 12 }, () => '#' + '.'.repeat(28) + '#'), wall(30)])
  o.world.exit = { tx: 1, ty: 1 }
  o.player.x = 9 * 32 + 16 // close to the exit so route and ambient candidates reach the boundary
  o.player.y = 6 * 32 + 16
  let edge = 0
  for (const p of planned(o, 2000)) {
    const d = Math.max(...p.tiles.map((i) => Math.max((i % 30) - 1, Math.floor(i / 30) - 1)))
    ok(Math.min(...p.tiles.map((i) => Math.max((i % 30) - 1, Math.floor(i / 30) - 1))) > T.rocks.exitClearTiles, 'exit clear zone respected')
    if (d === T.rocks.exitClearTiles + 1) edge++
  }
  ok(edge > 0, 'fixture reaches the clear-zone boundary')
}

function blocking(): void {
  // Pending shadow on route A makes route B the only one: nothing may land on B's corridor stretch (pending blocks).
  const s = ring()
  commitRock(s, { tx: 15, ty: 1, size: 1, tiles: [at(s, 15, 1)], x: 15 * 32 + 16, y: 48 })
  ok(s.world.pendingSig === 1 && s.rocks.length === 1 && s.rocks[0].t === T.escape.rockWarnS, 'commitRock pushes the pending rock')
  ok(s.fx.events.some((e) => e.kind === 'rockWarn'), 'commitRock emits rockWarn')
  for (const p of planned(s, 300)) {
    ok(!p.tiles.includes(at(s, 15, 1)), 'a pending footprint is never planned again')
    ok(!(p.tx >= 2 && p.tx <= 27 && p.ty === 13) && !(p.ty >= 2 && p.ty <= 12 && (p.tx === 1 || p.tx === 28)), 'pending blocks: last route B never cut')
  }
  // Detour cap: with A clear, every rock on A would push the player onto the 51-step route B (detour 24 > max(12, 13)).
  const d = ring()
  for (const p of planned(d, 300)) ok(!(p.ty === 1 && p.tx >= 7 && p.tx <= 27), 'detour cap: no rock on the short route')
}

function limits(): void {
  const s = corridor()
  for (let i = 0; i < T.rocks.pendingMax; i++) s.rocks.push({ id: i + 1, x: 0, y: 0, size: 1, tiles: [at(s, 2, 1)], t: 1, landed: false, hit: false, shrunk: false })
  ok(planRockFall(s) === null, 'pending cap returns null')
  const c = corridor()
  for (let i = 0; i < T.escape.rocksMax; i++) c.rocks.push({ id: i + 1, x: 0, y: 0, size: 1, tiles: [0], t: 0, landed: true, hit: true, shrunk: false })
  const g = c.rng.gameplay
  ok(planRockFall(c) === null && c.rng.gameplay === g, 'landed cap returns null without a draw')
  const cos = c.rng.cosmetic
  cosmeticRockLand(c)
  ok(c.rng.cosmetic !== cos && c.rng.gameplay === g, 'cosmetic puff uses the cosmetic stream only')
}

function landing(): void {
  const s = ring()
  const m = spawnMonster(s, 'lurker', 15 * 32 + 16, 48, 100)
  const plan = { tx: 15, ty: 1, size: 1 as const, tiles: [at(s, 15, 1)], x: 15 * 32 + 16, y: 48 }
  const r = commitRock(s, plan)
  const solid0 = s.world.solidSig, pend0 = s.world.pendingSig
  ok(landRock(s, r) === 0, 'route survives via B: fast pass, no BFS')
  ok(r.landed && r.hit && !r.shrunk, 'rock landed')
  ok(s.world.solidSig === solid0 + 1 && s.world.pendingSig === pend0 + 1, 'solidSig and pendingSig bump on landing')
  ok(m.ai === 'dying' && s.player.stats.kills === 0, 'monster beneath dies without kill credit')
  const ev = s.fx.events.find((e) => e.kind === 'rockLand')
  ok(!!ev && ev.a === 1 && s.fx.shake > 0, 'rockLand emitted with size and shake')

  // Pocket race: the player ran past the shadow into the corridor; landing would trap him -> cancel.
  const c = corridor()
  const cr = commitRock(c, { tx: 10, ty: 1, size: 1, tiles: [at(c, 10, 1)], x: 10 * 32 + 16, y: 48 })
  ok(landRock(c, cr) === 1, 'pocket race: one routeDist run')
  ok(c.rocks.length === 0 && !cr.landed && c.fx.events.some((e) => e.kind === 'rockLand' && e.a === 0), 'cancelled: spliced and dust-only rockLand')
}

function shrinking(): void {
  const rows = [wall(30), '#X' + '.'.repeat(26) + 'P#', '#' + '.'.repeat(28) + '#', wall(30)]
  const s = grid(rows)
  const tiles = [at(s, 10, 1), at(s, 11, 1), at(s, 10, 2), at(s, 11, 2)]
  const r = commitRock(s, { tx: 10, ty: 1, size: 2, tiles, x: 11 * 32, y: 2 * 32 })
  ok(landRock(s, r) >= 1, 'two-wide mouth: BFS used')
  ok(r.landed && r.size === 1 && r.shrunk && r.tiles.length === 1 && s.rocks.length === 1, '2x2 shrinks to 1x1 and lands')
  ok(r.x === (r.tiles[0] % 30) * 32 + 16, 'shrunk rock is recentred')
}

function underPlayer(): void {
  for (const mode of ['plain', 'roll', 'hurt'] as const) {
    const s = corridor()
    s.player.x = 10 * 32 + 16
    s.player.hp = 5
    if (mode === 'roll') s.player.roll.invuln = 0.3
    if (mode === 'hurt') s.player.hurtT = 0.4
    const r = commitRock(s, { tx: 10, ty: 1, size: 1, tiles: [at(s, 10, 1)], x: 10 * 32 + 16, y: 48 })
    landRock(s, r)
    ok(s.player.hp === (mode === 'hurt' ? 5 : 4), 'under a rock (' + mode + '): hp ' + s.player.hp)
    ok(r.landed && Math.abs(s.player.x - (10 * 32 + 16)) >= 6, 'under a rock (' + mode + '): player pushed out')
    ok(s.player.x < 10 * 32 - 9 || s.player.x > 11 * 32 + 9, 'under a rock (' + mode + '): circle clear of the footprint')
  }
}

export function run(): void {
  planning()
  blocking()
  limits()
  landing()
  shrinking()
  underPlayer()
  console.log('rocks-unit check ok')
}
