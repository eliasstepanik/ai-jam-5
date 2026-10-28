// L0 core: shape constants and the title-screen State. Spec: docs/architecture-modules-core.md §3.2,
// architecture-state.md §3/§6/§8, architecture-state-2.md §10, architecture-rulings-2.md §9 (extra defaults), R-146.
// init() is pure and cheap: no cave, no storage, no DOM, no draws. A new State field needs its default here.
import type { MineralId, Player, State } from './types.ts'
import { T } from './tuning.ts'

export const STATE_VERSION = 1
export const MINERALS: readonly MineralId[] = ['sodium', 'copper', 'strontium'] // hotbar order 1,2,3
// Defined only here (R-019); a change needs a STATE_VERSION bump, so they stay out of T.
export const TILE = 32
export const MAP_W = 320
export const MAP_H = 240
export const FX_EVENTS_MAX = 32
export const HELP_PAGES = 3
export const TOAST_S = 1.8 // architecture-ui-2.md §1 toast row: seconds a toast stays up
export const TOAST_MAX = 3 // same row: at most 3 on screen; a 4th drops the oldest

export const flameOut = (p: Player): boolean => p.energy <= 0

// R-009: the one toast helper, usable from any layer (L0 storage, L3 systems). Keeps the newest TOAST_MAX.
export function toast(s: State, text: string): void {
  const q = s.ui.toasts
  q.push({ text, t: TOAST_S })
  if (q.length > TOAST_MAX) q.splice(0, q.length - TOAST_MAX)
}

// "Default" column of architecture-state.md §8; startRun sets position and facing = PI / 2.
export function initPlayer(): Player {
  return {
    x: 0, y: 0,
    vx: 0, vy: 0,
    facing: 0,
    hp: T.player.hpMax, hpMax: T.player.hpMax, // R-146: max values are copied from T once per run
    energy: T.flame.energyMax, energyMax: T.flame.energyMax,
    activeMineral: 'none',
    selected: 'sodium',
    minerals: { sodium: 0, copper: 0, strontium: 0 },
    swing: { active: false, t: 0, dir: 0, cooldown: 0, buffer: 0 },
    parry: { lastGrade: 'none', lastDelta: 0, lastAt: -1, energyLost: 0 },
    roll: { t: 0, cooldown: 0, dirX: 1, dirY: 0, invuln: 0 },
    mining: { targetTile: -1, progress: 0 },
    pendingMaterial: null,
    pickupAt: -1, materialChangeAt: -1,
    beaconHold: 0,
    hurtT: 0,
    hitFlash: 0,
    gaitPhase: 0, gaitSpeed: 0,
    stats: {
      mineralsUsed: 0, mineralsMined: 0, kills: 0, parries: 0, perfectParries: 0,
      damageTaken: 0, energyLostToHits: 0, resinUsed: 0, plantsEaten: 0,
      maxPathDist: 0, maxDepth: 0, deepestZone: 1,
    },
  }
}

export function init(): State {
  return {
    version: STATE_VERSION,
    meta: { seed: 0, seedText: '', screen: 'title', phase: 'descent', time: 0, steps: 0, palette: [1, 1, 1], zone: 1, runId: 0, nextId: 1 },
    player: initPlayer(),
    world: {
      w: MAP_W, h: MAP_H, tiles: '', tilesHash: 0,
      entrance: { tx: 0, ty: 0 }, exit: { tx: 0, ty: 0 }, beacon: { tx: 0, ty: 0 },
      beaconDist: 1, beaconLit: false, explored: [], solidSig: 0,
      exploreKey: -1, pendingSig: 0, beaconLitAt: 0, veinGen: 0,
    },
    monsters: [], pickups: [], veins: [], rocks: [],
    director: {
      spawnT: T.director.firstSpawnS, quakeT: 0, alive: { lurker: 0, stalker: 0, devourer: 0 },
      escapeT: 0, relocates: 0,
    },
    cam: { x: 0, y: 0 },
    fx: { shake: 0, shakeMag: 0, flare: 0, beaconFlash: 0, hitstop: 0, seq: 1, events: [] },
    rng: { cave: 0, gameplay: 0, cosmetic: 0 },
    ui: {
      cursor: 0, helpPage: 0, toasts: [], storageOk: true, seedInput: '', copied: 0,
      hover: -1, screenAt: 0, settingsFrom: 'title', settingsDrag: -1, helpFrom: 'title', confirmT: 0, denyT: 0, copyMsg: '',
      genPending: '', genAttempt: 0, bestClass: 3,
    },
    settings: { musicVolume: 0.7, sfxVolume: 0.7, pureDarkness: false, volume: 0.7, muted: false, lastSeed: '', loaded: false, reducedFlash: false, quality: 'auto', depthClass: 1 },
    best: null, result: null,
    debug: { reveal: false, god: false, showPaths: false, freezeAi: false, overlay: false,
      noclip: false, speedMul: 4, freezeTorch: false, infiniteHp: false, noFog: false,
      hurtboxes: false, animations: false, stats: false, pureDarkness: false, caveDetails: true, minimap: false, arrow: false, arrowTarget: 'beacon',
      mapOres: false, mapResin: false, mapPlants: false, mapEntrance: true, mapBeacon: true, mapMode: 'plain',
      commit: '', commitT: 0, aiViz: false, wispViz: false },
    wisp: { on: false, d: 0, p0: -1, ss: -1, ps: -1, path: [], wx: 0, wy: 0, wvx: 0, wvy: 0 },
    trail: { on: false, t: 0, p0: -1, path: [] },
  }
}
