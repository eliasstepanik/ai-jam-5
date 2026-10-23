// Unit rows for src/world/route.ts (B2a). The property test against an independent oracle lives in rocks.check.ts (B9).
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { clearCaches, getExitDist } from '../world/caches.ts'
import { downhill, exitHeading, playerSources, routeDist, ROUTE_VISIT_MAX } from '../world/route.ts'

function ok(cond: boolean, msg: string): void { if (!cond) throw new Error('route check: ' + msg) }
const eq = (a: unknown, b: unknown, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), msg + ': ' + JSON.stringify(a))

// '#' wall, 'X' exit, 'P' player (tile centre), everything else floor.
function grid(rows: string[]): State {
  const s = init(), w = rows[0].length, raw = rows.join(''), x = raw.indexOf('X'), p = raw.indexOf('P')
  Object.assign(s.world, { w, h: rows.length, tiles: raw.replace('X', '.').replace('P', '.'),
    entrance: { tx: x % w, ty: Math.floor(x / w) }, exit: { tx: x % w, ty: Math.floor(x / w) } })
  s.world.tilesHash = fnv1a(s.world.tiles)
  s.meta.runId = 1
  if (p >= 0) { s.player.x = (p % w) * 32 + 16; s.player.y = Math.floor(p / w) * 32 + 16 }
  clearCaches()
  return s
}

function rock(s: State, i: number, landed: boolean): void {
  s.rocks.push({ id: s.meta.nextId++, x: (i % s.world.w) * 32 + 16, y: Math.floor(i / s.world.w) * 32 + 16,
    size: 1, tiles: [i], t: 0, landed, hit: false, shrunk: false })
  if (landed) s.world.solidSig++
  else s.world.pendingSig++
}

const at = (s: State, x: number, y: number): number => y * s.world.w + x

function distances(): void {
  const c = grid(['#########', '#X.....P#', '#########'])
  const src = [at(c, 7, 1)]
  ok(routeDist(c, [], src) === 6, 'corridor shortest length')
  ok(routeDist(c, [], [at(c, 1, 1)]) === 0, 'source on the exit')
  ok(routeDist(c, [at(c, 3, 1)], src) === -1, 'blocked tile seals the corridor')
  ok(routeDist(c, [], []) === -1, 'no sources')

  // Two-route loop: direct row 1 (length 4), detour through row 3 (length 8).
  const l = grid(['#######', '#X...P#', '#.###.#', '#.....#', '#######'])
  const p = [at(l, 5, 1)]
  ok(routeDist(l, [], p) === 4, 'loop direct route')
  ok(routeDist(l, [at(l, 3, 1)], p) === 8, 'blocked list forces the detour (early exit returns a real length)')
  ok(routeDist(l, [at(l, 3, 1), at(l, 3, 3)], p) === -1, 'both routes blocked')
  ok(routeDist(l, [at(l, 3, 1)], [at(l, 3, 1)]) === -1, 'source inside blocked is dropped')

  // 4-neighbour only: a diagonal-only gap is a wall, an orthogonal one is not.
  const d = grid(['####', '#X##', '##.#', '####'])
  ok(routeDist(d, [], [at(d, 2, 2)]) === -1, 'diagonal gap unreachable')
  const o = grid(['####', '#X.#', '##.#', '####'])
  ok(routeDist(o, [], [at(o, 2, 2)]) === 2, 'orthogonal neighbour reachable')

  // Row edges must not wrap: E of the last column is not the next row's first tile, W of the first column is not the row above.
  const e = grid(['####', '###P', 'X###'])
  ok(routeDist(e, [], [at(e, 3, 1)]) === -1, 'no wrap past the east edge')
  const wst = grid(['###X', 'P###', '####'])
  ok(routeDist(wst, [], [at(wst, 0, 1)]) === -1, 'no wrap past the west edge')

  // Pending rocks: strict grid blocks them, physical grid does not. Landed rubble blocks both.
  const q = grid(['#######', '#X...P#', '#######'])
  rock(q, at(q, 3, 1), false)
  const qs = [at(q, 5, 1)]
  ok(routeDist(q, [], qs) === -1 && routeDist(q, [], qs, true) === -1, 'pendingBlocks true: shadow cuts the corridor')
  ok(routeDist(q, [], qs, false) === 4, 'pendingBlocks false: shadow is walkable')
  q.rocks[0].landed = true; q.world.solidSig++; q.world.pendingSig++
  ok(routeDist(q, [], qs, false) === -1 && routeDist(q, [], qs, true) === -1, 'landed rubble blocks both modes')
}

function cap(): void {
  const w = 320, h = 240
  const rows = Array.from({ length: h }, (_, y) => (y === 0 ? 'X' : '.').padEnd(w, '.'))
  const s = grid(rows)
  const far = [at(s, w - 1, h - 1)], block = [at(s, 3, 0)]
  ok(getExitDist(s)[far[0]] === w - 1 + h - 1, 'fixture: far corner is reachable (exit field)')
  ok(routeDist(s, [], far) === w - 1 + h - 1, 'no blocked tile: source E is the answer')
  ok(w * h > ROUTE_VISIT_MAX, 'fixture is larger than the visit cap')
  ok(routeDist(s, block, far) === -1, 'visit cap exceeded returns -1 although the exit is reachable')
  ok(routeDist(s, block, [at(s, 5, 0)]) === 7, 'near source detours around the blocked tile')
}

function walks(): void {
  const c = grid(['#########', '#X.....P#', '#########'])
  const E = getExitDist(c), p0 = at(c, 7, 1)
  const full = downhill(c, E, p0, Infinity)
  eq(full, [16, 15, 14, 13, 12, 11, 10], 'downhill reaches the exit')
  ok(full[full.length - 1] === at(c, 1, 1), 'downhill ends on the exit tile')
  eq(downhill(c, E, p0, 3), [16, 15, 14], 'downhill stops at maxTiles')
  eq(downhill(c, E, at(c, 1, 1), Infinity), [10], 'downhill from the exit is just the exit')
  eq(downhill(c, E, 0, Infinity), [], 'downhill from a wall is empty')

  const o = grid(['X...', '....', '....', '...P'])
  eq(downhill(o, getExitDist(o), at(o, 2, 2), Infinity), [10, 9, 8, 4, 0], 'neighbour order E, S, W, N: W before N')
  eq(downhill(o, getExitDist(o), at(o, 0, 3), Infinity), [12, 8, 4, 0], 'only N descends')
}

function sources(): void {
  const o = grid(['.....', '.....', '..#..', '.....'])
  const put = (s: State, x: number, y: number): void => { s.player.x = x; s.player.y = y }
  put(o, 48, 48)
  eq(playerSources(o, []), [6], 'inside one tile')
  put(o, 64, 32)
  eq(playerSources(o, []), [1, 2, 6, 7], 'corner of 4 tiles')
  put(o, 80, 80)
  eq(playerSources(o, []), [], 'standing in a solid tile: no source')
  put(o, 64, 64)
  eq(playerSources(o, []), [6, 7, 11], 'corner next to a solid tile: 3 sources')
  eq(playerSources(o, [7]), [6, 11], 'exclude list')
  put(o, 42, 16)
  eq(playerSources(o, []), [1], 'tangent circle (distance == r) does not overlap')
  put(o, 41.9, 16)
  eq(playerSources(o, []), [0, 1], 'just inside overlaps')
  rock(o, 1, false)
  eq(playerSources(o, []), [0, 1], 'pending tiles count as sources')
  rock(o, 0, true)
  eq(playerSources(o, []), [1], 'landed rubble is not a source')
}

function heading(): void {
  const c = grid(['#########', '#X.....P#', '#########'])
  const h = exitHeading(c, 0)
  ok(h !== null && Math.abs(Math.abs(h.angle) - Math.PI) < 1e-9 && h.dist === 6, 'corridor heading is west, dist 6')
  const o = grid(['X....', '.....', '.....', '.....', '....P'])
  const west = exitHeading(o, Math.PI), north = exitHeading(o, -Math.PI / 2)
  ok(west !== null && north !== null && west.dist === 8 && north.dist === 8, 'open dist is Manhattan 8')
  ok(Math.abs(Math.abs(west!.angle) - Math.PI) < 1e-9, 'prevAngle west picks west ties')
  ok(Math.abs(north!.angle + Math.PI / 2) < 1e-9, 'prevAngle north picks north ties')
  o.player.x = 16; o.player.y = 16
  const on = exitHeading(o, 1.25)
  ok(on !== null && on.dist === 0 && on.angle === 1.25, 'on the exit keeps prevAngle')
  const s = grid(['#######', '#X...P#', '#######'])
  rock(s, at(s, 3, 1), false)
  ok(exitHeading(s, 0) === null, 'cut off by a shadow: no exit info')
}

export function run(): void {
  distances(); cap(); walks(); sources(); heading()
  clearCaches()
}
