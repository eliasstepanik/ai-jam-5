// L3 systems: hold E at the Beacon to light it (D8) and the descent -> escape phase change.
// Spec: docs/architecture-systems-2.md §5, R-125 (START GATE on max(eStart, energy)), R-127 (epsilon on the 300-step hold),
// R-169/R-176 (one call in step.ts, no counting spy). Writes player.beaconHold/energy/mining, world.beaconLit/beaconLitAt, meta.phase,
// director.spawnT/quakeT, fx.beaconFlash/shake/shakeMag, monsters (dying), player.stats.maxPathDist/maxDepth/deepestZone (trackDepth in depth.ts is the other writer). Emits denied (gate) and beaconLit.
// Never writes ui.toasts (R-003): stepScreens turns `denied` into the toast. All progress lives in State (player.beaconHold).
import { beaconInReach, beaconPosition } from '../world/beacon-position.ts'
import type { State } from '../core/types.ts'
import { DEPTH_MAX, zoneOfDepth } from '../core/score.ts'
import { T } from '../core/tuning.ts'
import { emit } from './fx.ts'
import type { Intent } from './intent.ts'
import { setDying } from './monsters.ts'

// descent only; eStart = player.energy read by step() before stepFlame (R-125, a local, not a State field)
export function stepBeacon(s: State, it: Intent, dt: number, eStart: number): void {
  const p = s.player, w = s.world
  if (w.beaconLit || s.meta.phase !== 'descent') return
  if (!beaconInReach(s, T.beacon.reachPx) || !it.interact || it.moving) { p.beaconHold = 0; return }
  if (p.beaconHold > 0 && p.energy <= 0) p.beaconHold = 0 // a hit emptied the flame mid-hold: cancelled
  if (p.beaconHold === 0 && Math.max(eStart, p.energy) < T.beacon.minStartE) { // START GATE (also covers e <= 0)
    if (it.interactEdge) emit(s, 'denied', p.x, p.y) // no cost, no progress, one cue per key press
    return
  }
  p.beaconHold += dt
  if (!s.debug.freezeTorch) p.energy = Math.max(T.beacon.minEnergyE, p.energy - T.beacon.costPerS * dt) // never below the floor once started
  if (p.beaconHold + 1e-9 >= T.beacon.holdS) lightBeacon(s) // R-127: 300 steps of 1/60 reach 5 s
}

export function lightBeacon(s: State): void {
  const p = s.player, w = s.world, fx = s.fx, B = T.beacon
  w.beaconLit = true
  w.beaconLitAt = s.meta.time
  s.meta.phase = 'escape' // energy stays frozen: stepFlame returns early in escape
  // The Beacon is the deepest point: lighting it means the run reached max depth (#146).
  // Math.max so these never decrease; trackDepth only ever raises them, so it cannot undo this.
  const st = p.stats
  st.maxPathDist = Math.max(st.maxPathDist, w.beaconDist)
  st.maxDepth = Math.max(st.maxDepth, DEPTH_MAX)
  st.deepestZone = zoneOfDepth(st.maxDepth)
  p.beaconHold = 0
  p.mining.targetTile = -1
  p.mining.progress = 0
  for (const m of s.monsters) if (m.ai !== 'dying') setDying(s, m) // the blast of light kills them: no kill credit
  s.director.spawnT = T.escape.firstSpawnS
  s.director.quakeT = T.escape.firstRockS
  fx.beaconFlash = B.flashS
  // same strongest-wins rule as addShake, with the Beacon's own numbers
  const currentAmp = fx.shakeMag * Math.min(1, fx.shake / T.cam.shakeDecayS)
  fx.shakeMag = Math.min(T.cam.shakeMaxPx, Math.max(currentAmp, B.shakePx))
  fx.shake = Math.max(fx.shake, B.shakeS)
  const { x, y } = beaconPosition(s)
  emit(s, 'beaconLit', x, y)
}
