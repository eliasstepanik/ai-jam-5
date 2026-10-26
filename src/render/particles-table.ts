// L4 render: particle palette and the per-event spawn table (data only, no logic). Spec: docs/architecture-render-2.md §4.2.
// Counts are at quality 0; particles.ts scales them by currentQuality(s).particles and by 0.3 for `fl` bursts under reducedFlash.
// Events with no spec row (windup, lunge, win, death, denied, dodge, rockWarn) carry `// DEFAULT:` values chosen by the builder.
import type { FxEventKind } from '../core/types.ts'
import { MINERALS } from '../core/state.ts'
import { FLAME_COL } from './flame.ts'

export const TAU = Math.PI * 2

// Palette: 16 colours, one fillStyle per bucket. 3..6 = flame mantle (none, then MINERALS order); 12..15 = flame spark colours (same order).
export const C_DUST = 0, C_EMBER = 1, C_HOT = 2, C_FLAME = 3
const C_SMOKE = 7, C_BLOOD = 8, C_INK = 9, C_GREY = 10, C_HEAL = 11
export const C_SPARK = 12
export const PAL: readonly string[] = ['#8c8070', '#ffb347', '#fff4d6', FLAME_COL.none.mantle,
  ...MINERALS.map(m => FLAME_COL[m].mantle), '#2c2540', '#ff3b2a', '#000000', '#3a3a3a', '#b6ff8a',
  FLAME_COL.none.spark, ...MINERALS.map(m => FLAME_COL[m].spark)]

// Colour markers resolved per event in particles.ts: the player's active flame mantle / spark colour, or the mineral index in e.a.
export const COL_FLAME = -1, COL_SPARK = -2, COL_ARG = -3

// Shape ids: 0 square, 1 streak along the launch direction, 2 fx_dust sprite (frame by age).
// dir: 0 launch angle = `ang`; 1 = e.a (heading) + ang; 2 = e.a + PI + ang. spread: angles +- spread/2 (TAU = all round).
// jit: spawn offset +- jit/2 px (jitArg: at least e.a). ring: evenly spaced angles at speed vmax. fl: flash-type, scaled by reducedFlash.
export type Spec = {
  n: number; col: number; alt: number; add: 0 | 1; shape: 0 | 1 | 2
  vmin: number; vmax: number; life: number; size: number; drag: number; grav: number
  dir: 0 | 1 | 2; ang: number; spread: number; jit: number; jitArg: boolean; ring: boolean; fl: boolean
}
type Row = Partial<Spec> & { n: number }

const BASE: Spec = { n: 0, col: C_HOT, alt: C_HOT, add: 1, shape: 0, vmin: 50, vmax: 140, life: 0.35, size: 1, drag: 2, grav: 0,
  dir: 0, ang: 0, spread: TAU, jit: 0, jitArg: false, ring: false, fl: false }
const DUST: Spec = { ...BASE, col: C_DUST, alt: C_DUST, add: 0, shape: 2, vmin: 20, vmax: 60, life: 0.5, drag: 3, grav: -10 }
const add = (r: Row): Spec => ({ ...BASE, ...r })
const norm = (r: Row): Spec => ({ ...BASE, add: 0, ...r })
const dust = (r: Row): Spec => ({ ...DUST, ...r })

export type SpawnKind = Exclude<FxEventKind, 'uiMove' | 'uiConfirm' | 'uiBack' | 'copyLink'> // the compiler forces a row per fx kind

export const TABLE: Record<SpawnKind, readonly Spec[]> = {
  swing: [add({ n: 6, col: COL_SPARK, alt: COL_SPARK, shape: 1, size: 4, vmin: 60, vmax: 140, life: 0.25, dir: 1, spread: 1.2 })],
  parryPerfect: [
    add({ n: 24, col: COL_SPARK, alt: C_HOT, vmin: 120, vmax: 260, life: 0.45, fl: true }),
    add({ n: 12, col: C_HOT, alt: C_HOT, vmin: 180, vmax: 180, life: 0.45, ring: true, fl: true }), // DEFAULT: ring = 12 evenly spaced sparks
  ],
  parryGood: [add({ n: 10, col: COL_SPARK, alt: COL_SPARK, vmin: 80, vmax: 180, life: 0.35, fl: true })],
  parryPoor: [
    norm({ n: 8, col: C_SMOKE, alt: C_SMOKE, vmin: 30, vmax: 90, life: 0.6, grav: -20 }),
    add({ n: 6, col: COL_FLAME, alt: COL_FLAME, vmin: 30, vmax: 90, life: 0.6 }),
  ],
  flameHit: [
    norm({ n: 8, col: C_SMOKE, alt: C_SMOKE, vmin: 30, vmax: 90, life: 0.6, grav: -20 }),
    add({ n: 6, col: COL_FLAME, alt: COL_FLAME, vmin: 30, vmax: 90, life: 0.6 }),
  ],
  hpHit: [norm({ n: 10, col: C_BLOOD, alt: C_BLOOD, vmin: 60, vmax: 150, life: 0.4 })],
  monsterDie: [norm({ n: 14, col: C_INK, alt: C_INK, vmin: 40, vmax: 120, life: 0.6 })],
  flameOut: [norm({ n: 10, col: C_GREY, alt: C_GREY, vmin: 10, vmax: 40, life: 1, grav: -40 })],
  relight: [add({ n: 16, col: COL_FLAME, alt: C_HOT, vmin: 40, vmax: 160, life: 0.5, fl: true })],
  toss: [add({ n: 16, col: COL_ARG, alt: C_HOT, vmin: 40, vmax: 160, life: 0.5 })], // a = -1: denied, nothing drawn
  shakeOff: [add({ n: 8, col: C_FLAME, alt: C_FLAME, vmin: 40, vmax: 120, life: 0.4 })],
  heal: [add({ n: 10, col: C_HEAL, alt: C_HEAL, vmin: 10, vmax: 40, life: 0.9, grav: -30 })], // DEFAULT: grav -30 = rising
  // mineTick carries progress, not the mineral, so it sparks pale crystal light (ponytail: upgrade = look the vein up at e.x, e.y).
  mineTick: [add({ n: 4, grav: 120, jit: 4 })],
  mineDone: [add({ n: 10, col: COL_ARG, alt: C_HOT, grav: 120, jit: 6 })], // a = -1: pouch full, nothing drawn
  roll: [dust({ n: 6, size: 0.5, dir: 2, spread: 1.2, jit: 6 })], // a = heading: dust kicks out behind the player
  rockLand: [dust({ n: 14, jit: 10 })],
  beaconLit: [add({ n: 48, col: C_EMBER, alt: C_HOT, vmin: 60, vmax: 300, life: 1.2, drag: 1.5, grav: -40, size: 2, fl: true })],
  // DEFAULT rows (not in the spec table):
  rockWarn: [norm({ n: 3, col: C_DUST, alt: C_DUST, vmin: 0, vmax: 20, life: 0.4, drag: 1, grav: 90, jit: 8, jitArg: true })], // grit above the marker
  dodge: [add({ n: 4, col: C_EMBER, alt: C_HOT, shape: 1, size: 4, vmin: 80, vmax: 160, life: 0.25 })], // short spark streak
  windup: [add({ n: 4, col: C_BLOOD, alt: C_BLOOD, vmin: 10, vmax: 40, life: 0.3, grav: -30, jit: 8 })], // red tell over the monster
  lunge: [dust({ n: 5, vmin: 30, vmax: 80, life: 0.35, jit: 6 })], // a = monster kind, no heading: dust puff all round
  win: [add({ n: 40, col: C_EMBER, alt: C_HOT, vmin: 40, vmax: 220, life: 1.5, grav: -30, size: 2, fl: true })],
  death: [norm({ n: 30, col: C_GREY, alt: C_SMOKE, vmin: 20, vmax: 90, life: 1.4, grav: -25, size: 2 })],
  denied: [norm({ n: 6, col: C_GREY, alt: C_DUST, vmin: 20, vmax: 70, life: 0.4, drag: 3, jit: 6 })], // Beacon start gate only
}
