// FxEvent -> sound trigger table + danger / music / ducking derivations (resources-2 §4, §5, §8).
// Pure functions of (event, State). Layer L4: no engine/sfx/music imports, no module-level mutable state.
import type { FlameKind, FxEvent, FxEventKind, MonsterKind, State } from '../core/types.ts'
import { pausedMenu } from '../core/settings.ts'
import { MINERALS } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { hash2 } from '../core/noise.ts'
import { lightRadius } from '../systems/light.ts'
import type { Group, SoundId } from '../assets/sounds.ts'
import type { Duck } from './mixer.ts'

export type PlayParams = {
  x?: number; y?: number // world px; omitted = non-positional
  q?: number // 0..1 quality scalar (parryGood)
  mineral?: FlameKind
  rate?: number // playback-rate multiplier
  gain?: number // multiplier on the SOUNDS base gain
  delay?: number // s after the event
  seq: number
}
export type Trigger = {
  id: (e: FxEvent, s: State) => SoundId
  params: (e: FxEvent, s: State) => PlayParams
}

const KINDS: readonly MonsterKind[] = ['lurker', 'stalker', 'devourer'] // = monsters.ts KIND_INDEX order
const KIND_RATE: Record<MonsterKind, number> = { lurker: 1.4, stalker: 1.0, devourer: 0.6 }
const KIND_GAIN: Record<MonsterKind, number> = { lurker: 0.6, stalker: 0.8, devourer: 1.0 }

const kindOf = (a: number): MonsterKind => KINDS[a] ?? 'lurker'

// windup `a` is the beat index, not the kind (monsters.ts), so find the emitting monster by position.
function nearestKind(e: FxEvent, s: State): MonsterKind {
  let best: MonsterKind = 'lurker'
  let bd = Infinity
  for (const m of s.monsters) {
    const d = (m.x - e.x) ** 2 + (m.y - e.y) ** 2
    if (d < bd) { bd = d; best = m.kind }
  }
  return best
}

const at = (e: FxEvent, extra: Omit<PlayParams, 'seq' | 'x' | 'y'> = {}): PlayParams =>
  ({ x: e.x, y: e.y, ...extra, seq: e.seq })
const flat = (e: FxEvent, extra: Omit<PlayParams, 'seq'> = {}): PlayParams => ({ ...extra, seq: e.seq })
const fixed = (id: SoundId, gain: number, positional = false): Trigger => ({
  id: () => id,
  params: (e) => (positional ? at(e, { gain }) : flat(e, { gain })),
})
const monster = (
  id: (k: MonsterKind) => SoundId,
  kind: (e: FxEvent, s: State) => MonsterKind,
  tune: Partial<Record<MonsterKind, { rate: number; gain: number }>> = {},
): Trigger => ({
  id: (e, s) => id(kind(e, s)),
  params: (e, s) => { const k = kind(e, s); return at(e, tune[k] ?? { rate: KIND_RATE[k], gain: KIND_GAIN[k] }) },
})

// ponytail: goodWindow is not a tuning constant; derived from combat.ts parryLoss (good iff u <= goodSplit).
// `delta` is the event's `a` (signed seconds, combat.ts emits it); P carries the active mineral's perfectMul like parryLoss.
function goodWindow(delta: number, mineral: FlameKind): number {
  const p = T.parry
  const P = p.perfectS * T.minerals.table[mineral].perfectMul
  const W = Math.max(delta < 0 ? p.earlyMaxS : p.lateMaxS, P + p.minSpanS)
  return P + p.goodSplit * (W - P)
}

export const TRIGGERS: Record<FxEventKind, Trigger | null> = {
  swing: {
    id: () => 'sfx_swing',
    params: (e) => flat(e, { gain: 0.5, rate: 0.92 + 0.16 * hash2(e.seq, 3, 77) }),
  },
  parryPerfect: {
    id: () => 'sfx_parry-perfect',
    params: (e, s) => flat(e, { gain: 1.0, mineral: s.player.activeMineral }),
  },
  parryGood: {
    id: () => 'sfx_parry',
    params: (e, s) => flat(e, { gain: 0.8, q: Math.min(1, Math.max(0, 1 - Math.abs(e.a) / goodWindow(e.a, s.player.activeMineral))) }),
  },
  parryPoor: fixed('sfx_parry-bad', 0.7),
  flameHit: fixed('sfx_mon-hit', 1.0, true), // second voice: EXTRAS.flameHit
  hpHit: fixed('sfx_hurt', 0.9),
  monsterDie: monster(() => 'sfx_mon-death', (e) => kindOf(e.a)),
  flameOut: fixed('sfx_flame-out', 0.9),
  relight: {
    id: (e) => (e.a === 0 ? 'sfx_relight' : 'sfx_resin'),
    params: (e) => flat(e, { gain: e.a === 0 ? 0.9 : 0.7 }),
  },
  heal: fixed('sfx_plant-heal', 0.7),
  mineTick: {
    id: () => 'sfx_mine-hit',
    params: (e) => flat(e, { gain: e.a === 4 ? 0.7 * 1.3 : 0.7 }),
  },
  mineDone: {
    id: (e) => (e.a >= 0 ? 'sfx_mineral-collect' : 'sfx_mine-empty'),
    // R-134: empty rock carries no mineral param.
    params: (e) => (e.a >= 0 ? flat(e, { gain: 0.6, mineral: MINERALS[e.a] ?? 'none' }) : flat(e, { gain: 0.5 })),
  },
  toss: {
    id: (e) => (e.a >= 0 && MINERALS[e.a] ? `sfx_flame-toss-${MINERALS[e.a]}` as SoundId : 'ui_denied'),
    params: (e) => flat(e, { gain: e.a >= 0 ? 0.8 : 0.5 }),
  },
  shakeOff: fixed('sfx_flame-shakeoff', 0.8),
  roll: fixed('sfx_roll', 0.6),
  beaconLit: fixed('sfx_beacon-ignite', 1.0), // second voice: EXTRAS.beaconLit
  rockWarn: fixed('sfx_rock-warn', 0.7, true),
  rockLand: fixed('sfx_rock-impact', 0.9, true), // rumble swell is loopStep's job, not a trigger
  win: null,
  death: fixed('sfx_player-death', 0.8),
  dodge: null,
  windup: monster((k) => (k === 'devourer' ? 'sfx_devourer-beat' : 'sfx_eye-open'), nearestKind, { lurker: { rate: 1.2, gain: 0.85 } }), // lurker: louder + lower so the attack cue is readable
  lunge: monster(() => 'sfx_mon-lunge', (e) => kindOf(e.a)),
  denied: fixed('ui_denied', 0.5),
  uiMove: fixed('ui_click', 0.6),
  uiConfirm: fixed('ui_confirm', 0.7),
  uiBack: fixed('ui_click', 0.6),
  copyLink: null,
}

// ponytail: Trigger is one voice per event (R-043); the two double-voice events get a second table here.
// The engine plays TRIGGERS[kind] then EXTRAS[kind], both with their own `delay`.
export const EXTRAS: Partial<Record<FxEventKind, Trigger>> = {
  flameHit: {
    id: () => 'sfx_parry-bad',
    params: (e) => at(e, { gain: 0.7, delay: 0.04 }),
  },
  beaconLit: {
    id: () => 'sfx_beacon-horn',
    params: (e) => flat(e, { gain: 1.0, delay: 0.3 }),
  },
}

// --- danger (0..1): drives the descent music danger layer ---
const TELE_FALLOFF = 160 // px beyond the light radius over which a windup/lunge telegraph fades out
const RING_PAD = 96 // px beyond the light radius that still counts as "ringed"

export function danger(s: State): number {
  if (s.meta.screen !== 'playing' || s.meta.phase !== 'descent') return 0
  const p = s.player
  const R = lightRadius(s)
  let tele = 0
  let ring = 0
  for (const m of s.monsters) {
    if (m.ai === 'dying') continue
    const d = Math.hypot(m.x - p.x, m.y - p.y)
    if (m.ai === 'windup' || m.ai === 'lunge') tele = Math.max(tele, 1 - Math.min(1, Math.max(0, d - R) / TELE_FALLOFF))
    if (d < R + RING_PAD) ring += 1
  }
  // energyMax <= 0 (no energy term, e.g. a degenerate tuning): finite result, no 0/0 NaN.
  const low = p.energyMax <= 0 ? 0 : Math.min(1, Math.max(0, 1 - (p.energy / p.energyMax) * 1.5))
  const hp = p.hp <= 1 ? 0.6 : 0
  return Math.min(1, Math.max(tele, low, ring / 6, hp))
}

// --- music selection (null = silence) ---
const ESCAPE_MUSIC_DELAY = 1.5 // s after the Beacon is lit before the escape track starts

const escapeLive = (s: State): boolean => s.meta.time >= s.world.beaconLitAt + ESCAPE_MUSIC_DELAY

function runMusic(s: State): SoundId | null {
  if (s.meta.phase === 'descent') return 'mus_descent'
  return escapeLive(s) ? 'mus_escape' : null
}

export function musicFor(s: State): SoundId | null {
  switch (s.meta.screen) {
    case 'title': return 'mus_title'
    case 'settings': return s.ui.settingsFrom === 'paused' ? runMusic(s) : 'mus_title'
    // ponytail: help opened from pause keeps the run track (assumption); the engine holds it via the same id.
    case 'help': return s.ui.helpFrom === 'paused' ? runMusic(s) : 'mus_title'
    case 'playing':
    case 'paused': return runMusic(s)
    case 'dead': return 'mus_sting-death'
    case 'won': return 'mus_sting-win'
  }
}

// --- ducking: per-cause requests per bus (the mixer merges them, deepest wins; see mixer.ts applyDucks) ---
// Attack/release time constants in seconds per cause (spec §5 values, unchanged from the old duckTimes table).
const T_LOW_HP: readonly [number, number] = [0.5, 0.5] // music -3, descent at 1 HP
const T_FLARE: readonly [number, number] = [0.01, 0.6] // music/amb -6, flare active
const T_PAUSE: readonly [number, number] = [0.1, 0.2] // pause ducks (music/amb -10, sfx silent)
const T_BEACON_AMB: readonly [number, number] = [0.05, 0.1] // amb -9, escape before mus_escape starts
const T_DEFAULT: readonly [number, number] = [0.1, 0.1] // anything else (beacon music silence, dead/won)

export function duckFor(s: State): Duck {
  const d: Duck = { music: [], amb: [], sfx: [], ui: [] }
  const add = (g: Group, db: number, t: readonly [number, number]): void => {
    d[g].push({ db, attack: t[0], release: t[1] })
  }
  const { screen, phase } = s.meta
  if (screen === 'playing') {
    if (phase === 'descent' && s.player.hp === 1) add('music', -3, T_LOW_HP)
    // Beacon lit: music silent (descent stops) and amb -9 only until mus_escape starts; once escapeLive the music duck lifts so it is audible.
    if (s.world.beaconLit && !escapeLive(s)) add('music', -Infinity, T_DEFAULT)
    if (phase === 'escape' && !escapeLive(s)) add('amb', -9, T_BEACON_AMB)
  } else if (pausedMenu(s)) {
    add('music', -10, T_PAUSE)
    add('amb', -10, T_PAUSE)
    add('sfx', -Infinity, T_PAUSE)
  } else if (screen === 'dead' || screen === 'won') {
    add('amb', -12, T_DEFAULT)
    add('sfx', -6, T_DEFAULT)
  }
  if (s.fx.flare > 0) {
    add('music', -6, T_FLARE)
    add('amb', -6, T_FLARE)
  }
  return d
}
