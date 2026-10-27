// A29 step() call-order checks: each scenario fixes a value that flips when two calls in src/systems/step.ts swap or one is dropped.
// Spec: architecture-systems.md §1.1-§1.3 (D0-D18), R-067/R-068/MS-25 (hitstop click buffer), scoring-and-save §7 (end lockout).
// Exports run(); no side effect on import; DOM-free; all state is local to each scenario.
import type { Input } from '../main.ts'
import type { CaveResult, Monster, State, Zone } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed, SEED_MAX_LEN } from '../core/seed.ts'
import { depthOf, zoneOfDepth } from '../core/score.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { clampCam } from '../systems/camera.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { getDepthField } from '../world/caches.ts'
import { generateCave } from '../world/generate.ts'
import { isExplored } from '../world/explored.ts'
import { playerTile } from '../world/grid.ts'

const DT = 1 / 60

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const inp = (pressed: string[] = [], clicks = 0, held: string[] = []): Input => ({
  keys: new Set(held), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false },
  clicks: Array.from({ length: clicks }, () => ({ x: 1, y: 1 })), view: { w: 640, h: 360, dpr: 1 },
})

// A started run with the world quiet: no director spawns, no AI motion, no cave pickups or monsters.
function quiet(cave: CaveResult): State {
  const s = init()
  startRun(s, '1', cave)
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.debug.freezeAi = true
  Object.assign(s, { monsters: [], pickups: [] })
  return s
}

// A shade in the lunge, latched on the player (contactT) long enough ago that this step's bite fires, 24 px ahead (dir 0).
function latched(s: State): Monster {
  const m = spawnMonster(s, 'lurker', s.player.x + 24, s.player.y, 100)
  return Object.assign(m, { ai: 'lunge' as const, aiT: T.monsters.lurker.contactS, contactT: T.monsters.lurker.contactS - T.parry.lateMaxS })
}

// A quiet run paused by Blur and waited out past the 0.25 s screen lock (18 steps = 0.3 s), cursor on `row`.
function paused(cave: CaveResult, row: number): State {
  const s = quiet(cave)
  step(s, inp(['Blur']), DT)
  for (let k = 0; k < 18; k++) step(s, inp(), DT)
  s.ui.cursor = row
  return s
}

const count = (s: State): number => // explored tiles
  Array.from({ length: s.world.w * s.world.h }, (_, i) => +isExplored(s.world.explored, i)).reduce((a, b) => a + b, 0)

const zone = (d: number, bd: number): Zone => zoneOfDepth(depthOf(d, bd))

export function run(): void {
  const cave = generateCave(parseSeed('1')) // one cave for every scenario (startRun copies it; run.check.ts memoises the same way)
  // Order not pinned: D4 trackDepth vs stepExplore (stepExplore reads no zone/stats, trackDepth no explored/exploreKey) and D17 vs D18.
  // D3 before D4: the zone is read off the tile the player stands on AFTER the move (trackDepth before stepMovement lags one step).
  {
    const s = quiet(cave), f = getDepthField(s), w = s.world.w, bd = s.world.beaconDist
    let a = -1
    for (let i = 0; i < f.length - 1 && a < 0; i++) {
      if (f[i] >= 0 && f[i + 1] >= 0 && (i + 1) % w !== 0 && zone(f[i], bd) !== zone(f[i + 1], bd)) a = i
    }
    ok(a >= 0, 'seed 1 has two adjacent floor tiles in different zones')
    // just inside tile a, moving right into tile a + 1
    Object.assign(s.player, { x: (a % w + 1) * 32 - 0.5, y: Math.floor(a / w) * 32 + 16, vx: 240 })
    s.meta.zone = zone(f[a], bd)
    const before = s.player.stats.maxPathDist
    step(s, inp(), DT)
    ok(playerTile(s) === a + 1, 'player crossed into the next tile (' + playerTile(s) + ' vs ' + (a + 1) + ')')
    ok(s.meta.zone === zone(f[a + 1], bd), 'zone follows the tile entered this step (D3 before D4)')
    const want = Math.max(before, f[a + 1]) // high-water mark of the path distance, raised by the tile just entered
    ok(s.player.stats.maxPathDist === want, 'maxPathDist is exactly max(before, entered tile) (got ' + s.player.stats.maxPathDist + ', want ' + want + ')')
  }

  // D5 before D6: a resin picked up with the flame out relights it for exactly smallE, no burn tick in the same step.
  {
    const s = quiet(cave)
    s.player.energy = 0
    s.pickups = [{ id: 900, kind: 'resin', x: s.player.x, y: s.player.y, bob: 0, size: 'small' }]
    step(s, inp(), DT)
    ok(s.player.energy === T.resin.smallE && s.pickups.length === 0 && s.player.stats.resinUsed === 1, 'relight gives exactly smallE and consumes the resin (got ' + s.player.energy + ')')
    // lit flame: burn first, then the clamped pickup (100 - burn + 25 -> 100); picking up first would leave 100 - burn
    const t = quiet(cave)
    t.player.energy = 90
    t.pickups = [{ id: 901, kind: 'resin', x: t.player.x, y: t.player.y, bob: 0, size: 'small' }]
    step(t, inp(), DT)
    ok(t.player.energy === t.player.energyMax, 'clamped pickup after burn fills the flame (got ' + t.player.energy + ')')
  }

  // D14 + D15: the bite lands (energy -12, kill, shade dying), hurtT is set to flameHitInvulnS and then ticked down once.
  {
    const s = quiet(cave), m = latched(s)
    step(s, inp(), DT)
    const want = s.player.energyMax - T.flame.burnPerS[0] * DT - T.monsters.lurker.energyHitE // D5 burn, then the D14 bite
    ok(Math.abs(s.player.energy - want) < 1e-9 && s.player.stats.kills === 1, 'bite costs energyHitE and credits a kill (got ' + s.player.energy + ')')
    ok(m.ai === 'dying', 'bitten shade dies at the flame')
    ok(s.player.hurtT === T.flame.flameHitInvulnS - DT && s.player.hitFlash === T.hurt.flashS - DT, 'hurtT/hitFlash set by the bite, then ticked once (D14 before D15; got ' + s.player.hurtT + ')')
  }

  // D13 before D14: on the step both could resolve, the active swing parries the shade; the bite never lands.
  {
    const s = quiet(cave), m = latched(s), sw = s.player.swing
    Object.assign(sw, { active: true, t: 0.05, dir: 0 })
    step(s, inp(), DT)
    ok(s.player.stats.parries === 1 && s.player.parry.lastGrade !== 'none', 'swing parried the lunging shade (got parries ' + s.player.stats.parries + ')')
    ok(s.player.hurtT === 0 && s.player.hitFlash === 0 && m.ai === 'dying' && s.player.energy > s.player.energyMax - T.monsters.lurker.energyHitE, 'no bite damage after a parry on the bite step (parry loss below the bite loss)')
  }

  // D17/D18 run exactly once on a playing step: shake fades by one dt and the camera lerps once. Their order is unobservable
  // (stepCamera reads only player/cam, tickFx only fx), so this pins the calls, not the order.
  {
    const s = quiet(cave)
    Object.assign(s.fx, { shake: 0.3, shakeMag: 5 })
    s.cam.x = s.player.x - 40
    step(s, inp(), DT)
    ok(s.fx.shake === 0.3 - DT, 'shake ticked once by tickFx (got ' + s.fx.shake + ')')
    ok(Math.abs(s.cam.x - (s.player.x - 40 * Math.exp(-T.cam.lerpPerS * DT))) < 1e-9, 'camera lerps once toward the player')
  }

  // R-181 clampCam: view 640x360 dpr 1 -> z 1, half extents 320 x 180; south bound adds the 48 px overhang; degenerate view -> [0, W*32].
  {
    const v = { w: 640, h: 360, dpr: 1 }, c = clampCam(-5, 1e9, 320, 240, v), z = clampCam(1e9, -5, 320, 240, { w: 0, h: 0, dpr: 1 })
    ok(c.x === 320 && c.y === 240 * 32 + 48 - 180, 'clampCam clamps to the map incl. the 48 px south overhang (got ' + c.x + ',' + c.y + ')')
    ok(z.x === 320 * 32 && z.y === 0, 'clampCam with a 0x0 view stays finite and bounded (got ' + z.x + ',' + z.y + ')')
  }

  // D1 hitstop (MS-25/R-068): a click on the LAST hitstop step is buffered, then the swing starts on the next step.
  {
    const s = quiet(cave)
    s.fx.hitstop = DT // decrements to exactly 0 on this step
    step(s, inp([], 1), DT)
    ok(s.fx.hitstop === 0 && s.meta.steps === 1, 'hitstop step ran and ended')
    ok(s.player.swing.buffer === T.swing.bufferS, 'click on the last hitstop step is buffered (got ' + s.player.swing.buffer + ')')
    step(s, inp(), DT)
    ok(s.player.swing.active, 'buffered click starts the swing on the first free step')
    const q = quiet(cave)
    q.fx.hitstop = DT
    step(q, inp(), DT)
    ok(q.player.swing.buffer === 0, 'no click, no buffer')
  }

  // D1: the run clock counts on every screen, which times the 0.5 s end-screen lockout (R-038 scoring-and-save §7).
  {
    const s = quiet(cave)
    s.player.hp = 0
    step(s, inp(), DT)
    ok(s.meta.screen === 'dead' && s.result !== null, 'hp 0 ends the run')
    const t0 = s.meta.time
    for (let k = 0; k < 25; k++) step(s, inp(['Enter']), DT)
    ok(Math.abs(s.meta.time - t0 - 25 * DT) < 1e-9 && s.meta.steps === 1, 'time advances on the dead screen, steps do not (S09)')
    ok(s.meta.screen === 'dead' && s.ui.genPending === '', 'dead screen is locked for 0.5 s after the run ends')
    for (let k = 0; k < 10 && s.ui.genPending === ''; k++) step(s, inp(['Enter']), DT)
    ok(s.ui.genPending !== '', 'Enter activates Retry once the lockout has passed')
  }

  // C17: Blur pauses, and that same frame must not simulate (stepScreens returns false): no move, no flame burn, no step.
  {
    const s = quiet(cave), keys = ['KeyD']
    for (let k = 0; k < 20; k++) step(s, inp([], 0, keys), DT)
    const p = s.player, x = p.x, e = p.energy, n = s.meta.steps
    ok(n === 20 && x > s.world.entrance.tx * 32 + 16, 'player walks right while playing (x ' + x + ')')
    step(s, inp(['Blur'], 0, keys), DT)
    ok(s.meta.screen === 'paused' && p.x === x && p.energy === e && s.meta.steps === n, 'Blur pauses and that frame is not simulated (x, energy, steps)')
  }

  // S09: steps count simulated updates only; pause and end screens advance time but not steps (seconds = steps / 60).
  {
    const s = paused(cave, 0), t = s.meta.time
    ok(s.meta.screen === 'paused' && s.meta.steps === 0, 'paused for 19 updates: steps 0')
    for (let k = 0; k < 30; k++) step(s, inp(), DT)
    ok(s.meta.steps === 0 && Math.abs(s.meta.time - t - 30 * DT) < 1e-9, 'pause: time advances, steps do not')
  }

  // C01: Escape is locked for 0.25 s after the screen change (14 updates = 0.233 s locked, 16 = 0.267 s free; run.check.ts: 0.2 s).
  {
    const s = quiet(cave)
    for (let k = 0; k < 13; k++) step(s, inp(), DT)
    step(s, inp(['Escape']), DT)
    ok(s.meta.screen === 'playing', 'Escape at 14 updates (0.233 s) is still locked')
    step(s, inp(), DT)
    step(s, inp(['Escape']), DT)
    ok(s.meta.screen === 'paused', 'Escape at 16 updates (0.267 s) pauses')
    const e = quiet(cave) // exactly 0.25 s (exact in binary; 1/60 sums never land on it): the lock is `>=`
    step(e, inp(['Escape']), 0.25)
    ok(e.meta.screen === 'paused', 'Escape at exactly 0.25 s pauses')
  }

  // C12/C13: no world step while ui.genPending is set (nor on the update that starts the run); Escape cancels it. Seed '4' needs 2 attempts.
  {
    const s = init()
    s.ui.genPending = '4'
    step(s, inp(), DT)
    ok(s.ui.genPending === '4' && s.ui.genAttempt === 1 && s.meta.screen === 'title' && s.meta.steps === 0, 'rejected attempt: pending, no run, no step')
    step(s, inp(), DT)
    ok(s.ui.genPending === '' && s.meta.screen === 'playing' && s.meta.steps === 0 && s.meta.seedText === '4', 'accepting attempt starts the run without a world step')
    step(s, inp(), DT)
    ok(s.meta.steps === 1, 'the next update is the first world step')
    const c = init()
    Object.assign(c.ui, { genPending: '4', genAttempt: 3 })
    step(c, inp(['Escape']), DT)
    ok(c.ui.genPending === '' && c.ui.genAttempt === 0 && c.meta.screen === 'title' && c.meta.steps === 0, 'Escape cancels pending generation')
  }

  // S15/S19/S20/S28: live world (quiet() switches these off): held key moves the player, the flame explores, the director clock runs, a shade acts.
  {
    const s = quiet(cave)
    s.director.spawnT = T.director.firstSpawnS // quiet() parks the director and freezes the AI: undo both
    s.debug.freezeAi = false
    const p = s.player, m = spawnMonster(s, 'lurker', p.x, p.y + 40, 100), x0 = p.x, n0 = count(s)
    step(s, inp([], 0, ['KeyD']), DT)
    ok(m.aiT === DT, 'stepMonsters ticks the shade (aiT ' + m.aiT + ')')
    for (let k = 1; k < 40; k++) step(s, inp([], 0, ['KeyD']), DT)
    ok(p.x > x0 + 20, 'held KeyD moves the player (intent + movement; x ' + x0 + ' -> ' + p.x + ')')
    ok(count(s) > n0, 'walking reveals new tiles (stepExplore: ' + n0 + ' -> ' + count(s) + ')')
    ok(Math.abs(s.director.spawnT - (T.director.firstSpawnS - 40 * DT)) < 1e-9, 'stepDirector runs once per update (spawnT ' + s.director.spawnT + ')')
  }

  // C23: Escape on an end screen goes to the title once both lockouts have passed (32 updates, float-safe).
  {
    const s = quiet(cave)
    s.player.hp = 0
    for (let k = 0; k < 32; k++) step(s, inp(), DT) // death on update 1, then past the 0.5 s end lock
    step(s, inp(['Escape']), DT)
    ok(s.meta.screen === 'title' && s.ui.genPending === '' && s.ui.cursor === 0, 'Escape on the dead screen goes to the title')
  }

  // C05/C06/C14/C15 quit confirm: 1st press arms confirmT (2 s), 2nd inside the window quits, after it only re-arms. Rows: 0 Resume .. 2 Sound, 4 Quit.
  {
    const s = paused(cave, 4)
    step(s, inp(['Enter']), DT)
    ok(s.meta.screen === 'paused' && s.ui.confirmT === 2, 'first Quit press arms the 2 s confirm (confirmT ' + s.ui.confirmT + ')')
    for (let k = 0; k < 60; k++) step(s, inp(), DT)
    step(s, inp(['Enter']), DT)
    ok(s.meta.screen === 'title' && s.ui.confirmT === 0, 'second Quit press inside the window leaves for the title')
    const t = paused(cave, 4)
    step(t, inp(['Enter']), DT)
    for (let k = 0; k < 125; k++) step(t, inp(), DT)
    ok(t.ui.confirmT === 0, 'confirm disarms after 2 s')
    step(t, inp(['Enter']), DT)
    ok(t.meta.screen === 'paused' && t.ui.confirmT === 2, 'a Quit press after the window only re-arms')
  }

  // C10/C11 volume: Sound row, 0.1 steps with ArrowRight / Equal up and ArrowLeft / Minus down, clamped to 0..1.
  {
    const s = paused(cave, 2), v = (): number => s.settings.volume
    step(s, inp(['ArrowRight']), DT)
    ok(v() === 0.8, 'ArrowRight raises volume by 0.1 (got ' + v() + ')')
    step(s, inp(['Equal']), DT)
    ok(v() === 0.9, 'Equal raises volume by 0.1 (got ' + v() + ')')
    for (let k = 0; k < 2; k++) step(s, inp(['ArrowRight']), DT)
    ok(v() === 1, 'volume clamps at 1 (got ' + v() + ')')
    step(s, inp(['ArrowLeft']), DT)
    ok(v() === 0.9, 'ArrowLeft lowers volume by 0.1 (got ' + v() + ')')
    step(s, inp(['Minus']), DT)
    ok(v() === 0.8, 'Minus lowers volume by 0.1 (got ' + v() + ')')
    for (let k = 0; k < 10; k++) step(s, inp(['Minus']), DT)
    ok(v() === 0, 'volume clamps at 0 (got ' + v() + ')')
    s.ui.cursor = 3
    step(s, inp(['ArrowRight']), DT)
    ok(v() === 0, 'volume keys only act on the Sound row')
  }

  // C16 mute: KeyM toggles on every screen, but not while the seed field has focus (there it types 'm').
  {
    const s = quiet(cave), t = init()
    step(s, inp(['KeyM']), DT)
    ok(s.settings.muted, 'KeyM mutes while playing')
    for (let k = 0; k < 16; k++) step(t, inp(), DT) // title: past the 0.25 s screen lock
    step(t, inp(['KeyM']), DT)
    ok(t.settings.muted && t.ui.seedInput === '', 'KeyM mutes on the title (seed field not focused)')
    t.settings.muted = false
    t.ui.cursor = 5
    step(t, inp(['KeyM']), DT)
    ok(!t.settings.muted && t.ui.seedInput === 'm', 'KeyM types into the focused seed field and does not mute')
  }

  // C24 seed field: capped at SEED_MAX_LEN characters, also when several keys arrive in one update.
  {
    const s = init()
    Object.assign(s.ui, { cursor: 5, seedInput: 'a'.repeat(SEED_MAX_LEN - 1) })
    for (let k = 0; k < 16; k++) step(s, inp(), DT)
    step(s, inp(['KeyB', 'KeyC']), DT)
    ok(s.ui.seedInput === 'a'.repeat(SEED_MAX_LEN - 1) + 'b', 'seed field takes characters up to SEED_MAX_LEN only (got ' + s.ui.seedInput.length + ')')
    step(s, inp(['KeyD']), DT)
    ok(s.ui.seedInput.length === SEED_MAX_LEN, 'a full seed field ignores further characters')
  }
}
