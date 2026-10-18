import type { CaveCore, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { fnv1a, makeRnd, step32 } from '../core/rng.ts'
import { depthOf, zoneOfDepth } from '../core/score.ts'
import { carveCore, caveSeed, MAX_ATTEMPTS } from '../world/generate.ts'
import { worldToTile, tileToWorld, tileAt, isSolidTile, isSolidAt, isSolidPx, forN4, forN8, playerTile } from '../world/grid.ts'
import { circleHitsSolid, circleRectOverlap, moveCircle } from '../world/collide.ts'
import { lineOfSight, lineOfSightPx } from '../world/los.ts'
import { isExplored, markExplored, revealAround } from '../world/explored.ts'
import { nearestFloor, sampleSpawn } from '../world/sample.ts'
import { clearCaches, getSolid, getPendingMask, getEmptyMask, getDepthField, getExitDist,
  getZoneField, zoneAt, getBeaconRoom, isBeaconRoom, pathDistAt, exitDistAt } from '../world/caches.ts'

function ok(cond: boolean, msg: string): void { if (!cond) throw new Error('world check: ' + msg) }
const eq = (a: unknown, b: unknown, msg: string): void => ok(JSON.stringify(a) === JSON.stringify(b), msg)

function withTiles(rows: string[]): State {
  const s = init(), w = rows[0].length, raw = rows.join(''), e = raw.indexOf('E')
  Object.assign(s.world, { w, h: rows.length, tiles: raw.replace('E', '.'),
    entrance: { tx: e % w, ty: Math.floor(e / w) }, exit: { tx: e % w, ty: Math.floor(e / w) },
    explored: new Array(Math.ceil(raw.length / 32)).fill(0) })
  s.world.tilesHash = fnv1a(s.world.tiles)
  s.meta.runId = 1
  clearCaches()
  return s
}

function terrain(seed: number): CaveCore {
  for (let a = 0; a < MAX_ATTEMPTS; a++) {
    const c = carveCore(caveSeed(seed, a))
    if (c) return c
  }
  throw new Error('world check: no valid terrain attempt for seed ' + seed)
}

function fromCore(c: CaveCore): State {
  // CaveCore.t is 0=wall, 1=floor, 2=side room; never pass it to wall=1 BFS.
  const s = withTiles(Array.from({ length: c.h }, (_, y) =>
    Array.from(c.t.slice(y * c.w, (y + 1) * c.w), t => t === 0 ? '#' : t === 1 ? '.' : ',').join('')))
  s.world.entrance = s.world.exit = { tx: c.entrance % c.w, ty: Math.floor(c.entrance / c.w) }
  s.world.beacon = { tx: c.beacon % c.w, ty: Math.floor(c.beacon / c.w) }
  s.world.beaconDist = c.beaconDist
  return s
}

function rock(s: State, i: number, landed = false): void {
  s.rocks.push({ id: s.meta.nextId++, x: tileToWorld(i % s.world.w), y: tileToWorld(Math.floor(i / s.world.w)),
    size: 1, tiles: [i], t: 0, landed, hit: false, shrunk: false })
  if (landed) s.world.solidSig++
  else s.world.pendingSig++
}

function lipschitz(s: State, d: Int32Array): void {
  for (let i = 0; i < d.length; i++) if (d[i] >= 0) forN4(s, i, j => {
    if (d[j] >= 0) ok(Math.abs(d[i] - d[j]) <= 1, 'field is 1-Lipschitz')
  })
}

function coordinates(): void {
  eq([0, 31.999, 32, -0.01].map(worldToTile), [0, 0, 1, -1], 'pixel boundaries')
  ok(tileToWorld(3) === 112, 'tile centre')
  for (let t = 0; t < 320; t++) ok(worldToTile(tileToWorld(t)) === t, 'coordinate round trip')
  const s = withTiles(['E..,', '....', '....'])
  for (const [x, y] of [[-1, 0], [4, 0], [0, 3], [0.5, 0]]) {
    ok(tileAt(s, x, y) === '#' && isSolidTile(s, x, y), 'off-map solid')
  }
  ok(tileAt(s, 3, 0) === ',' && !isSolidAt(s, 3), 'side room is floor')
  ok(isSolidAt(s, -1) && isSolidAt(s, 12) && isSolidPx(s, -1, 0), 'invalid indices and pixels')
  ok(tileAt(init(), 0, 0) === '#' && isSolidTile(init(), 0, 0), 'empty title map')
  s.player.x = 48; s.player.y = 80
  ok(playerTile(s) === 9, 'player centre tile')
  for (const [i, expected] of [[0, [1, 4]], [3, [7, 2]], [8, [9, 4]], [11, [10, 7]], [5, [6, 9, 4, 1]]] as const) {
    const ns: number[] = []; forN4(s, i, j => ns.push(j)); eq(ns, expected, 'N4 order')
  }
  const ns: [number, boolean][] = []
  forN8(s, 5, (j, diag) => ns.push([j, diag]))
  eq(ns, [[6, false], [10, true], [9, false], [8, true], [4, false], [0, true], [1, false], [2, true]], 'N8 order')
}

function collision(c: CaveCore): void {
  let s = withTiles(Array.from({ length: 30 }, () => '.'.repeat(32) + '#....'))
  const slide = moveCircle(s, 1013, 800, 1.414, 1.414, 10)
  ok(Math.abs(slide.x - 1014) < 1e-6 && slide.hitX && Math.abs(slide.y - 801.414) < 1e-6, 'slide example')
  ok(!circleRectOverlap(22, 48, 10, 32, 32, 64, 64), 'tangent is free')
  s = withTiles(['########', '#E.#...#', '#..#...#', '########'])
  let p = { x: 48, y: 48 }
  for (let k = 0; k < 60; k++) { p = moveCircle(s, p.x, p.y, 420 / 60, 0, 10); ok(!circleHitsSolid(s, p.x, p.y, 10), 'roll never overlaps') }
  ok(p.x <= 86, 'roll cannot tunnel through a wall')
  ok(moveCircle(s, 48, 48, 180, 0, 10).x <= 86, 'large displacement substeps')
  s = withTiles(['#######', '#E....#', '#####.#', '#####.#', '#######'])
  p = { x: 48, y: 48 }
  for (let k = 0; k < 32; k++) p = moveCircle(s, p.x, p.y, 4, 0, 10)
  for (let k = 0; k < 16; k++) p = moveCircle(s, p.x, p.y, 0, 4, 10)
  eq(p, { x: 176, y: 112, hitX: false, hitY: false }, 'one tile L corridor in less than two seconds')
  s = withTiles(['####', '#E##', '##.#', '####'])
  p = { x: 48, y: 48 }
  for (let k = 0; k < 120; k++) p = moveCircle(s, p.x, p.y, 4, 4, 10)
  ok(worldToTile(p.x) === 1 && worldToTile(p.y) === 1, 'diagonal gap blocked')
  s = fromCore(c)
  const rnd = makeRnd(55), starts: number[][] = [9, 10, 14, 30].map(r =>
    Array.from(c.t.keys()).filter(i => c.t[i] && !circleHitsSolid(s, tileToWorld(i % c.w), tileToWorld(Math.floor(i / c.w)), r)))
  for (let k = 0; k < 2000; k++) {
    const ri = k % 4, r = [9, 10, 14, 30][ri], free = starts[ri]
    ok(free.length > 0, 'fuzz has free starts')
    const i = free[rnd.int(0, free.length - 1)]
    const end = moveCircle(s, tileToWorld(i % c.w), tileToWorld(Math.floor(i / c.w)), rnd.next() * 24 - 12, rnd.next() * 24 - 12, r)
    ok(!circleHitsSolid(s, end.x, end.y, r), '2000-move collision fuzz')
  }
}

function visibility(c: CaveCore): void {
  let s = withTiles(['E...', '.#..', '....'])
  ok(lineOfSight(s, 0, 3) && !lineOfSight(s, 0, 10), 'clear and blocked LOS')
  s = withTiles(['#E.#'])
  ok(lineOfSight(s, 0, 3) && !lineOfSight(s, -1, 3), 'endpoints excluded, off-map rejected')
  ok(!lineOfSightPx(s, -1, 16, 48, 16), 'off-map pixel LOS')
  s = fromCore(c)
  const rnd = makeRnd(66)
  for (let k = 0; k < 500; k++) {
    const a = rnd.int(0, c.t.length - 1), b = rnd.int(0, c.t.length - 1)
    ok(lineOfSight(s, a, b) === lineOfSight(s, b, a), '500 LOS symmetric pairs')
  }
  const e = [0, 0]
  ok(markExplored(e, 0) && !markExplored(e, 0) && markExplored(e, 31) && markExplored(e, 32), 'new bits only')
  ok(e[0] === -2147483647, 'signed bit 31')
  eq(JSON.parse(JSON.stringify(e)), e, 'signed word JSON round trip')
  s = withTiles(Array.from({ length: 20 }, () => '.'.repeat(20)))
  let count = 0
  for (let i = 0; i < 400; i++) if (Math.hypot(tileToWorld(i % 20) - 310, tileToWorld(Math.floor(i / 20)) - 319) <= 170) count++
  ok(revealAround(s, 310, 319, 170) === count && revealAround(s, 310, 319, 170) === 0, 'reveal count and repeat')
  for (let i = 0; i < 400; i++) ok(isExplored(s.world.explored, i) ===
    (Math.hypot(tileToWorld(i % 20) - 310, tileToWorld(Math.floor(i / 20)) - 319) <= 170), 'exact revealed set')
  s = withTiles(['E.#..'])
  ok(revealAround(s, 16, 16, 170) === 3 && isExplored(s.world.explored, 2) && !isExplored(s.world.explored, 3), 'wall revealed, behind hidden')
  ok(revealAround(s, -1, 16, 170) === 0, 'off-map reveal does not alias a tile')
  s = withTiles(['E.'])
  ok(revealAround(s, 16, 16, 32) === 2, 'radius boundary included')
}

function sampling(): void {
  let s = withTiles(['#####', '###.#', '#####'])
  ok(nearestFloor(s, 6) === 8 && nearestFloor(s, 6, 1) === -1, 'recover through walls with step limit')
  s = withTiles(['#.#', '.#.', '#.#'])
  ok(nearestFloor(s, 4) === 5 && nearestFloor(s, 4, 0) === -1 && nearestFloor(s, 5, 0) === 5, 'E wins equal BFS ties')
  ok(nearestFloor(withTiles(['###', '###', '###']), 4) === -1 && nearestFloor(s, -1) === -1, 'no floor or invalid source')
  s = withTiles(['#########.'])
  ok(nearestFloor(s, 0) === -1 && nearestFloor(s, 0, 9) === 9, 'default eight-step ceiling and custom limit')
  for (const phase of ['descent', 'escape'] as const) for (const stream of ['gameplay', 'cosmetic'] as const) {
    s = withTiles(Array.from({ length: 20 }, (_, y) => y === 10 ? '.'.repeat(10) + 'E' + '.'.repeat(9) : '.'.repeat(20)))
    s.meta.phase = phase
    s.rng = { cave: 91, gameplay: 42, cosmetic: 87 }
    const twin = structuredClone(s), before = { ...s.rng }, rnd = makeRnd(before[stream])
    const a = rnd.next() * 2 * Math.PI, d = 50 + rnd.next() * 50
    const opts = { minPx: 50, maxPx: 100, r: 10, tries: 12, outside: 40 }
    const p = sampleSpawn(s, stream, 336, 336, opts)
    eq(p, { x: 336 + d * Math.cos(a), y: 336 + d * Math.sin(a) }, 'first survivor, no tile snap')
    eq(sampleSpawn(twin, stream, 336, 336, opts), p, 'deterministic result')
    ok(p !== null && !circleHitsSolid(s, p.x, p.y, 10) && Math.hypot(p.x - 336, p.y - 336) >= 50, 'spawn validity')
    ok(p !== null && pathDistAt(s, worldToTile(p.y) * 20 + worldToTile(p.x)) >= 0, 'reachable spawn')
    let expected = before[stream]
    for (let k = 0; k < 24; k++) expected = step32(expected)[0]
    ok(s.rng[stream] === expected && s.rng.cave === before.cave && s.rng[stream === 'gameplay' ? 'cosmetic' : 'gameplay'] === before[stream === 'gameplay' ? 'cosmetic' : 'gameplay'], 'exact draws, only selected stream')
    for (const reject of ['light', 'off-map', 'unreachable', 'pending', 'landed', 'zero'] as const) {
      const t = withTiles(['E#...'])
      t.meta.phase = phase
      if (reject === 'pending' || reject === 'landed') rock(t, 0, reject === 'landed')
      const seed = t.rng[stream], tries = reject === 'zero' ? 0 : 7
      const o = { minPx: 0, maxPx: 0, r: 5, tries, outside: reject === 'light' ? 100 : 0 }
      const x = reject === 'off-map' ? -16 : reject === 'unreachable' ? 112 : 16
      const result = sampleSpawn(t, stream, x, 16, o)
      ok(result === null || (reject === 'pending' && phase === 'descent'), 'spawn reject ' + reject)
      let end = seed
      for (let k = 0; k < 2 * tries; k++) end = step32(end)[0]
      ok(t.rng[stream] === end, 'exact draws after ' + reject)
    }
  }
}

function caveSpawns(c: CaveCore): void {
  const s = fromCore(c), x = tileToWorld(c.entrance % c.w), y = tileToWorld(Math.floor(c.entrance / c.w))
  const o = { minPx: 40, maxPx: 400, r: 14, tries: 12, outside: 80 }
  let successes = 0, failuresBeforeSuccess = 0
  for (const phase of ['descent', 'escape'] as const) {
    s.meta.phase = phase
    for (let seed = 1; seed <= 50; seed++) {
      s.rng.gameplay = seed
      const rnd = makeRnd(seed)
      let expected: { x: number; y: number } | null = null, first = -1
      for (let k = 0; k < o.tries; k++) {
        const a = rnd.next() * 2 * Math.PI, d = o.minPx + rnd.next() * (o.maxPx - o.minPx)
        const px = x + d * Math.cos(a), py = y + d * Math.sin(a)
        if (expected || circleHitsSolid(s, px, py, o.r) || Math.hypot(px - x, py - y) < o.outside + o.r) continue
        const tx = worldToTile(px), ty = worldToTile(py), i = ty * c.w + tx
        if (tx < 0 || ty < 0 || tx >= c.w || ty >= c.h) continue
        if ((phase === 'escape' ? exitDistAt(s, i) : pathDistAt(s, i)) < 0) continue
        expected = { x: px, y: py }; first = k
      }
      eq(sampleSpawn(s, 'gameplay', x, y, o), expected, 'cave spawn first valid candidate')
      ok(s.rng.gameplay === rnd.state(), 'cave spawn exact draw count')
      if (expected) { successes++; if (first > 0) failuresBeforeSuccess++ }
    }
  }
  ok(successes > 0 && failuresBeforeSuccess > 0, 'cave sampling exercises rejections before success')
}

function caches(c: CaveCore): void {
  const s = fromCore(c), d = getDepthField(s), z = getZoneField(s), b = getBeaconRoom(s)
  eq(Array.from(d), Array.from(c.dist), 'generator and runtime base BFS agree')
  ok(pathDistAt(s, c.entrance) === 0 && exitDistAt(s, c.entrance) === 0, 'entrance and exit sources')
  ok(c.beaconDist === Math.max(...d), 'Beacon is deepest')
  eq(Array.from(b), Array.from(c.beaconMask), 'Beacon-room agreement')
  for (let i = 0; i < d.length; i++) {
    ok(z[i] === zoneOfDepth(depthOf(d[i], c.beaconDist)) && zoneAt(s, i) === z[i], 'zone agreement')
    ok(isBeaconRoom(s, i) === (b[i] === 1), 'Beacon accessor')
  }
  lipschitz(s, d)
  const solid = getSolid(s), pending = getPendingMask(s), exit = getExitDist(s)
  ok(getSolid(s) === solid && getPendingMask(s) === pending && getExitDist(s) === exit, 'cache hits')
  const i = c.t.findIndex((t, j) => t > 0 && j !== c.entrance)
  rock(s, i)
  const pendingExit = getExitDist(s)
  ok(getPendingMask(s) !== pending && getPendingMask(s)[i] === 1 && pendingExit !== exit && exitDistAt(s, i) === -1, 'pending invalidation')
  ok(getSolid(s) === solid && !isSolidAt(s, i), 'pending is physically free')
  s.rocks[0].landed = true; s.world.solidSig++; s.world.pendingSig++
  ok(getSolid(s) !== solid && isSolidAt(s, i) && getPendingMask(s)[i] === 0, 'landing invalidation')
  ok(getExitDist(s) === exit && getExitDist(s) !== pendingExit, 'exit rebuild alternates ping-pong buffers')
  ok(getDepthField(s) === d && getZoneField(s) === z && getBeaconRoom(s) === b, 'rocks preserve base fields')
  lipschitz(s, getExitDist(s))
  const block = c.t.findIndex((t, j) => t > 0 && j % c.w < c.w - 1 && j + c.w + 1 < c.t.length
    && c.t[j + 1] > 0 && c.t[j + c.w] > 0 && c.t[j + c.w + 1] > 0
    && ![j, j + 1, j + c.w, j + c.w + 1].includes(c.entrance) && j > i)
  ok(block >= 0, 'fixture has a two-by-two floor footprint')
  rock(s, block)
  Object.assign(s.rocks[1], { size: 2, x: (block % c.w + 1) * 32, y: (Math.floor(block / c.w) + 1) * 32,
    tiles: [block, block + 1, block + c.w, block + c.w + 1] })
  s.world.pendingSig++
  getExitDist(s)
  Object.assign(s.rocks[1], { size: 1, tiles: [block], shrunk: true,
    x: tileToWorld(block % c.w), y: tileToWorld(Math.floor(block / c.w)) })
  s.world.pendingSig++
  ok(getPendingMask(s)[block + 1] === 0 && getPendingMask(s)[block] === 1, 'shrunk pending mask rebuild')
  s.rocks.pop(); s.world.pendingSig++
  lipschitz(s, getExitDist(s))
  for (let k = 0, j = i + 2; k < 29; j++) if (c.t[j] && j !== c.entrance) { rock(s, j, true); k++ }
  const getters = [getSolid, getPendingMask, getEmptyMask, getDepthField, getExitDist, getZoneField, getBeaconRoom]
  const copies = getters.map(get => Array.from(get(s))), refs = getters.map(get => get(s))
  clearCaches()
  getters.forEach((get, k) => { eq(Array.from(get(s)), copies[k], 'rebuild after 30 landings'); ok(get(s) !== refs[k], 'clear replaces cache entry') })
  const prior = getSolid(s); s.meta.runId++
  ok(getSolid(s) !== prior, 'new run misses with same hash and signatures')
  const p = withTiles(['#######', '#E...##', '###.###', '###.###', '#######'])
  rock(p, 17, true)
  ok(exitDistAt(p, 24) === -1 && pathDistAt(p, 24) >= 0, 'sealed pocket only unreachable in escape')
  clearCaches() // Clear and warm at full map size before timing.
  getExitDist(s)
  const start = performance.now()
  for (let k = 0; k < 200; k++) { s.world.pendingSig++; getExitDist(s) }
  const ms = performance.now() - start
  ok(ms < 400, '200 exit rebuilds < 400ms, actual ' + ms.toFixed(1))
  console.log('world: 200 exit rebuilds ' + ms.toFixed(1) + ' ms')
  clearCaches()
}

export function run(): void {
  const one = terrain(1), two = terrain(2)
  coordinates(); collision(one); visibility(two); sampling(); caveSpawns(one); caches(one)
}
