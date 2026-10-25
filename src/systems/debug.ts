// Developer commands: deterministic world edits, no DOM or clocks. UI access is controlled by the facade.
import type { Input } from '../main.ts'
import { debugTeleport } from './debug-navigation.ts'
import { startLunge } from './monsters.ts'
import type { Monster, MonsterKind, State } from '../core/types.ts'
import { clamp } from '../core/math.ts'
import { TILE, toast } from '../core/state.ts'
import { T, zt } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { circleHitsSolid } from '../world/collide.ts'
import { nearestFloor } from '../world/sample.ts'
import { lineOfSightPx } from '../world/los.ts'
import { emit } from './fx.ts'
import { flameRadius, insideLight } from './light.ts'
import { endRun } from './run.ts'
import { begin, setDepth, shownClass } from './screens.ts'

export const DEBUG_TOGGLES = ['noclip', 'infiniteHp', 'freezeTorch', 'noFog', 'freezeAi', 'overlay', 'hurtboxes', 'animations', 'stats', 'minimap', 'arrow', 'showPaths', 'mapOres', 'mapResin', 'mapPlants', 'mapEntrance', 'mapExit', 'mapBeacon'] as const
export type DebugToggle = typeof DEBUG_TOGGLES[number]
export type DebugAction = DebugToggle | MonsterKind | 'extinguish' | 'refill' | 'kill' | 'teleportEntrance' | 'teleportBeacon' | 'arrowBeacon' | 'arrowExit' | 'forceLeap' | DebugDepth | 'mapPlain' | 'mapZones' | 'mapDistance'
export type DebugDepth = 'depth1' | 'depth2' | 'depth3' | 'depth4'
export const debugRunActive = (s: State): boolean => s.world.tiles !== '' && (s.meta.screen === 'playing' || s.meta.screen === 'paused')
// Depth class shown in the panel: the running cave's class (undefined = 3), else the class the next run will use.
export const debugDepthClass = (s: State): number => (debugRunActive(s) ? s.world.depthClass ?? 3 : shownClass(s))
export const torchBurn = (s: State): number => zt(T.flame.burnPerS, s.meta.zone) * T.minerals.table[s.player.activeMineral].burnMul
export const torchSeconds = (s: State): number => s.player.energy / torchBurn(s)

function setTorch(s: State, energy: number): void {
  const p = s.player, before = p.energy
  p.energy = clamp(energy, 0, p.energyMax)
  if (before > 0 && p.energy === 0) emit(s, 'flameOut', p.x, p.y)
  if (before <= 0 && p.energy > 0) emit(s, 'relight', p.x, p.y)
  if (p.energy === 0) { p.beaconHold = 0; p.mining.targetTile = -1; p.mining.progress = 0 }
}

export function setDebugValue(s: State, slider: 'torch' | 'speed', fraction: number): void {
  if (!Number.isFinite(fraction)) return
  const f = clamp(fraction, 0, 1)
  if (slider === 'speed') s.debug.speedMul = Math.round((1 + 9 * f) * 2) / 2
  else if (debugRunActive(s) && s.meta.phase === 'descent') setTorch(s, Math.round(f * s.player.energyMax * 10) / 10)
}

// Re-enter on the nearest free tile, rather than leaving collision enabled inside solid rock.
function leaveNoclip(s: State): boolean {
  const p = s.player, w = s.world.w
  if (!debugRunActive(s) || !circleHitsSolid(s, p.x, p.y, T.player.radiusPx)) return true
  const i = Math.floor(p.y / TILE) * w + Math.floor(p.x / TILE)
  const free = nearestFloor(s, i, Math.max(w, s.world.h))
  if (free < 0) { toast(s, 'No free floor nearby; noclip remains on'); return false }
  p.x = (free % w + 0.5) * TILE
  p.y = (Math.floor(free / w) + 0.5) * TILE
  p.vx = p.vy = 0
  return true
}

export function debugSpawn(s: State, kind: MonsterKind): boolean {
  if (!debugRunActive(s)) return false
  const p = s.player, radius = T.monsters[kind].radiusPx
  // Search in view near the player; each kind must fit its real collider, including the 30 px Devourer.
  for (let gap = T.player.radiusPx + radius + 18; gap <= 240; gap += 24) {
    for (let k = 0; k < 32; k++) {
      const a = p.facing + k * Math.PI / 16, x = p.x + Math.cos(a) * gap, y = p.y + Math.sin(a) * gap
      if (circleHitsSolid(s, x, y, radius) || !lineOfSightPx(s, p.x, p.y, x, y)) continue
      if (s.monsters.some(m => m.ai !== 'dying' && Math.hypot(m.x - x, m.y - y) < T.monsters[m.kind].radiusPx + radius + 4)) continue
      const m = spawnMonster(s, kind, x, y, flameRadius(s))
      m.seen = insideLight(s, x, y, radius / 2)
      s.director.alive[kind]++
      toast(s, 'Spawned ' + kind + ' #' + m.id)
      return true
    }
  }
  toast(s, 'No clear space for ' + kind + '; try a larger room')
  return false
}

// Skip the attack lottery, cooldown and telegraph, but retain the real movement, collision and combat pipeline.
export function debugForceLeap(s: State): boolean {
  if (!debugRunActive(s)) return false
  const p = s.player
  let chosen: Monster | null = null, distance = Infinity
  for (const m of s.monsters) {
    if (m.ai === 'dying' || (!m.seen && !s.debug.noFog && !s.debug.reveal)) continue
    const d = Math.hypot(m.x - p.x, m.y - p.y)
    if (d >= distance || !lineOfSightPx(s, m.x, m.y, p.x, p.y)) continue
    chosen = m; distance = d
  }
  if (!chosen) { toast(s, 'No enemy in clear sight; spawn one first'); return false }
  chosen.stunned = 0; chosen.fleeing = false; chosen.lungeCd = 0; chosen.stuckT = 0
  startLunge(s, chosen)
  s.debug.freezeAi = false // A forced attack must advance even after inspecting a frozen enemy.
  toast(s, chosen.kind + ' #' + chosen.id + ' forced leap (AI resumed)')
  return true
}

// Pick depth class `c` for the next run (title setting + its Best). During a run, restart the same seed in that class: the chunked
// generator takes over via begin(), keeping debug settings. Same class as the running cave: nothing to do.
export function debugSetDepth(s: State, c: number): void {
  const running = debugRunActive(s)
  if (running && debugDepthClass(s) === c) { toast(s, 'Already depth class ' + c); return }
  setDepth(s, c, 'uiConfirm')
  if (!running) { toast(s, 'Depth class ' + c + ' for the next run'); return }
  begin(s, s.meta.seedText)
  toast(s, 'Restarting seed in depth class ' + c)
}

export function debugAction(s: State, action: DebugAction, view?: Input['view']): void {
  if ((DEBUG_TOGGLES as readonly string[]).includes(action)) {
    const key = action as DebugToggle
    if (key === 'noclip' && s.debug.noclip && !leaveNoclip(s)) return
    s.debug[key] = !s.debug[key]
    if (key.startsWith('map') && s.debug[key]) s.debug.minimap = true
    if (key === 'infiniteHp' && s.debug.infiniteHp && debugRunActive(s)) s.player.hp = s.player.hpMax
    return
  }
  if (action === 'mapPlain' || action === 'mapZones' || action === 'mapDistance') {
    s.debug.mapMode = action === 'mapZones' ? 'zones' : action === 'mapDistance' ? 'distance' : 'plain'
    s.debug.minimap = true; return
  }
  if (action === 'arrowBeacon' || action === 'arrowExit') {
    s.debug.arrowTarget = action === 'arrowBeacon' ? 'beacon' : 'exit'; s.debug.arrow = true; return
  }
  if (action.startsWith('depth')) { debugSetDepth(s, Number(action.slice(5))); return }
  if (!debugRunActive(s)) return
  if (action === 'teleportEntrance' || action === 'teleportBeacon') {
    debugTeleport(s, action === 'teleportEntrance' ? 'entrance' : 'beacon', view); return
  }
  if (action === 'lurker' || action === 'stalker' || action === 'devourer') { debugSpawn(s, action); return }
  if (action === 'forceLeap') { debugForceLeap(s); return }
  if (action === 'kill') { s.player.hp = 0; endRun(s, false); return } // deliberately bypasses immortality
  if (s.meta.phase === 'descent') setTorch(s, action === 'refill' ? s.player.energyMax : 0)
}
