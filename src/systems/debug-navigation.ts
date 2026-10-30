// Developer navigation: immediate safe landing and direct destination bearing, independent of DOM/rendering.
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { TILE, toast } from '../core/state.ts'
import { entranceExit } from '../world/entrance-art.ts'
import { beaconTile } from '../world/beacon-position.ts'
import { nearestPlayerFloor } from '../world/player-collide.ts'
import { T } from '../core/tuning.ts'

export function debugTeleport(s: State, destination: 'entrance' | 'beacon', _view?: Input['view']): boolean {
  if (!s.world.tiles || (s.meta.screen !== 'playing' && s.meta.screen !== 'paused')) return false
  const { w, h } = s.world, target = destination === 'beacon' ? beaconTile(s) : entranceExit(s)
  if (target.tx < 0 || target.tx >= w || target.ty < 0 || target.ty >= h) return false
  const i = nearestPlayerFloor(s, target.ty * w + target.tx, w + h, T.player.radiusPx)
  if (i < 0) { toast(s, 'No free floor near ' + destination); return false }
  const p = s.player
  p.x = (i % w + 0.5) * TILE; p.y = (Math.floor(i / w) + 0.5) * TILE
  p.vx = p.vy = p.gaitSpeed = 0
  p.roll.t = 0; p.roll.invuln = 0
  p.swing.active = false; p.swing.buffer = 0
  p.mining.targetTile = -1; p.mining.progress = 0; p.beaconHold = 0
  s.cam.x = p.x; s.cam.y = p.y
  s.world.exploreKey = -1
  toast(s, 'Teleported to ' + (destination === 'entrance' ? 'cave entrance' : 'Beacon'))
  return true
}

export function debugBearing(s: State, x = s.player.x, y = s.player.y): { angle: number; distance: number } {
  const target = s.debug.arrowTarget === 'beacon' ? beaconTile(s) : s.world[s.debug.arrowTarget], dx = (target.tx + 0.5) * TILE - x, dy = (target.ty + 0.5) * TILE - y
  return { angle: Math.atan2(dy, dx), distance: Math.hypot(dx, dy) }
}
