// B8 checks, all through step(): escape roll (distance, i-frames, cooldown, direction), dodge vs rock, escape win / lose order,
// escape director (interval, cap, devourer limit, spawn ring, exit field) and the descent director on a real cave.
// Spec: architecture-systems-3.md §6, architecture-systems-4.md §3.1, architecture-monsters-ai-2.md §5, R-127, R-169.
// L0-L3 imports only; DOM-free; every scenario builds its own State.
import type { Input } from '../main.ts'
import type { Monster, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { clearCaches } from '../world/caches.ts'
import { spawnMonster } from '../entities/monster.ts'
import { commitRock } from '../systems/rocks.ts'
import { startRun } from '../systems/run.ts'
import { lightRadius } from '../systems/light.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: roll: ' + msg) }
const inp = (keys: string[] = [], pressed: string[] = []): Input =>
  ({ keys: new Set(keys), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } })
const ROLL = ['Space']
const TILE = 32

// Open arena in the escape phase: all floor, exit far from the player, no spawns, no rocks, no monsters.
function arena(phase: 'escape' | 'descent' = 'escape'): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.world.tiles = '.'.repeat(s.world.w * s.world.h)
  s.world.tilesHash = 31
  s.world.exit = { tx: 5, ty: 5 }
  s.meta.phase = phase
  Object.assign(s, { monsters: [], pickups: [], veins: [] })
  s.director.spawnT = 1e9
  s.director.quakeT = 1e9
  s.player.x = s.world.w * 16
  s.player.y = s.world.h * 16
  clearCaches()
  return s
}

const latch = (s: State, dx = 24): Monster => {
  const m = spawnMonster(s, 'lurker', s.player.x + dx, s.player.y, 100)
  Object.assign(m, { ai: 'lunge', aiT: 0.3, contactT: 0 })
  return m
}
const count = (s: State, kind: string): number => s.fx.events.filter(e => e.kind === kind && e.step === s.meta.steps).length

function roll(): void {
  // 1. Distance 126 +-1 over the 18 roll steps, then sprint 240 px/s; 18 i-frame steps; the held key does not steer a roll.
  {
    const s = arena(), x0 = s.player.x
    step(s, inp(['KeyD'], ROLL), DT)
    ok(count(s, 'roll') === 1 && s.player.roll.t > 0, 'Space in escape starts a roll and emits roll')
    let inv = 1
    for (let k = 2; k <= 18; k++) { step(s, inp(['KeyA']), DT); if (s.player.roll.invuln > 0) inv++ }
    ok(Math.abs(s.player.x - x0 - T.roll.speedPxS * T.roll.durationS) <= 1, 'roll covers 126 px +-1 (got ' + (s.player.x - x0) + ')')
    ok(inv === 18, '18 i-frame steps (got ' + inv + ')')
    const x18 = s.player.x
    step(s, inp(['KeyD']), DT)
    ok(s.player.roll.t === 0 && s.player.roll.invuln === 0, 'step 19: roll and i-frames over')
    ok(Math.abs(s.player.x - x18 - T.player.walkPxS * T.escape.sprintMul * DT) < 1e-6, 'exit at sprint speed (240 px/s), no stall')
  }
  // 2. Cooldown 1.5 s counts from the roll start: held Space re-rolls on step 91, not 90.
  {
    const s = arena(), starts: number[] = []
    for (let k = 1; k <= 92; k++) { step(s, inp([], ROLL), DT); if (count(s, 'roll') > 0) starts.push(k) }
    ok(starts.length === 2 && starts[0] === 1 && starts[1] === 91, 'second roll exactly at 1.5 s (got ' + starts.join(',') + ')')
  }
  // 3. Direction: movement keys give the move direction (normalised), no keys give the facing; descent never rolls.
  {
    const s = arena(), x0 = s.player.x, y0 = s.player.y
    step(s, inp(['KeyD', 'KeyS'], ROLL), DT)
    for (let k = 2; k <= 18; k++) step(s, inp(), DT)
    ok(Math.abs(Math.hypot(s.player.x - x0, s.player.y - y0) - 126) <= 1 && Math.abs((s.player.x - x0) - (s.player.y - y0)) < 1e-6, 'diagonal roll: 126 px at 45 deg')
    const f = arena()
    f.player.facing = Math.PI / 2
    const fx = f.player.x, fy = f.player.y
    step(f, inp([], ROLL), DT)
    for (let k = 2; k <= 18; k++) step(f, inp(), DT)
    ok(Math.abs(f.player.y - fy - 126) <= 1 && Math.abs(f.player.x - fx) < 1e-6, 'no keys: roll along the facing (down)')
    const d = arena('descent')
    step(d, inp(['KeyD'], ROLL), DT)
    ok(d.player.roll.t === 0 && count(d, 'roll') === 0, 'descent: Space does not roll')
  }
  // 4. Bites are dodged during i-frames, then hurt again; rocks hit through a roll.
  {
    const s = arena(), hp = s.player.hp
    step(s, inp(['KeyD'], ROLL), DT)
    latch(s)
    step(s, inp(), DT)
    ok(s.player.hp === hp && count(s, 'dodge') === 1, 'bite during i-frames: dodge, no damage')
    for (let k = 0; k < 30; k++) step(s, inp(), DT)
    latch(s)
    step(s, inp(), DT)
    ok(s.player.hp === hp - 1 && count(s, 'dodge') === 0, 'bite after the i-frames: damage')
    const r = arena()
    step(r, inp(['KeyD'], ROLL), DT)
    const tile = Math.floor(r.player.y / TILE) * r.world.w + Math.floor(r.player.x / TILE)
    const rock = commitRock(r, { tx: tile % r.world.w, ty: Math.floor(tile / r.world.w), size: 1, tiles: [tile], x: r.player.x, y: r.player.y })
    rock.t = DT
    step(r, inp(), DT)
    ok(r.player.roll.invuln > 0 && r.player.hp === r.player.hpMax - 1, 'rock during i-frames still costs 1 hp')
  }
}

function win(): void {
  // Chebyshev winRadiusTiles (1): tile (101,101) wins, (102,100) does not; lose beats win; the won screen commits Best.
  const at = (tx: number, ty: number): State => {
    const s = arena()
    s.world.exit = { tx: 100, ty: 100 }
    s.player.x = tx * TILE + 0.5
    s.player.y = ty * TILE + 0.5
    clearCaches()
    return s
  }
  for (const [tx, ty, won] of [[100, 100, true], [101, 101, true], [99, 101, true], [102, 100, false], [100, 98, false], [102, 102, false]] as const) {
    const s = at(tx, ty)
    step(s, inp(), DT)
    ok((s.meta.screen === 'won') === won, `tile (${tx},${ty}) vs exit (100,100): ${won ? 'won' : 'still playing'} (got ${s.meta.screen})`)
    if (won) ok(s.result !== null && s.result.won && s.best !== null, 'win commits a Best')
  }
  const l = at(100, 100)
  l.player.hp = 0
  step(l, inp(), DT)
  ok(l.meta.screen === 'dead' && l.result !== null && !l.result.won, 'hp 0 on the exit: dead, lose beats win')
  const d = arena('descent')
  d.world.exit = { tx: 100, ty: 100 }
  d.player.x = 100 * TILE + 16
  d.player.y = 100 * TILE + 16
  step(d, inp(), DT)
  ok(d.meta.screen === 'playing', 'descent on the exit tile: no win')
}

function director(): void {
  // Escape: first spawn at once, then every 72 steps (1.2 s), alive never above 8, ring 220..340 px, no lightRadius term.
  {
    const s = arena()
    s.debug.freezeAi = true
    s.debug.god = true
    s.meta.zone = 4
    s.director.spawnT = 0
    const at: number[] = []
    let max = 0
    for (let k = 1; k <= 12 * 72; k++) {
      const n = s.monsters.length
      step(s, inp(), DT)
      if (s.monsters.length > n) at.push(k)
      max = Math.max(max, s.monsters.length)
    }
    ok(at[0] === 1 && at.slice(1).every((v, i) => v - at[i] === 72), 'escape spawns every 72 steps (got ' + at.slice(0, 5).join(',') + ')')
    ok(max === T.escape.maxAlive && s.monsters.length === 8, 'escape cap 8 reached and kept (max ' + max + ')')
    for (const m of s.monsters) {
      const d = Math.hypot(m.x - s.player.x, m.y - s.player.y)
      ok(d >= T.escape.spawnGapPx[0] - 1e-6 && d <= T.escape.spawnGapPx[1] + 1e-6, 'spawn ring 220..340 px (got ' + d.toFixed(1) + ')')
    }
  }
  // At most one devourer: with one alive the pick weight is 0, over many spawn attempts.
  {
    const s = arena()
    s.debug.freezeAi = true
    s.debug.god = true
    s.meta.zone = 4
    const dev = spawnMonster(s, 'devourer', s.player.x + 250, s.player.y, 0)
    let spawned = 0
    for (let k = 0; k < 300; k++) {
      s.monsters = s.monsters.filter(m => m === dev)
      s.director.spawnT = 0
      step(s, inp(), DT)
      spawned += s.monsters.length - 1
      ok(s.monsters.filter(m => m.kind === 'devourer').length === 1, 'second devourer spawned')
    }
    ok(spawned > 100, 'the director kept spawning other kinds (' + spawned + ')')
  }
  // Escape field: an exit sealed in a pocket leaves the player's tile at -1, so nothing spawns (the entrance field would accept it).
  {
    const s = arena(), w = s.world.w, t = s.world.tiles.split('')
    for (let y = 98; y <= 102; y++) for (let x = 98; x <= 102; x++) if (x === 98 || x === 102 || y === 98 || y === 102) t[y * w + x] = '#'
    s.world.tiles = t.join('')
    s.world.tilesHash = 32
    s.world.exit = { tx: 100, ty: 100 }
    clearCaches()
    s.debug.freezeAi = true
    s.debug.god = true
    s.director.spawnT = 0
    for (let k = 0; k < 300; k++) step(s, inp(), DT)
    ok(s.monsters.length === 0, 'unreachable from the exit: no escape spawn (got ' + s.monsters.length + ')')
  }
  // Descent spawn on a real cave (D3p pre-baseline for the out-of-sight rule): at least one spawn within 3000 steps,
  // spawn ring lightRadius + 135..280 kept. The old all-floor arena pinned first-at-once, a 240-step interval and cap 3;
  // an out-of-sight reject would fail every spawn there, so the count/interval pins are dropped (D3, issue #113 step 4).
  {
    const s = init()
    startRun(s, '1', caveOf(parseSeed('1')))
    s.settings.loaded = true
    s.meta.phase = 'descent'
    s.debug.freezeAi = true
    s.debug.god = true
    const R = lightRadius(s)
    let first = -1
    for (let k = 1; k <= 3000; k++) {
      const n = s.monsters.length
      step(s, inp(), DT)
      if (first < 0 && s.monsters.length > n) first = k
    }
    ok(first >= 1 && 2 * first <= 3000, 'descent cave seed 1: first spawn early enough (step ' + first + ')')
    ok(s.monsters.length >= 1, 'descent cave seed 1: at least one spawn (got ' + s.monsters.length + ')')
    for (const m of s.monsters) {
      const d = Math.hypot(m.x - s.player.x, m.y - s.player.y)
      ok(d >= R + T.director.spawnGapPx[0] - 1e-6 && d <= R + T.director.spawnGapPx[1] + 1e-6, 'descent ring R + 135..280 (got ' + d.toFixed(1) + ')')
    }
  }
}

function determinism(): void {
  const play = (): string => {
    const s = arena()
    s.debug.god = true
    s.director.spawnT = 0
    for (let k = 0; k < 600; k++) step(s, inp(k % 3 === 0 ? ['KeyD'] : ['KeyS'], k % 100 === 0 ? ROLL : []), DT)
    return JSON.stringify([s.player.x, s.player.y, s.monsters.map(m => [m.kind, m.x, m.y]), s.rng.gameplay])
  }
  ok(play() === play(), 'same run twice gives the same state')
}

export function run(): void {
  roll()
  win()
  director()
  determinism()
}
