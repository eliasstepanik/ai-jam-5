// Focused A18 verification: node scripts/check-a18.ts (Node >= 22.18).
// Kept separate from A19's world.check.ts and Elias's A6 check-chain wiring.
import { init } from '../src/core/state.ts'
import { fnv1a, makeRnd } from '../src/core/rng.ts'
import type { State } from '../src/core/types.ts'
import { clearCaches, getSolid } from '../src/world/caches.ts'
import { forN4, forN8, idx, inMap, isSolidAt, isSolidPx, isSolidTile, N4, playerTile, TILE, tileAt, tileToWorld, worldToTile } from '../src/world/grid.ts'
import { circleHitsSolid, circleRectOverlap, moveCircle } from '../src/world/collide.ts'
import { lineOfSight, lineOfSightPx } from '../src/world/los.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('A18: ' + msg)
}
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

function map(rows: string[]): State {
  const s = init()
  s.world.w = rows[0].length
  s.world.h = rows.length
  ok(rows.every(r => r.length === s.world.w), 'rectangular fixture')
  s.world.tiles = rows.join('')
  s.world.tilesHash = fnv1a(s.world.tiles)
  s.meta.runId = 1
  clearCaches()
  return s
}

// Independent collision oracle: every base/landed tile plus map boundaries.
function free(s: State, x: number, y: number, r: number): boolean {
  const w = s.world.w, h = s.world.h
  if (x - r < -1e-6 || y - r < -1e-6 || x + r > w * TILE + 1e-6 || y + r > h * TILE + 1e-6) return false
  for (let i = 0; i < w * h; i++) {
    if (s.world.tiles[i] !== '#' && !s.rocks.some(rock => rock.landed && rock.tiles.includes(i))) continue
    const tx = i % w, ty = Math.floor(i / w)
    const ax = Math.max(tx * TILE - x, 0, x - (tx + 1) * TILE)
    const ay = Math.max(ty * TILE - y, 0, y - (ty + 1) * TILE)
    if (ax * ax + ay * ay < (r - 1e-6) ** 2) return false
  }
  return true
}

ok(TILE === 32, 'core tile constant')
for (const [px, tile] of [[0, 0], [31.999, 0], [32, 1], [-0.01, -1]]) ok(worldToTile(px) === tile, 'coordinate boundary')
ok(tileToWorld(3) === 112, 'tile centre')
for (let t = -10; t < 320; t++) ok(worldToTile(tileToWorld(t)) === t, 'coordinate round trip')
const s = map(['#.,.', '....', '....'])
ok(tileAt(s, 0, 0) === '#' && tileAt(s, 1, 0) === '.' && tileAt(s, 2, 0) === ',', 'base tile kinds')
for (const [x, y] of [[-1, 0], [4, 0], [0, 3]]) ok(tileAt(s, x, y) === '#' && isSolidTile(s, x, y), 'off-map solid')
ok(isSolidPx(s, -0.01, 16) && !isSolidPx(s, 48, 16), 'pixel solidity')
ok(!inMap(s, 1.5, 0) && isSolidAt(s, -1) && isSolidAt(s, 12), 'invalid coordinates fail closed')
s.player.x = 81
s.player.y = 70
ok(playerTile(s) === idx(s, 2, 2), 'player centre tile')
ok(equal(N4, [[1, 0], [0, 1], [-1, 0], [0, -1]]), 'N4 constant')
for (const [i, expected] of [[0, [1, 4]], [3, [7, 2]], [8, [9, 4]], [11, [10, 7]], [5, [6, 9, 4, 1]]] as const) {
  const got: number[] = []
  forN4(s, i, j => got.push(j))
  ok(equal(got, expected), 'N4 order at ' + i)
}
const n8: [number, boolean][] = []
forN8(s, 5, (j, d) => n8.push([j, d]))
ok(equal(n8, [[6, false], [10, true], [9, false], [8, true], [4, false], [0, true], [1, false], [2, true]]), 'N8 order and diagonals')
const corner8: number[] = []
forN8(s, 0, j => corner8.push(j))
ok(equal(corner8, [1, 5, 4]), 'N8 filters off-map neighbours')
const initial = init()
clearCaches()
ok(tileAt(initial, 0, 0) === '#' && getSolid(initial).every(v => v === 1), 'empty initial world all solid')
ok(isSolidTile(initial, 10, 10) && circleHitsSolid(initial, 48, 48, 10), 'initial solidity and collision')
const invalidMove = moveCircle(initial, 48, 48, 1, 1, 10)
ok(Number.isFinite(invalidMove.x) && Number.isFinite(invalidMove.y), 'empty state move terminates')
ok(!lineOfSight(initial, 0, 2), 'empty state blocks intermediate LOS')
clearCaches()
let cache = getSolid(s)
ok(getSolid(s) === cache, 'solid cache reused')
s.rocks.push({ id: 1, x: 48, y: 48, size: 1, tiles: [5], t: 1, landed: false, hit: false, shrunk: false })
s.world.pendingSig++
ok(!isSolidAt(s, 5), 'pending rock not physically solid')
s.rocks[0].landed = true
s.world.solidSig++
ok(isSolidAt(s, 5) && getSolid(s) !== cache && tileAt(s, 1, 1) === '.', 'landed rubble blocks but base tiles stay immutable')
cache = getSolid(s)
s.meta.runId++
ok(getSolid(s) !== cache, 'new run cache miss')
const snapshot = getSolid(s).slice()
clearCaches()
ok(equal([...getSolid(s)], [...snapshot]), 'cache reset rebuilds identical grid')
cache = getSolid(s)
s.world.tiles = s.world.tiles.replace(',', '#')
s.world.tilesHash = fnv1a(s.world.tiles)
ok(getSolid(s) !== cache && isSolidAt(s, 2), 'tile hash invalidates cache')
cache = getSolid(s)
s.world.w = 3
s.world.h = 4
ok(getSolid(s) !== cache, 'dimensions invalidate cache even with equal area')
s.world.tiles = ''
clearCaches()
ok(getSolid(s).every(v => v === 1), 'malformed map fails closed')

ok(!circleRectOverlap(22, 48, 10, 32, 32, 64, 64), 'tangent circle is free')
ok(circleRectOverlap(23, 48, 10, 32, 32, 64, 64), 'wall overlap')
ok(!circleRectOverlap(24, 24, 10, 32, 32, 64, 64), 'AABB corner outside circle')
ok(circleRectOverlap(26, 26, 10, 32, 32, 64, 64), 'rounded corner overlap')
const slide = map(Array.from({ length: 30 }, () => '.'.repeat(32) + '#.'))
const slid = moveCircle(slide, 1013, 800, 1.414, 1.414, 10)
ok(near(slid.x, 1014) && near(slid.y, 801.414) && slid.hitX && !slid.hitY, 'documented wall slide')
const before = JSON.stringify(slide)
const resting = moveCircle(slide, 1000, 800, 0, 0, 10)
ok(equal(resting, { x: 1000, y: 800, hitX: false, hitY: false }) && JSON.stringify(slide) === before, 'stationary move and queries preserve State')
const horizontal = map(['.....', '.....', '#####', '.....', '.....'])
const down = moveCircle(horizontal, 80, 48, 0, 500, 10)
const up = moveCircle(horizontal, 80, 112, 0, -500, 10)
ok(near(down.y, 54) && down.hitY && near(up.y, 106) && up.hitY, 'fast movement blocked on both sides of horizontal wall')
for (const delta of [420 / 60, 560 / 60, 500]) {
  const wall = map(['...#...', '...#...', '...#...', '...#...', '...#...'])
  let x = 48, y = 80
  for (let step = 0; step < 60; step++) {
    const p = moveCircle(wall, x, y, delta, 0, 10)
    ok(free(wall, p.x, p.y, 10) && !circleHitsSolid(wall, p.x, p.y, 10) && p.x <= 86 + 1e-6, 'no tunnelling toward wall')
    x = p.x; y = p.y
  }
  const back = moveCircle(wall, 176, 80, -500, 0, 10)
  ok(near(back.x, 138) && back.hitX, 'fast reverse movement')
}
const edge = map(['.....', '.....', '.....', '.....', '.....'])
for (const [dx, dy] of [[-500, 0], [500, 0], [0, -500], [0, 500], [-500, -500]]) {
  const p = moveCircle(edge, 80, 80, dx, dy, 10)
  ok(free(edge, p.x, p.y, 10), 'off-map movement blocked')
  ok(dx === 0 || p.hitX, 'boundary hitX')
  ok(dy === 0 || p.hitY, 'boundary hitY')
}
const corridor = map(['#######', '#.....#', '#####.#', '#####.#', '#####.#', '#######'])
let p = { x: 48, y: 48 }
for (let t = 0; t < 32; t++) p = moveCircle(corridor, p.x, p.y, 4, 0, 10)
for (let t = 0; t < 24; t++) p = moveCircle(corridor, p.x, p.y, 0, 4, 10)
ok(near(p.x, 176) && near(p.y, 144) && free(corridor, p.x, p.y, 10), 'L-corridor traversed at sprint in under 2s')
const gap = map(['#####', '#.#.#', '##..#', '#...#', '#####'])
p = { x: 48, y: 48 }
for (let t = 0; t < 120; t++) {
  p = moveCircle(gap, p.x, p.y, 4, 4, 10)
  ok(free(gap, p.x, p.y, 10) && p.x < 64 && p.y < 64, 'diagonal wall gap blocks circle')
}
const embedded = map(['.....', '.....', '..#..', '.....', '.....'])
const recovered = moveCircle(embedded, 80, 80, 0, 0, 10)
ok(near(recovered.x, 80) && near(recovered.y, 54) && free(embedded, recovered.x, recovered.y, 10), 'inside wall at rest chooses lowest-index free neighbour')
const recoveredMove = moveCircle(embedded, 80, 80, 1, 0, 10)
ok(near(recoveredMove.x, 54) && free(embedded, recoveredMove.x, recoveredMove.y, 10), 'inside wall backs out against movement')

const sight = map(['#...#', '..#..', '.....', '.....', '.....'])
ok(lineOfSight(sight, 0, 4) && lineOfSight(sight, 4, 0), 'solid LOS endpoints excluded')
ok(!lineOfSight(sight, 5, 9) && lineOfSight(sight, 10, 14), 'wall blocks LOS, clear row visible')
ok(lineOfSight(sight, 7, 7) && lineOfSight(sight, 7, 8), 'same and adjacent endpoints')
ok(lineOfSightPx(sight, 1, 1, 159, 1), 'pixel LOS uses endpoint tiles')
ok(!lineOfSightPx(sight, -1, 33, 33, 33) && !lineOfSight(sight, -1, 0), 'off-map LOS rejected without row wrapping')
for (let a = 0; a < 25; a++) for (let b = 0; b < 25; b++) {
  ok(lineOfSight(sight, a, b) === lineOfSight(sight, b, a), 'exhaustive LOS symmetry')
}

const rnd = makeRnd(18)
let moves = 0, pairs = 0
for (let fixture = 0; fixture < 8; fixture++) {
  const rows = Array.from({ length: 14 }, (_, y) => Array.from({ length: 18 }, (_, x) =>
    x === 0 || y === 0 || x === 17 || y === 13 || rnd.next() < 0.13 ? '#' : '.').join(''))
  const cave = map(rows)
  for (let t = 0; t < 1000; t++) {
    const r = [9, 10, 14, 30][t % 4], x = 32 + rnd.next() * 512, y = 32 + rnd.next() * 384
    if (!free(cave, x, y, r)) continue
    const dx = (rnd.next() * 2 - 1) * (t % 5 === 0 ? 150 : 12), dy = (rnd.next() * 2 - 1) * 12
    const result = moveCircle(cave, x, y, dx, dy, r)
    ok(free(cave, result.x, result.y, r) && !circleHitsSolid(cave, result.x, result.y, r), 'fuzz overlap ' + JSON.stringify({ fixture, x, y, dx, dy, r, result }))
    moves++
  }
  for (let t = 0; t < 500; t++) {
    const a = rnd.int(0, 251), b = rnd.int(0, 251)
    ok(lineOfSight(cave, a, b) === lineOfSight(cave, b, a), 'random LOS symmetry')
    pairs++
  }
}
ok(moves >= 2000, 'at least 2000 fuzz moves from independent free starts')
console.log('A18 checks ok: hand maps, ' + moves + ' fuzz moves, ' + (pairs + 625) + ' symmetric LOS pairs')
