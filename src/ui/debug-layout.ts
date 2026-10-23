// Shared draw/hit geometry for the canvas developer panel. Four tabs fit a 360 px-high game window.
import type { State } from '../core/types.ts'
import { debugDepthClass, debugRunActive, torchSeconds } from '../systems/debug.ts'
import type { DebugAction } from '../systems/debug.ts'
import type { Rect } from './layout.ts'
import { DEPTH_NAMES } from './strings.ts'

export type DebugControlId = DebugAction | 'open' | 'tab0' | 'tab1' | 'tab2' | 'tab3' | 'speed' | 'torch'
export type DebugControl = Rect & { id: DebugControlId; label: string; enabled: boolean; on?: boolean; slider?: number }
export const contains = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

export function debugLayout(s: State, w: number, h: number, open: boolean, tab: number): { panel: Rect; controls: DebugControl[] } {
  const panel = { x: Math.max(8, w - 356), y: Math.max(8, h - 376), w: Math.min(340, w - 16), h: Math.min(332, h - 52) }
  const controls: DebugControl[] = [{ id: 'open', label: open ? 'Close DEV [F2]' : 'DEV [F2]', x: w - 116, y: h - 36, w: 108, h: 28, enabled: true, on: open }]
  if (!open) return { panel, controls }
  const x = panel.x + 10, width = panel.w - 20, half = (width - 6) / 2, third = (width - 12) / 3
  const active = debugRunActive(s), torch = active && s.meta.phase === 'descent'
  const add = (id: DebugControlId, label: string, y: number, left = x, size = width, enabled = true, on?: boolean, slider?: number): void => {
    controls.push({ id, label, x: left, y: panel.y + y, w: size, h: slider === undefined ? 26 : 36, enabled, on, slider })
  }
  const fourth = (width - 18) / 4
  for (let i = 0; i < 4; i++) add(('tab' + i) as DebugControlId, ['Player', 'Enemies', 'Inspect', 'Navigate'][i], 36, x + i * (fourth + 6), fourth, true, tab === i)
  if (tab === 0) {
    add('noclip', 'Noclip: ' + (s.debug.noclip ? 'ON' : 'OFF'), 72, x, half, true, s.debug.noclip)
    add('infiniteHp', 'Infinite HP', 72, x + half + 6, half, true, s.debug.infiniteHp)
    add('speed', 'Noclip speed: ' + s.debug.speedMul.toFixed(1) + 'x', 106, x, width, true, undefined, (s.debug.speedMul - 1) / 9)
    add('freezeTorch', 'Freeze torch drain', 148, x, width, true, s.debug.freezeTorch)
    add('torch', 'Torch left: ' + Math.ceil(torchSeconds(s)) + 's (' + Math.round(s.player.energy / s.player.energyMax * 100) + '%)', 182, x, width, torch, undefined, s.player.energy / s.player.energyMax)
    add('extinguish', 'Extinguish torch', 224, x, half, torch)
    add('refill', 'Refill torch', 224, x + half + 6, half, torch)
    add('kill', 'Kill player', 258, x, half, active)
    add('animations', 'Animation labels', 258, x + half + 6, half, true, s.debug.animations)
  } else if (tab === 1) {
    for (let i = 0; i < 3; i++) add((['lurker', 'stalker', 'devourer'] as const)[i], ['+ Lurker', '+ Stalker', '+ Devourer'][i], 72, x + i * (third + 6), third, active)
    add('forceLeap', 'Force nearest enemy leap', 174, x, width, active)
    add('freezeAi', 'Freeze enemy AI', 106, x, width, true, s.debug.freezeAi)
    add('showPaths', 'AI diagnostics', 280, x, width, true, s.debug.showPaths)
    add('animations', 'Animation labels (all actors)', 140, x, width, true, s.debug.animations)
  } else if (tab === 2) {
    add('noFog', 'Disable fog of war', 72, x, width, true, s.debug.noFog)
    add('overlay', 'Collision shapes + wall grid', 106, x, width, true, s.debug.overlay)
    add('hurtboxes', 'Hurt volumes + attack reach', 140, x, width, true, s.debug.hurtboxes)
    add('stats', 'Performance statistics', 174, x, width, true, s.debug.stats)
  }
  if (tab === 3) {
    for (let i = 0; i < 4; i++) add(('depth' + (i + 1)) as DebugControlId, DEPTH_NAMES[i], 72, x + i * (fourth + 6), fourth, true, debugDepthClass(s) === i + 1)
    add('teleportEntrance', 'To entrance', 106, x, half, active)
    add('teleportBeacon', 'To Beacon', 106, x + half + 6, half, active)
    add('minimap', 'Black/white minimap', 140, x, width, true, s.debug.minimap)
    add('arrow', 'Destination arrow', 174, x, width, true, s.debug.arrow)
    add('arrowBeacon', 'Beacon', 208, x, half, true, s.debug.arrowTarget === 'beacon')
    add('arrowExit', 'Cave exit', 208, x + half + 6, half, true, s.debug.arrowTarget === 'exit')
  }
  return { panel, controls }
}
