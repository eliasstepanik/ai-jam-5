// Explicit session gate, reset behavior and safe noclip shutdown. Browser checks cover actual keys and reload.
import type { Input } from '../main.ts'
import { init } from '../core/state.ts'
import { getResources } from '../assets/resources.ts'
import { debugAccessInput, debugAvailable, lockDebug } from '../ui/debug-access.ts'
import { currentQuality } from '../render/quality.ts'
import { playerHitsSolid } from '../world/player-collide.ts'
import { T } from '../core/tuning.ts'
const ok = (v: boolean, msg: string): void => { if (!v) throw Error('debug access: ' + msg) }
const input = (pressed: string[], keys: string[]): Input => ({ pressed: new Set(pressed), keys: new Set(keys),
  mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 800, h: 600, dpr: 1 } })
export function run(): void {
  const res = getResources(), saved = res.debug, s = init()
  res.debug = { ...saved, available: false, on: false, accessVersion: 1 }
  try {
    for (const keys of [[], ['ShiftLeft'], ['ControlLeft'], ['ControlLeft', 'ShiftLeft', 'AltLeft']]) {
      debugAccessInput(s, input(['F2'], keys)); ok(!debugAvailable(), 'ordinary/partial chords stay locked')
    }
    debugAccessInput(s, input(['Backquote'], [])); ok(!debugAvailable(), 'backquote cannot unlock')
    const next = debugAccessInput(s, input(['DevUnlock', 'F2'], []))
    ok(debugAvailable() && res.debug.on && !next.pressed.has('F2'), 'unlock opens menu and consumes F2 edge')
    s.debug.god = s.debug.freezeAi = s.debug.freezeTorch = s.debug.noFog = s.debug.minimap = true
    res.debug.quality = 'q3'; ok(currentQuality(s).level === 3 && s.settings.quality === 'auto', 'quality override is ephemeral')
    s.world.w = s.world.h = 12
    s.world.tiles = Array.from({ length: 144 }, (_, i) => i % 12 === 0 || i % 12 === 11 || i < 12 || i >= 132 ? '#' : '.').join('')
    s.meta.screen = 'playing'; s.player.x = s.player.y = 16; s.debug.noclip = true
    ok(lockDebug(s), 'disable succeeds')
    ok(!playerHitsSolid(s, s.player.x, s.player.y, T.player.radiusPx), 'noclip shutdown finds safe floor')
    ok(!debugAvailable() && !res.debug.on && res.debug.quality === undefined, 'disable clears access, panel and quality override')
    ok(JSON.stringify(s.debug) === JSON.stringify(init().debug), 'all tool settings reset to defaults')
    res.debug.accessVersion = undefined; res.debug.available = true; s.debug.god = true
    debugAccessInput(s, input([], [])); ok(!debugAvailable() && !s.debug.god && res.debug.accessVersion === 1, 'old implicit HMR access upgrades once')
  } finally { res.debug = saved }
}
