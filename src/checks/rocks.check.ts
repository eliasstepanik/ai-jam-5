// B9 rocks suite, part 1: independent refReachable oracle + unit cases 1-8 (architecture-rocks-2 §7). Extends rocks-unit.check.ts
// (smoke rows) and quake.check.ts; rows here cross-check every production route answer against the oracle. The property suite,
// determinism and bot are in rocks-prop.check.ts. L0-L3 imports only, DOM-free, no module-level mutable state.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { playerSources, routeDist } from '../world/route.ts'
import { clearCaches } from '../world/caches.ts'
import { commitRock, landRock, planRockFall } from '../systems/rocks.ts'
import { startRun } from '../systems/run.ts'
import { lightBeacon } from '../systems/beacon.ts'
import { parseSeed } from '../core/seed.ts'
import { caveOf } from './caves.ts'

export const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: rocks: ' + msg) }

// Independent oracle: uncapped plain BFS (own queue, own solid test from world.tiles + landed rocks, + pending rocks when
// pendingBlocks) from `sources` to the exit, extra `blocked` tiles impassable. Sources are exempt from every test (a player
// may stand in a shadow). Returns the exact shortest distance, or -1. Shares no code with world/route.ts.
export function refReachable(s: State, sources: readonly number[], pendingBlocks: boolean, blocked: readonly number[] = []): number {
  const { w, h, tiles } = s.world, n = w * h, bad = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (tiles[i] === '#') bad[i] = 1
  for (const r of s.rocks) if (r.landed || pendingBlocks) for (const i of r.tiles) bad[i] = 1
  for (const i of blocked) bad[i] = 1
  const goal = s.world.exit.ty * w + s.world.exit.tx, dist = new Int32Array(n).fill(-1), q = new Int32Array(n)
  let tail = 0
  for (const i of sources) if (i >= 0 && i < n && dist[i] < 0) { dist[i] = 0; q[tail++] = i }
  for (let head = 0; head < tail; head++) {
    const i = q[head], x = i % w
    if (i === goal) return dist[i]
    for (let k = 0; k < 4; k++) { // typed queue + inline neighbours: this oracle runs thousands of times per check
      if ((k === 0 && x === w - 1) || (k === 1 && x === 0)) continue
      const j = k === 0 ? i + 1 : k === 1 ? i - 1 : k === 2 ? i + w : i - w
      if (j < 0 || j >= n || bad[j] || dist[j] >= 0) continue
      dist[j] = dist[i] + 1
      q[tail++] = j
    }
  }
  return -1
}

// '#' wall, 'X' exit, 'P' player (tile centre), everything else floor; the Beacon sits far off the map (clear zone never binds).
export function grid(rows: string[]): State {
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

const wall = (n: number): string => '#'.repeat(n)
const at = (s: State, x: number, y: number): number => y * s.world.w + x
const ptile = (s: State): number => Math.floor(s.player.y / 32) * s.world.w + Math.floor(s.player.x / 32)
const corridor = (): State => grid([wall(30), '#X' + '.'.repeat(26) + 'P#', wall(30)])
function ring(): State {
  const rows = [wall(30), '#X' + '.'.repeat(26) + 'P#']
  for (let y = 2; y <= 12; y++) rows.push('#.' + '#'.repeat(26) + '.#')
  rows.push('#' + '.'.repeat(28) + '#', wall(30))
  return grid(rows)
}
const plans = (s: State, n: number): NonNullable<ReturnType<typeof planRockFall>>[] => {
  const out = []
  for (let i = 0; i < n; i++) { const p = planRockFall(s); if (p) out.push(p) }
  return out
}

// Cases 1 + 2: every planned footprint keeps the oracle route alive, with pending shadows blocking.
function planRoutes(): void {
  const c = corridor()
  c.player.x = 20 * 32 + 16
  const cp = plans(c, 300)
  ok(cp.length > 0, 'case 1 corridor: plans exist')
  for (const p of cp) ok(refReachable(c, [ptile(c)], true, p.tiles) >= 0, 'case 1 corridor: plan keeps the oracle route, tile ' + p.tx)
  const r = ring()
  commitRock(r, { tx: 15, ty: 1, size: 1, tiles: [at(r, 15, 1)], x: 15 * 32 + 16, y: 48 })
  ok(refReachable(r, [ptile(r)], true) === 51, 'case 2 loop: pending on A leaves only route B (51 steps, oracle)')
  const rp = plans(r, 300)
  ok(rp.length > 0, 'case 2 loop: plans exist beside the pending shadow')
  for (const p of rp) ok(refReachable(r, [ptile(r)], true, p.tiles) >= 0, 'case 2 loop: plan never cuts route B, tile ' + p.tx + ',' + p.ty)
}

// Case 3: pocket race. The player slipped past the shadow; landing would trap him: cancel, and the oracle agrees it would have.
function pocket(): void {
  const c = corridor()
  const r = commitRock(c, { tx: 10, ty: 1, size: 1, tiles: [at(c, 10, 1)], x: 10 * 32 + 16, y: 48 })
  ok(refReachable(c, [ptile(c)], false, r.tiles) === -1, 'case 3: landing would disconnect (oracle)')
  ok(landRock(c, r) === 1 && !r.landed && c.rocks.length === 0, 'case 3: cancelled with one BFS')
  ok(c.world.pendingSig === 2 && c.world.solidSig === 0, 'case 3: cancel bumps pendingSig only')
  ok(refReachable(c, [ptile(c)], false) === 27, 'case 3: route intact afterwards (oracle)')
}

// Case 4: a 2x2 over a 2-wide mouth shrinks to the far tile, and the oracle confirms what is left is reachable.
function shrink(): void {
  const s = grid([wall(30), '#X' + '.'.repeat(26) + 'P#', '#' + '.'.repeat(28) + '#', wall(30)])
  const tiles = [at(s, 10, 1), at(s, 11, 1), at(s, 10, 2), at(s, 11, 2)]
  ok(refReachable(s, [ptile(s)], false, tiles) === -1, 'case 4: the full 2x2 would seal the mouth (oracle)')
  const r = commitRock(s, { tx: 10, ty: 1, size: 2, tiles, x: 11 * 32, y: 64 })
  landRock(s, r)
  ok(r.shrunk === true && r.size === 1 && r.landed && s.rocks.length === 1, 'case 4: shrunk to 1x1')
  ok(refReachable(s, [ptile(s)], false) >= 0, 'case 4: route survives the shrunk rock (oracle)')
}

// Case 5: player under a 1x1: damage / push / invuln variants. Roll i-frames never dodge, hurtT blocks only the damage.
function underPlayer(): void {
  for (const mode of ['plain', 'roll', 'hurt', 'god'] as const) {
    const s = corridor()
    s.player.x = 10 * 32 + 16
    s.player.hp = 5
    if (mode === 'roll') s.player.roll.invuln = 0.3
    if (mode === 'hurt') s.player.hurtT = 0.4
    if (mode === 'god') s.debug.god = true
    const r = commitRock(s, { tx: 10, ty: 1, size: 1, tiles: [at(s, 10, 1)], x: 10 * 32 + 16, y: 48 })
    ok(landRock(s, r) >= 0 && r.landed, 'case 5 ' + mode + ': lands')
    ok(s.player.hp === (mode === 'hurt' || mode === 'god' ? 5 : 5 - T.rocks.damageHp), 'case 5 ' + mode + ': hp ' + s.player.hp)
    ok(s.player.x < 10 * 32 - 9 || s.player.x > 11 * 32 + 9, 'case 5 ' + mode + ': pushed clear of the footprint')
    ok(refReachable(s, [ptile(s)], false) >= 0, 'case 5 ' + mode + ': pushed player still reaches the exit (oracle)')
  }
}

// Case 6: diagonal gap `.#/#.` is no passage for a 4-connected route (production and oracle agree).
function diagonal(): void {
  const s = grid([wall(5), '#P###', '##X##', wall(5)])
  ok(routeDist(s, [], playerSources(s, []), true) === -1 && refReachable(s, [ptile(s)], false) === -1, 'case 6: diagonal gap is shut')
  const open = grid([wall(5), '#P.##', '##X##', wall(5)]) // one orthogonal bridge opens it
  ok(routeDist(open, [], playerSources(open, []), true) === refReachable(open, [ptile(open)], false), 'case 6: bridge reachable, same distance')
}

// Case 7: 1000 plans on a real cave never touch the exit zone (Chebyshev 5) or the Beacon zone (6, or its room).
function clearZones(): void {
  const s = init()
  startRun(s, '5', caveOf(parseSeed('5')))
  s.settings.loaded = true
  lightBeacon(s)
  const { exit: ex, beacon: bc } = s.world, w = s.world.w, spots = [ex, bc, { tx: (ex.tx + bc.tx) >> 1, ty: (ex.ty + bc.ty) >> 1 }]
  let seen = 0
  for (let k = 0; k < 1000; k++) {
    if (k % 100 === 0) { const sp = spots[(k / 100) % 3]; s.player.x = sp.tx * 32 + 16; s.player.y = sp.ty * 32 + 16 }
    const p = planRockFall(s)
    if (!p) continue
    seen++
    for (const i of p.tiles) {
      const x = i % w, y = Math.floor(i / w)
      ok(Math.max(Math.abs(x - ex.tx), Math.abs(y - ex.ty)) > T.rocks.exitClearTiles, 'case 7: plan ' + k + ' inside the exit zone')
      ok(Math.max(Math.abs(x - bc.tx), Math.abs(y - bc.ty)) > T.rocks.beaconClearTiles, 'case 7: plan ' + k + ' inside the Beacon zone')
    }
  }
  ok(seen > 500, 'case 7: most of the 1000 plans are placed, got ' + seen)
}

// Case 8: routeDist honours the blocked footprint, never undercuts the oracle, and returns -1 on early exit / visit cap.
function distances(): void {
  const r = ring()
  const a = [at(r, 15, 1)], src = playerSources(r, [])
  const exact = refReachable(r, [ptile(r)], false, a)
  ok(exact === 51, 'case 8: oracle detour 51, got ' + exact)
  const d = routeDist(r, a, src, false)
  ok(d >= exact && d >= 0, 'case 8: loop routeDist ' + d + ' >= oracle ' + exact)
  // Early exit: blocked tile behind the player has a larger E than the source, so the answer is E[source] (real length, exact here).
  const c = corridor()
  c.player.x = 20 * 32 + 16
  ok(routeDist(c, [at(c, 25, 1)], playerSources(c, []), false) === refReachable(c, [20 + 30], false, [at(c, 25, 1)]), 'case 8: early exit equals oracle')
  // Visit cap: 320x240 open floor, exit (0,0), blocked tile 3 (the cap bites before the BFS gets round it); oracle reaches it.
  const rows = Array.from({ length: 240 }, () => '.'.repeat(320))
  rows[0] = 'X' + rows[0].slice(1)
  rows[239] = rows[239].slice(0, 319) + 'P'
  const big = grid(rows)
  const blocked = [3]
  ok(refReachable(big, [ptile(big)], false, blocked) === 319 + 239, 'case 8: oracle reaches the exit across the open floor')
  ok(routeDist(big, blocked, playerSources(big, []), false) === -1, 'case 8: visit cap returns -1 while the oracle is reachable')
}

// Case 9: planner filters. Detour cap (a plan may lengthen the oracle route by at most max(12, 50%)), unreachable floor (E < 0)
// never gets a rock, and the landed / pending caps are exact (199 landed and 3 pending still plan, 200 and 4 do not).
function filters(): void {
  const r = ring()
  const d0 = refReachable(r, [ptile(r)], false), cap = Math.max(T.rocks.detourMaxTiles, Math.floor(T.rocks.detourMaxFrac * d0))
  ok(d0 === 27 && refReachable(r, [ptile(r)], false, [at(r, 15, 1)]) - d0 > cap, 'case 9: fixture: blocking route A costs more than the cap')
  const rp = plans(r, 400)
  ok(rp.length > 0, 'case 9 detour: plans exist')
  for (const p of rp) ok(refReachable(r, [ptile(r)], false, p.tiles) - d0 <= cap, 'case 9 detour: plan ' + p.tx + ',' + p.ty + ' exceeds the cap')
  const rows = [wall(30), '#X' + '.'.repeat(26) + 'P#', wall(30)]
  for (let y = 0; y < 6; y++) rows.push('#' + '.'.repeat(28) + '#')
  const sealed = grid([...rows, wall(30)]) // rows 3..8 form a floor pocket that no route reaches (E < 0)
  sealed.player.x = 20 * 32 + 16
  for (const p of plans(sealed, 400)) ok(p.ty < 3, 'case 9 sealed: plan ' + p.tx + ',' + p.ty + ' on a tile with no route')
  const mk = (landed: number, pending: number): State => {
    const c = corridor()
    c.player.x = 20 * 32 + 16
    for (let i = 0; i < landed + pending; i++) c.rocks.push({ id: i, x: 0, y: 0, size: 1, tiles: [], t: i < landed ? 0 : 1, landed: i < landed, hit: i < landed, shrunk: false })
    clearCaches()
    return c
  }
  ok(plans(mk(T.escape.rocksMax - 1, 0), 300).length > 0, 'case 9 cap: 199 landed still plan')
  ok(plans(mk(T.escape.rocksMax, 0), 300).length === 0, 'case 9 cap: 200 landed plan nothing')
  ok(plans(mk(0, T.rocks.pendingMax - 1), 300).length > 0, 'case 9 cap: 3 pending still plan')
  ok(plans(mk(0, T.rocks.pendingMax), 300).length === 0, 'case 9 cap: 4 pending plan nothing')
}

export function run(): void {
  planRoutes()
  pocket()
  shrink()
  underPlayer()
  diagonal()
  clearZones()
  distances()
  filters()
  console.log('rocks check ok')
}
