// L3 systems: hold E at a vein to mine it (D7). Writes player.mining/energy/minerals, stats.mineralsMined, veins (splice), world.veinGen.
// Spec: docs/architecture-systems-2.md §4 (S11), R-127 (epsilon on accumulated time), R-169/R-176 (one call in step.ts, no counting spy).
// Emits mineTick (a = progress 0..1), mineDone (a = mineral index, or -1 = pouch full) and flameOut. Mining never writes ui.toasts (R-003):
// stepScreens turns `mineDone a=-1` into the 'Pouch full' toast. All progress lives in State (player.mining), none at module level.
import type { State, Vein } from '../core/types.ts'
import { MINERALS, TILE } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { emit } from './fx.ts'
import type { Intent } from './intent.ts'

// Vein face = midpoint of the shared edge of vein.tile and vein.stand (systems-2 §4). src/ui/hud.ts keeps its own copy (L4 cannot be imported here).
export const veinFaceX = (v: Vein, w: number): number => ((v.tile % w) + (v.stand % w) + 1) * TILE / 2
export const veinFaceY = (v: Vein, w: number): number => (Math.floor(v.tile / w) + Math.floor(v.stand / w) + 1) * TILE / 2

// Nearest vein within reach, ties to the lower id.
export function nearestVein(s: State): Vein | null {
  const w = s.world.w, p = s.player
  let best: Vein | null = null, bd = T.mining.reachPx
  for (const v of s.veins) {
    const d = Math.hypot(p.x - veinFaceX(v, w), p.y - veinFaceY(v, w))
    if (d > bd || (best && d === bd && v.id > best.id)) continue
    best = v
    bd = d
  }
  return best
}

const cancel = (s: State): void => {
  s.player.mining.progress = 0
  s.player.mining.targetTile = -1
}

export function stepMining(s: State, it: Intent, dt: number): void {
  const p = s.player, m = p.mining
  const v = nearestVein(s)
  if (!it.interact || it.moving || p.energy <= 0 || !v || p.roll.t > 0) { cancel(s); return }
  const fx = veinFaceX(v, s.world.w), fy = veinFaceY(v, s.world.w)
  if (p.minerals[v.mineral] >= T.minerals.cap) { // pouch full: no progress, one cue per key press
    cancel(s)
    if (it.interactEdge) emit(s, 'mineDone', fx, fy, -1)
    return
  }
  if (m.targetTile !== v.tile) { m.targetTile = v.tile; m.progress = 0 } // a new vein starts from zero
  const before = m.progress
  m.progress += dt
  p.energy -= T.mining.costPerS * dt
  if (p.energy <= 0) { // the mining cost snuffed the flame
    p.energy = 0
    emit(s, 'flameOut', p.x, p.y)
    cancel(s)
    return
  }
  if (m.progress + 1e-9 >= T.mining.holdS) { // R-127: 2 s = 120 steps
    const have = p.minerals[v.mineral], added = Math.min(T.minerals.cap, have + v.pieces) - have
    p.minerals[v.mineral] = have + added
    p.stats.mineralsMined += added
    s.veins.splice(s.veins.indexOf(v), 1)
    s.world.veinGen += 1 // walls chunk cache key (render/keys.ts tileKey): the baked ore must vanish next frame
    cancel(s)
    emit(s, 'mineDone', fx, fy, MINERALS.indexOf(v.mineral))
    return
  }
  // ponytail: tick count by crossing a multiple of tickS (0.5 s); epsilon as R-127. Ceiling: one tick per step. Fine at 60 Hz.
  if (Math.floor((m.progress + 1e-9) / T.mining.tickS) > Math.floor((before + 1e-9) / T.mining.tickS)) {
    emit(s, 'mineTick', fx, fy, m.progress / T.mining.holdS)
  }
}
