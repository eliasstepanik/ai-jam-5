// Owner replaces the old Off/33/66/100 Sound cycle with two persisted sliders.
import type { Input } from '../main.ts'
import { init } from '../core/state.ts'
import { migrate } from '../core/migrate.ts'
import { loadSettings, saveSettings } from '../core/storage.ts'
import { stepScreens } from '../systems/screens.ts'
import { setAudioLevel } from '../systems/settings.ts'
import { pausedMenu } from '../core/settings.ts'
const ok = (c: boolean, msg: string): void => { if (!c) throw Error('check failed: ' + msg) }
const input = (key: string): Input => ({ keys: new Set(), pressed: new Set([key]), clicks: [],
  mouse: { x: 0, y: 0, down: false }, view: { w: 1280, h: 720, dpr: 1 } })
export function run(): void {
  const mem = new Map<string, string>(), previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const store = { getItem: (k: string): string | null => mem.get(k) ?? null, setItem: (k: string, v: string): void => { mem.set(k, v) } }
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true })
  try {
    mem.set('last-ember:settings', JSON.stringify({ v: 1, volume: .31, muted: true }))
    const s = init(); loadSettings(s)
    ok(s.settings.musicVolume === .31 && s.settings.sfxVolume === .31 && s.settings.muted, 'legacy volume/mute carried into both buses')
    s.meta.time = 10; s.ui.cursor = 2
    stepScreens(s, input('Enter'))
    ok(s.meta.screen === 'settings' && !pausedMenu(s), 'title opens Settings without pause semantics')
    s.meta.time++
    setAudioLevel(s, 0, .2); setAudioLevel(s, 1, .8)
    ok(s.settings.musicVolume === .2 && s.settings.sfxVolume === .8 && !s.settings.muted, 'sliders independent and unmute')
    s.ui.cursor = 2; stepScreens(s, input('Enter'))
    s.ui.cursor = 3; stepScreens(s, input('Enter'))
    const fresh = init(); loadSettings(fresh)
    ok(fresh.settings.musicVolume === .2 && fresh.settings.sfxVolume === .8 && fresh.settings.reducedFlash && fresh.settings.pureDarkness, 'all options persisted')
    setAudioLevel(s, 0, -5); setAudioLevel(s, 1, 5)
    ok(s.settings.musicVolume === 0 && s.settings.sfxVolume === 1, 'sliders clamp endpoints')
    stepScreens(s, input('Escape'))
    ok(s.meta.screen === 'title', 'Escape returns to title')
    s.meta.screen = 'paused'; s.ui.cursor = 2; s.meta.time++
    stepScreens(s, input('Enter')); s.meta.time++
    ok(pausedMenu(s), 'pause settings retain pause semantics')
    s.ui.cursor = 4; stepScreens(s, input('Enter'))
    ok(s.meta.screen === 'paused', 'Back returns to pause')
    const old = structuredClone(s) as unknown as { settings: Record<string, unknown> }
    delete old.settings.musicVolume; delete old.settings.sfxVolume
    const restored = migrate(old)
    ok(restored.settings.musicVolume === .31 && restored.settings.sfxVolume === .31, 'HMR fills missing buses from legacy level')
    ok(JSON.stringify(migrate(restored)) === JSON.stringify(restored), 'settings migration idempotent')
    const legacy = init(); legacy.meta.screen = 'title'; legacy.ui.cursor = 5
    Reflect.deleteProperty(legacy.ui, 'settingsFrom')
    Reflect.deleteProperty(legacy.settings, 'pureDarkness'); legacy.debug.pureDarkness = true
    const focus = migrate(legacy)
    ok(focus.ui.cursor === 4 && migrate(focus).ui.cursor === 4 && focus.settings.pureDarkness, 'old seed focus shifts once across HMR')
    fresh.settings.musicVolume = .19; saveSettings(fresh)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}
