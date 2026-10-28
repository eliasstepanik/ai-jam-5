// L0 core: all State, entity, id, score, save and generator TYPES. No runtime code; only type-only import/re-export of the monster types.
// Spec: docs/architecture-modules-core.md §3.1 (state §5-§8, state-2 §1-§9, scoring-and-save §2/§5/§6; R-067/068/082/128/130/142/150).
// State is JSON-only (no undefined, NaN, Map, Set, typed arrays); unions stay all-string (migrate's fill() compares typeof).
// A new field also needs its default in init()/initPlayer()/spawn code and its DEFAULT_* template in migrate.ts.
// Monster and MonsterAi live in types-monster.ts (300-line cap) and are re-exported here, so existing imports keep working.
import type { Monster } from './types-monster.ts'
export type { Monster, MonsterAi } from './types-monster.ts'

// --- ids (state §5) ---
export type MonsterKind = 'lurker' | 'stalker' | 'devourer'
export type MineralId = 'sodium' | 'copper' | 'strontium'
export type FlameKind = 'none' | MineralId // 'none' = plain orange flame
export type PickupKind = 'resin' | 'plant'
export type Phase = 'descent' | 'escape'
export type Screen = 'title' | 'help' | 'playing' | 'paused' | 'dead' | 'won'
export type Zone = 1 | 2 | 3 | 4
export type TileCh = '#' | '.' | ',' // wall, floor, side-room floor
export type ParryGrade = 'none' | 'perfect' | 'good' | 'poor'
export type TilePt = { tx: number; ty: number }

// --- top level (state §6) ---
export type State = {
  version: number
  meta: Meta
  player: Player
  world: World
  monsters: Monster[]
  pickups: Pickup[]
  veins: Vein[]
  rocks: Rock[]
  director: Director
  cam: Cam
  fx: Fx
  rng: Rng
  ui: Ui
  settings: Settings // mirror of persisted settings
  best: Best | null // mirror of persisted personal best
  result: RunResult | null // set when a run ends
  debug: Debug
  wisp: { on: boolean; d: number; p0: number; ss: number; ps: number; path: number[]; wx: number; wy: number; wvx: number; wvy: number } // escape guide orb (systems/escape-wisp.ts): d lead px, p0 player tile, ss/ps rock sigs, path tile ids, wx/wy world pos, wvx/wvy px/s
}

export type Meta = {
  seed: number // uint32; 0 before the first run
  seedText: string
  screen: Screen
  phase: Phase
  time: number // s, simulated time since init() on any screen
  steps: number // int, update steps spent in screen 'playing' this run; run seconds = steps / 60
  palette: number[] // smooth world colour, independent of gameplay zones
  zone: Zone // stored mirror, written by trackDepth
  runId: number // int, +1 per started run; 0 = no run yet
  nextId: number // int, next entity id (shared by monsters, pickups, veins, rocks); 0 is never used
}

// --- player (state §8) ---
export type Player = {
  x: number; y: number // world px, centre
  vx: number; vy: number // px/s
  facing: number // rad, aim direction (world space)
  hp: number // int pips, 0..hpMax
  hpMax: number // copied from T.player.hpMax by initPlayer() per run (R-146)
  energy: number // flame units 0..energyMax; flame is OUT when energy <= 0
  energyMax: number // copied from T.flame.energyMax by initPlayer() per run (R-146)
  activeMineral: FlameKind
  selected: MineralId // hotbar cursor
  minerals: Record<MineralId, number> // pieces carried, int 0..3
  swing: Swing
  parry: Parry
  roll: Roll
  mining: Mining
  pendingMaterial: FlameKind | null // apply only after the material-change clip; null means no pending action
  pickupAt: number; materialChangeAt: number // action start times; -1 before first action or after cancellation
  beaconHold: number // s held on the Beacon, reset when released
  hurtT: number // s of post-hit invulnerability left
  hitFlash: number; gaitPhase: number; gaitSpeed: number // s of red flash left; walk/run clip cycle 0..1 integrated per tick by stepMovement (both cosmetic)
  stats: Stats
}
export type Swing = {
  active: boolean // true while the arc can hit
  t: number // s ELAPSED since swing start
  dir: number // rad, locked aim at swing start
  cooldown: number // s until next swing allowed
  buffer: number // s a click during cooldown stays valid (R-068)
}
export type Parry = {
  lastGrade: ParryGrade
  lastDelta: number // s, signed; < 0 = early
  lastAt: number // meta.steps of that parry; -1 = never
  energyLost: number // flame units lost by that parry
}
export type Roll = {
  t: number // s of roll movement left
  cooldown: number
  dirX: number; dirY: number // unit vector
  invuln: number // s of i-frames left
}
export type Mining = {
  targetTile: number // tile index of the vein being mined; -1 = none
  progress: number // s accumulated
}
export type Stats = {
  mineralsUsed: number // int, pieces TOSSED into the flame (score input)
  mineralsMined: number; kills: number; parries: number; perfectParries: number
  damageTaken: number // HP pips lost
  energyLostToHits: number; resinUsed: number; plantsEaten: number
  maxPathDist: number // tiles
  maxDepth: number // int 0..40
  deepestZone: Zone
}

// --- world and entities (state-2 §1-§6) ---
export type World = {
  w: number // tiles, MAP_W
  h: number // tiles, MAP_H
  tiles: string // length w*h, one TileCh per tile, row-major; IMMUTABLE during a run; '' on title
  tilesHash: number // uint32 FNV-1a of tiles; cache key; 0 on title
  entrance: TilePt
  exit: TilePt // always equal to entrance
  beacon: TilePt
  beaconDist: number // tiles, path distance entrance->beacon (> 0, it is a divisor)
  beaconLit: boolean
  explored: number[] // bitset, ceil(w*h/32) int32 words
  solidSig: number // int, +1 each time a rock lands
  exploreKey: number // explore skip cache key, -1 = none
  pendingSig: number // int, +1 on every rock commit, landing, shrink and cancel
  beaconLitAt: number // meta.time when the Beacon was lit; 0 = not yet
  veinGen: number // int, +1 each time a vein is mined away; part of the walls chunk cache key (render/keys.ts tileKey)
  depthClass?: number // 1..4 (R-164), undefined means 3
}

export type Pickup = {
  id: number
  kind: PickupKind
  x: number; y: number // world px, centre of a floor tile
  bob: number // rad, idle bob phase (cosmetic)
  size: 'small' | 'large' // resin amount (T.resin.smallE / largeE)
}
export type Vein = {
  id: number
  mineral: MineralId
  tile: number // tile index of the WALL tile the vein sits in
  stand: number // tile index of the adjacent floor tile it is mined from
  pieces: number // int 1..2
}
export type Rock = {
  id: number
  x: number; y: number // world px, centre of the footprint
  size: 1 | 2 // footprint side in tiles
  tiles: number[] // footprint tile indices (1 or 4)
  t: number // s of telegraph left
  landed: boolean
  hit: boolean // landing damage check has run
  shrunk: boolean // a 2x2 was shrunk to 1x1 at impact
}
export type Director = {
  spawnT: number // s until the next spawn attempt
  quakeT: number // s until the next rock (escape only)
  alive: Record<MonsterKind, number> // stored mirror of monsters[]
  escapeT: number // s elapsed in the escape phase
  relocates: number // int, debug counter for stuck-shade relocations
}
export type Cam = { x: number; y: number } // world px, smoothed camera centre
// --- fx, rng, ui (state-2 §7-§9). FxEventKind: 28 members, authoritative list; do not restate elsewhere. ---
export type FxEventKind =
  | 'swing' | 'parryPerfect' | 'parryGood' | 'parryPoor' | 'flameHit' | 'hpHit'
  | 'monsterDie' | 'flameOut' | 'relight' | 'heal' | 'mineTick' | 'mineDone'
  | 'toss' | 'shakeOff' | 'roll' | 'beaconLit' | 'rockWarn' | 'rockLand' | 'win' | 'death'
  | 'dodge' | 'windup' | 'lunge' | 'denied' // systems (denied = Beacon START GATE only, R-128)
  | 'uiMove' | 'uiConfirm' | 'uiBack' | 'copyLink' // screens / platformStep
export type FxEvent = {
  seq: number // int, strictly increasing
  kind: FxEventKind
  x: number; y: number // world px
  a: number // free scalar, kind-specific; 0 if unused
  step: number // meta.steps when emitted
}
export type Fx = {
  shake: number // s of screen shake left
  shakeMag: number // px amplitude at shake start
  flare: number // s of perfect-parry flare left
  beaconFlash: number // s of white-out after lighting the Beacon
  hitstop: number // s of perfect-parry freeze left; only step() decrements it (R-067)
  seq: number // int, next event seq
  events: FxEvent[] // max FX_EVENTS_MAX = 32
}
export type Rng = { cave: number; gameplay: number; cosmetic: number } // uint32 stream states
export type Toast = { text: string; t: number } // t = s left
export type Ui = {
  cursor: number // int, selected menu item
  helpPage: number // int, 0..HELP_PAGES-1
  toasts: Toast[]
  storageOk: boolean
  seedInput: string // '' = random
  copied: number // s left of the "link copied" label
  hover: number // int, hovered button; -1 = none
  screenAt: number // meta.time of the last screen change
  helpFrom: 'title' | 'paused' // Help is reachable from two screens
  confirmT: number // s left of the quit-to-title confirm window
  denyT: number // s left of the hotbar deny shake
  copyMsg: string // 'Copied!' vs 'Copy failed ...'
  genPending: string // '' = idle, else the seed key of the chunked cave generation
  genAttempt: number // int, current generation attempt 0..MAX_ATTEMPTS
  bestClass: number // depth class the mirrored Best was loaded for (3 = Standard); lets screens reload Best after a hot swap
}
export type Settings = {
  volume: number // 0..1
  muted: boolean
  lastSeed: string
  loaded: boolean // loadSettings() ran this page session
  reducedFlash: boolean
  quality: 'auto' | 'q0' | 'q1' | 'q2' | 'q3' // render override (R-142)
  depthClass?: number | 'random' // 1..4 or 'random' (R-164), undefined means 3
}
export type Debug = {
  reveal: boolean; god: boolean; showPaths: boolean; freezeAi: boolean; overlay: boolean
  noclip: boolean; speedMul: number; freezeTorch: boolean; infiniteHp: boolean; noFog: boolean
  hurtboxes: boolean; animations: boolean; stats: boolean; pureDarkness: boolean; caveDetails: boolean
  mapOres: boolean; mapResin: boolean; mapPlants: boolean; mapEntrance: boolean; mapBeacon: boolean
  mapMode: 'plain' | 'zones' | 'distance'
  minimap: boolean; arrow: boolean; arrowTarget: 'beacon' | 'exit'; commit: string; commitT: number // commit: dev-only short sha ('' = not fetched yet), commitT: s to next fetch
}

// --- score and save (scoring-and-save §2, §5, §6; SettingsRecord per R-025/R-142) ---
export type ScoreInput = { depth: number; won: boolean; seconds: number; mineralsUsed: number; hpLeft: number }
export type ScoreParts = { depth: number; win: number; time: number; minerals: number; hp: number; total: number }
export type RunResult = {
  won: boolean
  depth: number // stats.maxDepth
  zone: Zone // stats.deepestZone
  seconds: number // floor(steps / 60)
  mineralsUsed: number
  hpLeft: number
  parts: ScoreParts
  seed: number
  seedText: string
  kills: number; parries: number; perfectParries: number
  isNewBest: boolean
  prevBest: number // 0 if none
  endAt: number // meta.time when endRun ran
}
export type Best = {
  v: 1 // schema version of the stored record
  score: number
  depth: number
  seconds: number
  won: boolean
  mineralsUsed: number
  hpLeft: number
  seedText: string
  at: string // ISO 8601, set in storage.ts
}
export type SettingsRecord = {
  v: 1; volume: number; muted: boolean; lastSeed: string; reducedFlash: boolean
  quality: 'auto' | 'q0' | 'q1' | 'q2' | 'q3' // any other stored value loads as 'auto'
}

// --- generator types (R-150; shared by world/generate, gen/populate, gen/fallback, validate) ---
// ponytail: one file for all types; CaveCore holds typed arrays but never reaches State. Split by group only past 300 lines.
export type CaveStats = {
  attempts: number; floor: number; dropped: number; beaconDist: number; loops: number; tunnelTiles: number
  chamberR: number; mainLoop: boolean; fallback: boolean; ecc: number; treeDraws: number
}
export type SpawnHint = { kind: MonsterKind; x: number; y: number }
export type CaveResult = {
  tiles: string
  entrance: TilePt; exit: TilePt
  beacon: TilePt
  beaconDist: number
  chamber: number[] // beacon-room mask indices, ascending
  veins: Vein[]; pickups: Pickup[] // id 0; startRun assigns ids
  spawns: SpawnHint[]
  stats: CaveStats
  rngState: number // 'cave:spare' state -> s.rng.cave
}
export type GenOpts = { skip?: readonly ('veins' | 'pickups' | 'spawns' | 'rooms')[]; forceFail?: boolean } // test-only
export type CaveCore = {
  w: number; h: number
  t: Uint8Array // 0 '#', 1 '.', 2 ','
  entrance: number; beacon: number // tile indices
  dist: Int32Array
  beaconDist: number
  beaconMask: Uint8Array
  chamber: number[]
  stats: CaveStats
}
