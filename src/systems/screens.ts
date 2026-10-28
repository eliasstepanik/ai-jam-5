// L3 systems: pure screen state machine, called first by step() (R-003). Returns true while the world simulates.
// Spec: docs/architecture-modules-systems.md S2, architecture-systems.md §2, architecture-ui.md §5/§7, architecture-ui-2.md §2-§4,
// R-077 (no ui.urlSeed: platformStep writes ui.seedInput and consumes copyLink), R-078 (settings/best load once per session via
// the settings.loaded guard; saveSettings after every Sound/Flashing/volume change, R-168).
// Clicks activate the focused item: hit-testing needs src/ui/layout.ts (L4), which an L3 file must not import.
// Settings keyboard changes save immediately; pointer controls use the same writer.
import type { Input } from '../main.ts'
import type { FxEventKind, Screen, State } from '../core/types.ts'
import { HELP_PAGES, toast } from '../core/state.ts'
import { hashSeed } from '../core/rng.ts'
import { parseSeed, SEED_MAX_LEN } from '../core/seed.ts'
import { loadBest, loadSettings, saveSettings } from '../core/storage.ts'
import { setAudioLevel } from './settings.ts'
import { emit } from './fx.ts'
import { paramsOf } from '../world/gen/params.ts'
import { genStep, runSeedText } from './run.ts'

// ponytail: DT mirrors the fixed step in main.ts (stepScreens has no dt parameter, S2 signature); if the host step changes, import it from a shared tuning constant
const DT = 1 / 60
const CHANGE_LOCK_S = 0.25 // ui.md §5 rule 6
const END_LOCK_S = 0.5 // scoring-and-save §7
const CONFIRM_S = 2 // ui-2 §2 quit confirm time (s)
const POUCH_FULL = 'Pouch full' // R-134
const BEACON_DENIED = 'The Beacon needs more light' // systems-2 §5
const ITEMS: Record<Screen, number> = { title: 5, settings: 5, help: 0, playing: 0, paused: 4, dead: 4, won: 4 }

const ui = (s: State, kind: FxEventKind): void => emit(s, kind, s.cam.x, s.cam.y)

function go(s: State, to: Screen): void {
  if (to === 'settings') s.ui.settingsFrom = s.meta.screen === 'paused' ? 'paused' : 'title'
  s.ui.settingsDrag = -1
  if (to === 'help') { s.ui.helpFrom = s.meta.screen === 'paused' ? 'paused' : 'title'; s.ui.helpPage = 0 }
  s.meta.screen = to
  s.ui.cursor = 0
  s.ui.hover = -1
  s.ui.confirmT = 0
  s.ui.screenAt = s.meta.time
}

// Depth class of the run for `seedText` (R-164): settings.depthClass 1..4 (paramsOf: round, clamp, default 3), or 'random' = 1 + hashSeed(seed, 'cave:depth') % 4,
// so the seed still decides the run. Pure in (settings, seed text): begin, genStep and HMR mid-generation all resolve the same class, so no State field.
// ponytail: the % 4 mapping is the architect-default reading of R-164 (it gives no class mapping); change it here only.
const depthOf = (s: State, seedText: string): number => {
  const d = s.settings.depthClass
  return paramsOf(d === 'random' ? (hashSeed(parseSeed(seedText), 'cave:depth') % 4) + 1 : d).depthClass
}

// Chunked generation (SAE1 §4): the title stays up, genStep runs one attempt per update.
export function begin(s: State, seedText: string): void {
  go(s, 'title')
  s.ui.genPending = runSeedText(seedText)
  s.ui.genAttempt = 0
}

// Make s.best the Best of class `c`. The class of the loaded Best is cached in s.ui.bestClass (default 3, the legacy no-class load), so it survives hot swaps.
// Only reads storage when the class differs from the loaded one, so a same-class call keeps an in-memory Best (dead storage).
function syncBest(s: State, c: number): void {
  if (s.ui.bestClass === c) return
  loadBest(s, undefined, c)
  s.ui.bestClass = c
}

// One generation unit in the class of the pending seed. A cancelled generation leaves s.best intact. When the run starts, s.best is reloaded
// for the run's class before the first playing step (R-164), whatever class the title showed ('random' resolves per seed, so it can differ).
function generate(s: State): void {
  genStep(s, depthOf(s, s.ui.genPending))
  if (s.ui.genPending === '') syncBest(s, s.world.depthClass ?? 3)
}

// Title depth row (focus 3): set the class, save it, and show that class's Best. Applies at the next run start only (R-164); a running cave never changes.
// ponytail: 'random' is a stored setting only (from an old save or a link); the row shows and cycles classes 1..4, 'random' counts as 3 until the first change.
export function setDepth(s: State, to: number, sound: FxEventKind): void {
  s.settings.depthClass = to
  saveSettings(s)
  syncBest(s, to)
  ui(s, sound)
}

export const shownClass = (s: State): number => paramsOf(typeof s.settings.depthClass === 'number' ? s.settings.depthClass : undefined).depthClass

function seedKey(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^(Digit|Numpad)[0-9]$/.test(code)) return code.slice(-1)
  return code === 'Minus' ? '-' : ''
}

function tick(s: State): void {
  const u = s.ui
  for (const t of u.toasts) t.t -= DT
  u.toasts = u.toasts.filter((t) => t.t > 0)
  u.copied = Math.max(0, u.copied - DT)
  u.confirmT = Math.max(0, u.confirmT - DT)
}

function activate(s: State, item: number): void {
  const sc = s.meta.screen, set = s.settings
  if (sc === 'title' || sc === 'paused') {
    if (item === 2) { ui(s, 'uiConfirm'); go(s, 'settings'); return }
    if (item === 1) { ui(s, 'uiConfirm'); go(s, 'help'); return }
  }
  if (sc === 'title' && item === 3) { setDepth(s, (shownClass(s) % 4) + 1, 'uiConfirm'); return } // Depth row: 1 -> 2 -> 3 -> 4 -> 1
  if (sc === 'settings') {
    if (item < 2) return
    if (item === 4) { ui(s, 'uiBack'); go(s, s.ui.settingsFrom); return }
    if (item === 2) set.reducedFlash = !set.reducedFlash
    if (item === 3) set.pureDarkness = !set.pureDarkness
    saveSettings(s); ui(s, 'uiConfirm'); return
  }
  if (sc === 'title') { ui(s, 'uiConfirm'); begin(s, s.ui.seedInput); return } // Play (0) and Seed field (4)
  if (sc === 'paused') {
    if (item === 0) { ui(s, 'uiConfirm'); go(s, 'playing'); return }
    if (s.ui.confirmT > 0) { ui(s, 'uiBack'); go(s, 'title'); return } // Quit, second press: run abandoned
    s.ui.confirmT = CONFIRM_S
    ui(s, 'uiConfirm') // Quit, first press: arms the confirm; an activation emits uiConfirm (ui.md §5 rule 7)
    return
  }
  if (item === 3) { ui(s, 'copyLink'); return } // dead / won
  ui(s, item === 2 ? 'uiBack' : 'uiConfirm')
  if (item === 0) begin(s, '')
  else if (item === 1) begin(s, s.meta.seedText)
  else go(s, 'title')
}

export function stepScreens(s: State, input: Input): boolean {
  tick(s)
  if (!s.settings.loaded) { loadSettings(s); loadBest(s, undefined, shownClass(s)); s.ui.bestClass = shownClass(s) } // once per page session; loadSettings sets the flag even when storage fails
  const u = s.ui, k = input.pressed, sc = s.meta.screen
  if (u.genPending !== '') {
    if (k.has('Escape')) { u.genPending = ''; u.genAttempt = 0; ui(s, 'uiBack') } else generate(s)
    return false // the world's first step is the next update, as after a synchronous startRun
  }
  // The title shows the Best of shownClass. A ?depth= link (platformStep) changes settings.depthClass without a reload, so follow it here.
  if (sc === 'title') syncBest(s, shownClass(s))
  const seedFocus = sc === 'title' && u.cursor === 4
  if (k.has('KeyM') && !seedFocus) { s.settings.muted = !s.settings.muted; saveSettings(s) } // every screen (ui.md §7); 'm' types in the seed box
  if (sc === 'playing') {
    // systems-2 §4: mining emits mineDone a=-1 (pouch full); this machine owns the toast (R-003). An event of the last step has step === meta.steps here.
    // ponytail: scanned once per call; a pause/resume right after the event can repeat the toast. The text dedupe on this line hides the repeat inside TOAST_S.
    if (s.fx.events.some((e) => e.kind === 'mineDone' && e.a === -1 && e.step === s.meta.steps) && !u.toasts.some((t) => t.text === POUCH_FULL)) toast(s, POUCH_FULL)
    if (s.fx.events.some((e) => e.kind === 'denied' && e.step === s.meta.steps) && !u.toasts.some((t) => t.text === BEACON_DENIED)) toast(s, BEACON_DENIED)
    if (k.has('Blur') || ((k.has('Escape') || k.has('KeyP')) && s.meta.time - u.screenAt >= CHANGE_LOCK_S)) go(s, 'paused')
    return s.meta.screen === 'playing'
  }
  if (s.meta.time - u.screenAt < CHANGE_LOCK_S) return false
  if ((sc === 'dead' || sc === 'won') && s.meta.time - (s.result ? s.result.endAt : 0) < END_LOCK_S) return false
  if (sc === 'help') {
    if (k.has('ArrowRight') || k.has('KeyD')) u.helpPage = Math.min(HELP_PAGES - 1, u.helpPage + 1)
    if (k.has('ArrowLeft') || k.has('KeyA')) u.helpPage = Math.max(0, u.helpPage - 1)
    if (k.has('Escape') || k.has('Enter') || k.has('Backspace')) { ui(s, 'uiBack'); go(s, u.helpFrom) }
    return false
  }
  if (sc === 'settings' && (k.has('Escape') || k.has('Backspace'))) {
    ui(s, 'uiBack'); go(s, u.settingsFrom); return false
  }
  const n = ITEMS[sc]
  if (seedFocus) {
    for (const code of k) {
      const ch = seedKey(code)
      if (ch !== '' && u.seedInput.length < SEED_MAX_LEN) u.seedInput += ch
    }
    if (k.has('Backspace')) u.seedInput = u.seedInput.slice(0, -1)
    if (k.has('Escape')) u.seedInput = ''
  }
  const col = sc === 'dead' || sc === 'won' // end screens: a row of buttons (ui-2 §4); menus: a column
  const up = col ? k.has('ArrowLeft') || k.has('KeyA') : k.has('ArrowUp') || (!seedFocus && k.has('KeyW'))
  const down = col ? k.has('ArrowRight') || k.has('KeyD') : k.has('ArrowDown') || (!seedFocus && k.has('KeyS'))
  if (up !== down) { u.cursor = (u.cursor + (down ? 1 : n - 1)) % n; ui(s, 'uiMove') }
  if (sc === 'settings' && u.cursor < 2) { // Volume sliders: keyboard changes in 0.1 steps
    const dv = (k.has('ArrowRight') || k.has('Equal') ? 1 : 0) - (k.has('ArrowLeft') || k.has('Minus') ? 1 : 0)
    if (dv !== 0) { setAudioLevel(s, u.cursor, (u.cursor === 0 ? s.settings.musicVolume : s.settings.sfxVolume) + dv * .1); ui(s, 'uiMove') }
  }
  if (sc === 'title' && u.cursor === 3) { // Depth row: ArrowLeft/Right (Minus/Equal) step -1/+1, clamped to 1..4, no wrap
    const dv = (k.has('ArrowRight') || k.has('Equal') ? 1 : 0) - (k.has('ArrowLeft') || k.has('Minus') ? 1 : 0)
    const to = Math.min(4, Math.max(1, shownClass(s) + dv))
    if (dv !== 0 && to !== shownClass(s)) setDepth(s, to, 'uiMove')
  }
  if (sc === 'title' && !seedFocus && k.has('KeyH')) { ui(s, 'uiConfirm'); go(s, 'help'); return false }
  if (sc === 'paused') {
    if (k.has('Escape') || k.has('KeyP')) { ui(s, 'uiConfirm'); go(s, 'playing'); return true }
    if (k.has('KeyQ')) { u.cursor = 3; activate(s, 3); return false }
  }
  if (sc === 'dead' || sc === 'won') {
    if (k.has('KeyT')) { activate(s, 1); return false }
    if (k.has('Escape')) { activate(s, 2); return false }
  }
  if (sc !== 'title' && sc !== 'settings' && k.has('KeyC')) { ui(s, 'copyLink'); return false }
  const space = k.has('Space') && !seedFocus
  if (k.has('Enter') || space || input.clicks.length > 0) activate(s, u.cursor)
  return s.meta.screen === 'playing'
}
