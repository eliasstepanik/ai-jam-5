// B9 rocks suite, part 2: seeded property test (architecture-rocks-2 §7), determinism, and the god-mode exit bot.
// Every assertion is judged by the independent refReachable oracle from rocks.check.ts, not by route.ts. L0-L3 imports only.
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { downhill, playerSources } from '../world/route.ts'
import { idx, tileToWorld } from '../world/grid.ts'
import { getExitDist, isBeaconRoom } from '../world/caches.ts'
import { circleRectOverlap } from '../world/collide.ts'
import { lightBeacon } from '../systems/beacon.ts'
import { commitRock, landRock, planRockFall } from '../systems/rocks.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'
import { ok, refReachable } from './rocks.check.ts'

const OPS = 150
const DT = 1 / 60
const BOT_AHEAD = 1 // route tiles the bot aims ahead
const BOT_E = 300 // route tiles left when the bot starts (9600 px = 2400 steps at sprint speed)
const inp = (keys: string[] = []): Input => ({ keys: new Set(keys), pressed: new Set(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } })

// Check-local mulberry32 (independent of core/rng.ts): returns a [0,1) generator.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function started(seed: string): State {
  const s = init()
  startRun(s, seed, caveOf(parseSeed(seed)))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.monsters = []
  return s
}

const wallAt = (s: State, i: number): boolean => s.world.tiles[i] === '#' || s.rocks.some((r) => r.landed && r.tiles.includes(i))
const sources = (s: State): number[] => playerSources(s, [])
const rectOf = (s: State, i: number, size: number): [number, number, number, number] => {
  const x0 = (i % s.world.w) * 32, y0 = Math.floor(i / s.world.w) * 32
  return [x0, y0, x0 + size * 32, y0 + size * 32]
}
const near = (s: State, i: number, c: { tx: number; ty: number }): number =>
  Math.max(Math.abs((i % s.world.w) - c.tx), Math.abs(Math.floor(i / s.world.w) - c.ty))

// (c) the player circle overlaps no solid tile (oracle's own solid test: wall char or landed rock).
function playerFree(s: State): boolean {
  const { x, y } = s.player, r = T.player.radiusPx, w = s.world.w
  for (let ty = Math.floor((y - r) / 32); ty <= Math.floor((y + r) / 32); ty++) for (let tx = Math.floor((x - r) / 32); tx <= Math.floor((x + r) / 32); tx++) {
    if (tx < 0 || ty < 0 || tx >= w || ty >= s.world.h) return false
    if (wallAt(s, ty * w + tx) && circleRectOverlap(x, y, r, tx * 32, ty * 32, tx * 32 + 32, ty * 32 + 32)) return false
  }
  return true
}

// Whole-state invariants after every op: (a) route alive without pending, (c), (d), clear zones (e) for every rock, (f) JSON round trip.
function invariants(s: State, tag: string): void {
  ok(refReachable(s, sources(s), false) >= 0, tag + ': (a) oracle route player -> exit lost')
  ok(playerFree(s), tag + ': (c) player circle overlaps a solid tile')
  const landed = s.rocks.filter((r) => r.landed).length
  ok(landed <= T.escape.rocksMax, tag + ': (d) landed ' + landed + ' > cap')
  ok(s.rocks.length - landed <= T.rocks.pendingMax, tag + ': (d) pending above pendingMax')
  for (const r of s.rocks) for (const i of r.tiles) {
    ok(s.world.tiles[i] !== '#', tag + ': (e) rock on a wall')
    ok(near(s, i, s.world.exit) > T.rocks.exitClearTiles, tag + ': (e) rock in the exit clear zone')
    ok(near(s, i, s.world.beacon) > T.rocks.beaconClearTiles && !isBeaconRoom(s, i), tag + ': (e) rock in the Beacon chamber / clear zone')
  }
  ok(JSON.stringify(JSON.parse(JSON.stringify(s.rocks))) === JSON.stringify(s.rocks), tag + ': (f) rocks do not survive a JSON round trip')
}

// One seeded run of OPS random ops; returns the final state. Op 1: teleport to a reachable tile, plan + commit. Op 2: land a pending rock.
function propRun(seed: number): State {
  const s = started(String(seed))
  lightBeacon(s)
  s.player.hp = 1e6 // landings under the player must never end the run: damage is asserted by delta
  const rnd = mulberry32(seed ^ 0x9e3779b9), w = s.world.w
  const floor: number[] = []
  for (let i = 0; i < s.world.tiles.length; i++) if (s.world.tiles[i] !== '#') floor.push(i)
  let sig = [s.world.solidSig, s.world.pendingSig]
  for (let op = 0; op < OPS; op++) {
    const tag = 'seed ' + seed + ' op ' + op
    if (rnd() < 0.5 || s.rocks.every((r) => r.landed)) {
      let i = -1
      for (let k = 0; k < 40 && i < 0; k++) {
        const c = floor[Math.floor(rnd() * floor.length)]
        if (!wallAt(s, c) && refReachable(s, [c], false) >= 0) i = c
      }
      if (i < 0) continue
      s.player.x = (i % w) * 32 + 16
      s.player.y = Math.floor(i / w) * 32 + 16
      const plan = planRockFall(s)
      if (plan) {
        ok(!circleRectOverlap(s.player.x, s.player.y, T.player.radiusPx + T.rocks.playerGapPx, ...rectOf(s, plan.tiles[0], plan.size)), tag + ': (e) plan inside the player gap')
        commitRock(s, plan)
        ok(refReachable(s, sources(s), true) >= 0, tag + ': (b) route lost under pending blocking after commit')
      }
    } else {
      const pend = s.rocks.filter((r) => !r.landed), r = pend[Math.floor(rnd() * pend.length)]
      if (rnd() < 0.5) s.player.hurtT = 0
      const hp = s.player.hp, shield = s.player.hurtT > 1e-9
      const under = circleRectOverlap(s.player.x, s.player.y, T.player.radiusPx, ...rectOf(s, r.tiles[0], r.size))
      r.t = 0
      landRock(s, r)
      if (r.landed && under && !r.shrunk) ok(s.player.hp === hp - (shield ? 0 : T.rocks.damageHp), tag + ': landing on the player tile without exactly one hit, hp ' + (hp - s.player.hp))
    }
    invariants(s, tag)
    ok(s.world.solidSig >= sig[0] && s.world.pendingSig >= sig[1], tag + ': solidSig / pendingSig went backwards')
    sig = [s.world.solidSig, s.world.pendingSig]
  }
  return s
}

// Bot: god mode, seed 3, Beacon lit; follows the live exit field (route tiles recomputed from the player every step, so landed
// rocks are routed around). Must win within 3600 steps (60 s). Keys are digital: aim at a route tile BOT_AHEAD steps ahead and
// press the nearest of the 8 directions.
function bot(): void {
  const s = started('3')
  s.debug.god = true
  s.debug.freezeAi = true
  s.player.x = s.world.beacon.tx * 32 + 16
  s.player.y = s.world.beacon.ty * 32 + 16
  lightBeacon(s)
  s.director.spawnT = 1e9
  // ponytail: the seed-3 exit is ~577 route tiles from the Beacon (>4600 steps at 240 px/s); join the real route BOT_E tiles before the exit.
  const route = downhill(s, getExitDist(s), idx(s, s.world.beacon.tx, s.world.beacon.ty), Infinity)
  const from = route[route.length - 1 - BOT_E]
  s.player.x = tileToWorld(from % s.world.w)
  s.player.y = tileToWorld(Math.floor(from / s.world.w))
  const E = getExitDist(s), w = s.world.w
  let n = 0
  for (; n < 3600 && s.meta.screen === 'playing'; n++) {
    const p0 = playerSources(s, []).reduce((m, i) => (E[i] >= 0 && (m < 0 || E[i] < E[m]) ? i : m), -1)
    const ahead = p0 < 0 ? [] : downhill(s, E, p0, BOT_AHEAD + 1)
    const q = ahead[ahead.length - 1]
    const keys: string[] = []
    if (q !== undefined) {
      const a = Math.round(Math.atan2(tileToWorld(Math.floor(q / w)) - s.player.y, tileToWorld(q % w) - s.player.x) / (Math.PI / 4)) * (Math.PI / 4)
      const kx = Math.round(Math.cos(a)), ky = Math.round(Math.sin(a))
      if (kx) keys.push(kx > 0 ? 'KeyD' : 'KeyA')
      if (ky) keys.push(ky > 0 ? 'KeyS' : 'KeyW')
    }
    step(s, inp(keys), DT)
  }
  ok(s.meta.screen === 'won', 'bot: seed 3 did not win within ' + n + ' steps (screen ' + s.meta.screen + ')')
  ok(s.rocks.some((r) => r.landed), 'bot: quake was active during the run')
}

export function run(): void {
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  const last = env?.CHECK_HEAVY === '1' ? 12 : 6
  const t0 = performance.now()
  for (let seed = 1; seed <= last; seed++) propRun(seed)
  const ms = Math.round(performance.now() - t0)
  console.log('rocks.check: seeds 1..' + last + ' took ' + ms + ' ms')
  ok(ms < 8000, 'property suite took ' + ms + ' ms (limit 8000)')
  const a = propRun(7), b = propRun(7)
  ok(JSON.stringify(a.rocks) === JSON.stringify(b.rocks) && a.rng.gameplay === b.rng.gameplay, 'determinism: seed 7 twice differs')
  bot()
  console.log('rocks-prop check ok')
}
