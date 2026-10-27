// Owner override of R-025/R-174 (KB notes/ai-jam-5-audio-button-off-or-70.md): activating the Sound row cycles
// Off -> 33 -> 66 -> 100 -> Off instead of toggling mute. Pins src/systems/screens.ts cycleVolume, the Sound label
// formatting at every step, and that a Sound-row click saves settings (R-168).
// Exports run(); no side effect on import; DOM-free; state is local per scenario.
import type { Input } from '../main.ts'
import type { Settings } from '../core/types.ts'
import { init } from '../core/state.ts'
import { cycleVolume, stepScreens } from '../systems/screens.ts'
import { STR, pct } from '../ui/strings.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const at = (volume: number, muted: boolean): Settings => ({ ...init().settings, volume, muted })
// The menus.ts soundLabel formula (menus.ts is L4 and not importable from checks): pinned here against the real STR and pct.
const label = (set: Settings): string => (set.muted ? STR.soundOff : `${STR.soundOn} ${pct(set.volume)}`)

const inp = (clicks = 0): Input => ({
  keys: new Set<string>(), pressed: new Set<string>(), mouse: { x: 0, y: 0, down: false },
  clicks: Array.from({ length: clicks }, () => ({ x: 1, y: 1 })), view: { w: 640, h: 360, dpr: 1 },
})

export function run(): void {
  // cycleVolume: Off -> 33 -> 66 -> 100 -> Off; a between-step volume jumps to the next step above it.
  let t = at(0.7, true)
  cycleVolume(t)
  ok(t.volume === 0.33 && !t.muted, 'muted -> 33 (got ' + t.volume + ', muted ' + t.muted + ')')
  t = at(0.7, false)
  cycleVolume(t)
  ok(t.volume === 1 && !t.muted, '0.7 -> 100 (got ' + t.volume + ')')
  cycleVolume(t)
  ok(t.muted && t.volume === 1, '100 -> Off keeps volume 1 (got ' + t.volume + ')')
  t = at(0.33, false)
  cycleVolume(t)
  ok(t.volume === 0.66, '33 -> 66 (got ' + t.volume + ')')
  t = at(0.66, false)
  cycleVolume(t)
  ok(t.volume === 1, '66 -> 100 (got ' + t.volume + ')')
  t = at(0, false)
  cycleVolume(t)
  ok(t.volume === 0.33 && !t.muted, 'volume 0 unmuted -> 33 (got ' + t.volume + ')')
  // Five clicks from the 0.7 default: 100, Off, 33, 66, 100 (Off lands on the 2nd click, not the 4th).
  t = at(0.7, false)
  const seq: string[] = []
  for (let k = 0; k < 5; k++) { cycleVolume(t); seq.push(t.muted ? 'Off' : String(Math.round(t.volume * 100))) }
  ok(seq.join(',') === '100,Off,33,66,100', 'five clicks from 0.7 give 100,Off,33,66,100 (got ' + seq.join(',') + ')')
  // Label at every step: Off when muted, On N% otherwise.
  ok(label(at(0.7, true)) === 'Sound: Off', 'muted label is "Sound: Off" (got ' + label(at(0.7, true)) + ')')
  for (const [v, want] of [[0.33, 'Sound: On 33 %'], [0.66, 'Sound: On 66 %'], [1, 'Sound: On 100 %']] as const) {
    ok(label(at(v, false)) === want, `label at ${v} is "${want}" (got ${label(at(v, false))})`)
  }
  // A Sound-row click on the title cycles and saves volume and muted (R-168), Map-backed fake localStorage as in screens.check.ts.
  const mem = new Map<string, string>(), prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } }, configurable: true, writable: true })
  try {
    const s = init()
    s.meta.time = 10 // past the 0.25 s screen lock; screenAt is 0 from init()
    s.ui.cursor = 2
    stepScreens(s, inp(1))
    let saved = JSON.parse(mem.get('last-ember:settings') ?? '{}')
    ok(s.settings.volume === 1 && !s.settings.muted && saved.volume === 1 && saved.muted === false, 'first click cycles 0.7 -> 100 and saves (saved ' + JSON.stringify(saved) + ')')
    stepScreens(s, inp(1))
    saved = JSON.parse(mem.get('last-ember:settings') ?? '{}')
    ok(s.settings.muted && saved.muted === true && saved.volume === 1, 'second click mutes and saves (saved ' + JSON.stringify(saved) + ')')
  } finally { Object.defineProperty(globalThis, 'localStorage', prev ?? { value: undefined, configurable: true, writable: true }) } // ponytail: an absent store comes back as undefined; read() catches the TypeError like any missing store
}
