// B11 economy check. Part 1: the pure expected-value flame economy simulator of docs/architecture-economy-simulator.md §3
// (binding; supersedes the economy-check §8 draft) with its numeric asserts and the tuning cross-check. Part 2: the runtime rows of
// docs/architecture-systems-4.md §8 (#5 mining, #6 minerals, #7/#7a/#7b Beacon) through step(). Overlaps beacon/mining/minerals checks on
// purpose with the same fixtures: this is the single place that asserts the full §8 list. L0-L3 imports only; DOM-free; state is local.
import { MATERIAL_CHANGE_S } from '../core/player-actions.ts'
import type { Input } from '../main.ts'
import type { State, Vein } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

// ---- Part 1: pure simulator (no State, no RNG, no DOM below this line until Part 2) ----
type Z4 = [number, number, number, number]
type Profile = { zoneS: number; hitEps: Z4; spread: number; resin: string[] }
type Mod = { extraS: number; extraE: number; burnMul: number; hitMul: number }

// ponytail: means at D* 600 only. The literals are deliberate: run() asserts T.* equals them, so a tuning drift fails here
// (a simulator reading T.* would follow the drift and stay green). Add D 510/690 counts and Monte-Carlo hits when variance matters.
const E_MAX = 100, GATE_E = 40, SMALL_E = 25, LARGE_E = 50, CLUSTER_E = 50 + 2 * 25, DETOUR_E = 4
const BURN: Z4 = [0.5, 0.7, 1.0, 1.4]
const MINE_E = 3 * 2 * 1.5 // 3 E/s × 2 s × 1.5 veins per zone
const HOLD_E = 4 * 5 + BURN[3] * 5 // 27 E
const CLUSTER_AT = 1 - 20 / (600 / 4) // bd − 20 inside the 150-tile zone 4
const NEAR = ['SSS', 'SSSS', 'SSSLSS', 'SSLSS'] // near-path, first 60 % of each zone
const ALL = ['SSSSSS', 'SSSLSSSS', 'SSSLSSLSS', 'SSLSSLS'] // near + off-path (beginner)

export const MID: Profile = { zoneS: 67, hitEps: [0.18, 0.67, 1.0, 1.07], spread: 0.6, resin: NEAR }
export const BEG: Profile = { zoneS: 83, hitEps: [0.27, 1.23, 1.77, 1.89], spread: 0.8, resin: ALL }
export const EXP: Profile = { zoneS: 55, hitEps: [0.09, 0.26, 0.41, 0.44], spread: 0.6, resin: NEAR }
const PLAIN: Mod = { extraS: 0, extraE: 0, burnMul: 1, hitMul: 1 }
const GREEDY: Mod = { ...PLAIN, extraS: 20, extraE: 9 }
const SODIUM: Mod = { ...PLAIN, burnMul: 1.5, hitMul: 1.6 }
const CALM: Mod = { ...PLAIN, hitMul: 0.5 } // strontium / copper

// linear drain, pickups at (k + 0.5) / n × spread, clamp at E_MAX; dip = lowest energy before a pickup
function zone(e: number, need: number, items: string, spread: number) {
  let x = 0, dip = E_MAX
  for (let k = 0; k < items.length; k++) {
    const s = ((k + 0.5) / items.length) * spread
    e -= (s - x) * need
    x = s
    dip = Math.min(dip, e)
    e = Math.min(E_MAX, e + (items[k] === 'L' ? LARGE_E : SMALL_E))
  }
  return { e, x, dip }
}

// borders[i] = energy leaving zone i (1 = depth 20, 3 = Beacon without cluster); negative = dark deficit
export function descend(p: Profile, z4: Mod = PLAIN, cluster = true) {
  const borders: number[] = []
  let e = E_MAX, need = 0, r = { e, x: 0, dip: E_MAX }
  for (let i = 0; i < 4; i++) {
    const m = i === 3 ? z4 : PLAIN
    need = (BURN[i] * m.burnMul + p.hitEps[i] * m.hitMul) * (p.zoneS + m.extraS) + MINE_E + m.extraE
    r = zone(e, need, p.resin[i], p.spread)
    e = r.e - (1 - r.x) * need
    borders.push(e)
  }
  const atCluster = r.e - (CLUSTER_AT - r.x) * need
  const relit = Math.min(E_MAX, Math.max(0, atCluster - DETOUR_E) + CLUSTER_E) - DETOUR_E
  return { borders, dip: r.dip, atCluster, beacon: cluster ? relit - (1 - CLUSTER_AT) * need : e }
}

// farthest out-and-back detour (tiles) that still gains energy (part 3 §1.4)
export const backfillMaxTiles = (gainE: number, drainEps: number, overhead = 1) => (1.875 * gainE) / (overhead * drainEps)


const ok = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(`check failed: economy: ${msg}`)
}

function simulator(): void {
  const mid = descend(MID), beg = descend(BEG), exp = descend(EXP, PLAIN, false), midSkip = descend(MID, PLAIN, false)
  const want: [number, number, string][] = [
    [mid.borders[1], 52.1, 'mid depth 20'], [mid.borders[2], 35.7, 'mid Z3→4'], [mid.dip, 25.2, 'mid Z4 dip'],
    [midSkip.beacon, 11.1, 'mid Beacon, no cluster'], [mid.beacon, 72.8, 'mid Beacon, cluster'],
    [beg.borders[1], 57.7, 'beginner depth 20'], [beg.borders[2], 41.6, 'beginner Z3→4'],
    [beg.dip, 11.1, 'beginner Z4 dip'], [beg.beacon, 58.4, 'beginner Beacon, cluster'],
    [exp.beacon, 49.3, 'expert Beacon, no cluster'], [HOLD_E, 27, 'Beacon hold'],
    [backfillMaxTiles(SMALL_E, BURN[3] + MID.hitEps[3]), 19.0, 'Z4 mid break-even, small'],
  ]
  for (const [got, w, msg] of want) ok(Math.abs(got - w) <= 1, `${msg}: ${got.toFixed(1)} vs ${w}`)
  ok(midSkip.beacon < GATE_E && mid.beacon >= GATE_E, 'gate blocks mid only when the cluster is skipped')
  ok(exp.beacon >= GATE_E && GATE_E > HOLD_E, 'expert passes without the cluster; gate covers the hold')
  ok(descend(BEG, PLAIN, false).beacon < 0, 'beginner skipping the cluster goes dark')
  ok(descend(BEG, CALM, false).beacon >= GATE_E, 'strontium/copper beginner passes without the cluster')
  for (const [name, m] of [['greedy', GREEDY], ['sodium', SODIUM]] as const) {
    ok(descend(MID, m).atCluster < 0, `${name} mid is dark before the cluster`)
    ok(descend(MID, m, false).beacon < GATE_E, `${name} mid without the cluster is gate-blocked`)
  }
  // The simulator's literals must equal the live tuning, else the asserted numbers describe a game that no longer exists.
  ok(T.flame.energyMax === E_MAX && T.beacon.minStartE === GATE_E, 'tuning: energyMax 100, Beacon start gate 40')
  ok(T.resin.smallE === SMALL_E && T.resin.largeE === LARGE_E, 'tuning: resin small 25, large 50')
  ok(T.flame.burnPerS.every((b, i) => b === BURN[i]), 'tuning: burnPerS ' + BURN.join('/'))
  ok(T.beacon.costPerS * T.beacon.holdS + BURN[3] * T.beacon.holdS === HOLD_E, 'tuning: Beacon hold costs 27 E (4 E/s x 5 s + burn)')
  ok(T.mining.costPerS * T.mining.holdS === 6, 'tuning: one vein costs 3 E/s x 2 s = 6 E')
}

// ---- Part 2: runtime rows of systems-4 §8 through step() ----
const DT = 1 / 60
const TILE = 32
const inp = (held: string[] = [], pressed: string[] = []): Input => ({
  keys: new Set(held), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 },
})
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol

function quiet(): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.debug.freezeAi = true
  Object.assign(s, { monsters: [], pickups: [] })
  return s
}
// One vein, the player on its stand tile.
function mineSetup(pieces: number, mineral: Vein['mineral'] = 'sodium'): State {
  const s = quiet()
  const v = s.veins[0]
  s.veins = [{ ...v, mineral, pieces }]
  s.player.x = (v.stand % s.world.w) * TILE + TILE / 2
  s.player.y = Math.floor(v.stand / s.world.w) * TILE + TILE / 2
  return s
}
const mine = (s: State, n: number, keys: string[] = ['KeyE']): void => { for (let k = 0; k < n; k++) step(s, inp(keys), DT) }

// Quiet zone 4 run on the Beacon centre with energy e; `denied` tallies the denied cues per step (events prune after 30 steps).
function beaconSetup(e: number): State {
  const s = quiet()
  s.veins = []
  s.player.x = s.world.beacon.tx * TILE + TILE / 2
  s.player.y = s.world.beacon.ty * TILE + TILE / 2
  s.player.energy = e
  return s
}
function holdE(s: State, n: number, pressFirst: boolean, perStep?: (s: State) => void): number {
  let denied = 0
  for (let k = 0; k < n; k++) {
    step(s, inp(['KeyE'], pressFirst && k === 0 ? ['KeyE'] : []), DT)
    denied += s.fx.events.filter(e => e.kind === 'denied' && e.step === s.meta.steps).length
    perStep?.(s)
  }
  return denied
}

function mining(): void {
  // #5 120 steps: the vein goes on step 120 (not 119), pieces capped at 3, energy drained by >= 6.
  const a = mineSetup(3), e0 = a.player.energy
  mine(a, 119)
  ok(a.veins.length === 1 && a.player.minerals.sodium === 0, '#5 step 119: vein still there')
  mine(a, 1)
  ok(a.veins.length === 0 && a.player.minerals.sodium === 3, '#5 step 120: vein removed, 3 pieces')
  ok(e0 - a.player.energy >= 6, '#5 energy drained >= 6 (got ' + (e0 - a.player.energy) + ')')
  const c = mineSetup(3)
  c.player.minerals.sodium = 2
  mine(c, 120)
  ok(c.player.minerals.sodium === T.minerals.cap && T.minerals.cap === 3, '#5 pouch capped at 3 (got ' + c.player.minerals.sodium + ')')
  // #5 moving at step 60 resets progress; the vein stays.
  const m = mineSetup(2)
  mine(m, 59)
  step(m, inp(['KeyE', 'KeyD']), DT)
  ok(m.player.mining.progress === 0 && m.veins.length === 1, '#5 moving at step 60: progress 0, vein kept')
}

const finishMaterial = (s: State): void => {
  if (s.player.pendingMaterial !== null) for (let i = 0; i < Math.ceil(MATERIAL_CHANGE_S / DT); i++) step(s, inp(), DT)
}

function minerals(): void {
  // #6 worked sequence of systems-2 §6 (sodium 2, copper 1): copper 0, sodium 1, used 2, then the copper toss is denied.
  const s = quiet()
  Object.assign(s.player.minerals, { sodium: 2, copper: 1, strontium: 0 })
  step(s, inp([], ['Digit2']), DT)
  step(s, inp([], ['KeyF']), DT); finishMaterial(s)
  ok(s.player.minerals.copper === 0 && s.player.activeMineral === 'copper', '#6 copper toss: copper 0, active copper')
  step(s, inp([], ['Digit1']), DT)
  step(s, inp([], ['KeyF']), DT); finishMaterial(s)
  ok(s.player.minerals.sodium === 1 && s.player.activeMineral === 'sodium' && s.player.stats.mineralsUsed === 2, '#6 sodium toss: sodium 1, used 2')
  step(s, inp([], ['Digit2']), DT)
  step(s, inp([], ['KeyF']), DT); finishMaterial(s)
  ok(s.player.minerals.copper === 0 && s.player.activeMineral === 'sodium' && s.player.stats.mineralsUsed === 2, '#6 third toss denied, nothing changes')
  ok(s.fx.events.some(e => e.kind === 'toss' && e.a === -1 && e.step === s.meta.steps), '#6 denied toss emits toss a = -1')
  // #6 toss into a dead flame is denied (copper stays).
  const d = quiet()
  d.player.energy = 0
  Object.assign(d.player.minerals, { copper: 3 })
  d.player.selected = 'copper'
  step(d, inp([], ['KeyF']), DT)
  ok(d.player.minerals.copper === 3 && d.player.activeMineral === 'none' && d.player.stats.mineralsUsed === 0, '#6 dead flame: toss denied')
  ok(d.fx.events.some(e => e.kind === 'toss' && e.a === -1), '#6 dead flame: toss a = -1')
}

function beacon(): void {
  // #7 e = 40.0: hold starts, descent after step 299, escape ON step 300, energy 13.0 +-0.1 (>= 1), monsters dying, one denied of none.
  const a = beaconSetup(40)
  spawnMonster(a, 'lurker', a.player.x + 150, a.player.y, 100)
  let denied = holdE(a, 299, true)
  ok(a.meta.zone === 4, '#7 the Beacon sits in zone 4 (got ' + a.meta.zone + ')')
  ok(a.meta.phase === 'descent' && !a.world.beaconLit && a.player.beaconHold > 0, '#7 step 299: still descent, holding')
  denied += holdE(a, 1, false)
  ok(denied === 0, '#7 e = 40.0: no denied')
  ok(a.meta.phase === 'escape' && a.world.beaconLit && a.player.beaconHold === 0, '#7 step 300: escape, lit')
  ok(near(a.player.energy, 13, 0.1) && a.player.energy >= T.beacon.minEnergyE, '#7 energy 13.0 +-0.1 (got ' + a.player.energy + ')')
  ok(a.monsters.length === 1 && a.monsters.every(m => m.ai === 'dying'), '#7 monsters dying')
  // #7a e = 39.9: exactly one denied, beaconHold 0 every step, still descent, energy 32.9; then e = 40 after a release starts the hold.
  const b = beaconSetup(39.9)
  let held = 0
  const dn = holdE(b, 300, true, x => { if (x.player.beaconHold !== 0) held++ })
  ok(dn === 1 && held === 0, '#7a e = 39.9: one denied (got ' + dn + '), beaconHold 0 on every step')
  ok(b.meta.phase === 'descent' && !b.world.beaconLit && near(b.player.energy, 32.9, 0.01), '#7a descent, not lit, energy 32.9 (got ' + b.player.energy + ')')
  step(b, inp(), DT)
  b.player.energy = 40
  const again = holdE(b, 2, true)
  ok(b.player.beaconHold > 0 && again === 0, '#7a e = 40 after a release: hold starts, no denied')
  // #7b e = 30 plus a small resin under the player: the start gate sees 55, the hold starts.
  const c = beaconSetup(30)
  c.pickups.push({ id: 1, kind: 'resin', x: c.player.x, y: c.player.y, bob: 0, size: 'small' })
  const dc = holdE(c, 1, true)
  ok(c.player.beaconHold > 0 && dc === 0, '#7b e = 30 + small resin: hold starts, no denied')
}

export function run(): void {
  simulator()
  mining()
  minerals()
  beacon()
}
