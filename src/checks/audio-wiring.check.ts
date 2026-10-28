// #102 acceptance: the TRIGGERS/EXTRAS wiring and the danger()/musicFor()/duckFor() ranges.
// Audit wording (Kittingsl, 2026-10-26): automated trigger-table coverage in src/checks and the
// check runner, plus event/loop verification evidence. Spec: KB notes/ai-jam-5-audio-finish-plan.md
// chunk B2. D-CHECK deviation (Orchestrator default, owner ruling R-043a pending): this check
// imports src/audio/trigger.ts (L4). trigger.ts is DOM-free and import-safe under Node; engine.ts
// is never imported (its module-top import.meta.glob throws under Node), so the lastSeq replay
// guard itself (engine.ts consumeEvents, `if (e.seq <= a.lastSeq) continue`) is verified here
// through the pure trigger functions only - see criterion 3.
import { TRIGGERS, EXTRAS, danger, musicFor, duckFor } from '../audio/trigger.ts'
import type { Trigger } from '../audio/trigger.ts'
import { SOUNDS } from '../assets/sounds.ts'
import type { SoundId } from '../assets/sounds.ts'
import { init } from '../core/state.ts'
import type { FxEvent, FxEventKind, Monster, State } from '../core/types.ts'

const ok = (value: boolean, why: string): void => { if (!value) throw new Error('audio wiring: ' + why) }

// Criterion 1, compile-time half: tsc fails here when the FxEventKind union grows or shrinks,
// because Record<FxEventKind, true> must be exact in both directions.
const KINDS = {
  swing: true, parryPerfect: true, parryGood: true, parryPoor: true, flameHit: true, hpHit: true,
  monsterDie: true, flameOut: true, relight: true, heal: true, mineTick: true, mineDone: true,
  toss: true, shakeOff: true, roll: true, beaconLit: true, rockWarn: true, rockLand: true,
  win: true, death: true, dodge: true, windup: true, lunge: true, denied: true,
  uiMove: true, uiConfirm: true, uiBack: true, copyLink: true,
} satisfies Record<FxEventKind, true>
const KIND_LIST = Object.keys(KINDS) as FxEventKind[]

// The null-mapped set of the real table (issue #102: win comes from musicFor, dodge is visual,
// copyLink is silent). Verified against trigger.ts L103/L105/L112 on 2026-10-28.
const NULL_KINDS: readonly FxEventKind[] = ['copyLink', 'dodge', 'win']

const MUSIC_IDS = new Set(Object.keys(SOUNDS).filter((k) => SOUNDS[k as SoundId].group === 'music'))

const ev = (kind: FxEventKind, a: number, seq = 1): FxEvent => ({ seq, kind, x: 100, y: 100, a, step: 0 })
// danger() and nearestKind() read only kind/x/y/ai off a Monster; the cast is the minimal fixture.
const mon = (kind: Monster['kind'], ai: Monster['ai'], x: number, y: number): Monster =>
  ({ kind, ai, x, y }) as Monster

function playState(): State {
  const s = init()
  s.meta.screen = 'playing'
  s.meta.phase = 'descent'
  return s
}

// `a` variants that reach every conditional id branch: -1 (empty/denied), 0..4 (mineral/kind indices).
const A_VARIANTS = [-1, 0, 1, 2, 3, 4]

function checkTargets(table: string, kind: FxEventKind, t: Trigger, s: State): void {
  for (const a of A_VARIANTS) {
    const e = ev(kind, a)
    const id = t.id(e, s)
    ok(id in SOUNDS, `${table}[${kind}] (a=${a}) names unknown SoundId ${id}`)
    ok(SOUNDS[id].group !== 'music', `${table}[${kind}] (a=${a}) names music id ${id}`)
  }
}

function checkPure(table: string, kind: FxEventKind, t: Trigger, s: State): void {
  const snap = JSON.stringify([s.player, s.meta, s.fx.events])
  for (const a of [0, 4]) {
    const e = ev(kind, a)
    ok(t.id(e, s) === t.id(e, s), `${table}[${kind}] id() not deterministic (a=${a})`)
    ok(JSON.stringify(t.params(e, s)) === JSON.stringify(t.params(e, s)),
      `${table}[${kind}] params() not deterministic (a=${a})`)
  }
  ok(JSON.stringify([s.player, s.meta, s.fx.events]) === snap, `${table}[${kind}] mutated state`)
}

function screenSweep(): Generator<State> {
  return (function* () {
    for (const screen of ['title', 'help', 'playing', 'paused', 'dead', 'won'] as const) {
      for (const phase of ['descent', 'escape'] as const) {
        for (const helpFrom of ['title', 'paused'] as const) {
          for (const beaconLit of [false, true]) {
            for (const afterLit of [0, 10] as const) {
              const s = init()
              s.meta.screen = screen
              s.meta.phase = phase
              s.ui.helpFrom = helpFrom
              s.world.beaconLit = beaconLit
              s.world.beaconLitAt = 5
              s.meta.time = 5 + afterLit
              yield s
            }
          }
        }
      }
    }
  })()
}

export function run(): void {
  // --- 1. coverage: 28 kinds, every one keyed, null set exactly NULL_KINDS ---
  ok(KIND_LIST.length === 28, `expected 28 FxEventKinds, found ${KIND_LIST.length}`)
  ok(Object.keys(TRIGGERS).length === 28, `TRIGGERS has ${Object.keys(TRIGGERS).length} keys, expected 28`)
  const nulls: string[] = []
  for (const k of KIND_LIST) {
    ok(k in TRIGGERS, `TRIGGERS is missing kind ${k}`)
    if (TRIGGERS[k] === null) nulls.push(k)
  }
  ok(JSON.stringify(nulls.sort()) === JSON.stringify([...NULL_KINDS]),
    `null-mapped set is {${nulls.join(', ')}}, expected {${NULL_KINDS.join(', ')}}`)

  // --- 2. every non-null target and every EXTRAS entry is a real non-music SoundId ---
  const s = playState()
  s.monsters.push(mon('devourer', 'ring', 100, 100)) // windup resolves its kind by nearest monster
  for (const k of KIND_LIST) {
    const t = TRIGGERS[k]
    if (t) checkTargets('TRIGGERS', k, t, s)
  }
  for (const k of Object.keys(EXTRAS) as FxEventKind[]) {
    checkTargets('EXTRAS', k, EXTRAS[k]!, s)
  }
  ok(TRIGGERS.parryPoor!.id(ev('parryPoor', 0), s) === 'sfx_parry-bad',
    `parryPoor maps to ${TRIGGERS.parryPoor!.id(ev('parryPoor', 0), s)}, expected sfx_parry-bad (D-PARRY)`)

  // --- 3. replay safety, pure half: the seq-cursor guard lives in engine.ts consumeEvents
  // (not importable under Node), so what is testable here is that the trigger functions the
  // engine replays are pure and deterministic: same (event, state) -> same id/params, no state
  // mutation. A replay would therefore be a silent no-op of identical calls, gated by lastSeq.
  for (const k of KIND_LIST) {
    const t = TRIGGERS[k]
    if (t) checkPure('TRIGGERS', k, t, s)
  }
  for (const k of Object.keys(EXTRAS) as FxEventKind[]) {
    checkPure('EXTRAS', k, EXTRAS[k]!, s)
  }

  // --- 4a. danger() stays in [0,1] and finite for extreme inputs ---
  const d = playState()
  d.player.energy = d.player.energyMax
  ok(danger(d) === 0, `full flame, no monsters: expected 0, got ${danger(d)}`)
  d.player.energy = 0
  ok(danger(d) === 1, `flame out: expected 1, got ${danger(d)}`)
  d.player.energy = d.player.energyMax * 4 // over-full energy clamps the low term, not NaN
  ok(danger(d) === 0, `over-full energy: expected 0, got ${danger(d)}`)
  d.player.energy = d.player.energyMax
  d.player.hp = 1
  ok(danger(d) === 0.6, `hp 1: expected 0.6, got ${danger(d)}`)
  d.player.hp = 5
  d.monsters.push(mon('lurker', 'windup', d.player.x, d.player.y))
  ok(danger(d) === 1, `windup at player: expected 1, got ${danger(d)}`)
  d.monsters.length = 0
  for (let i = 0; i < 12; i++) d.monsters.push(mon('stalker', 'stalk', d.player.x + i, d.player.y))
  ok(danger(d) === 1, `12 ringed monsters: expected 1, got ${danger(d)}`)
  d.monsters.length = 0
  d.monsters.push(mon('lurker', 'dying', d.player.x, d.player.y))
  ok(danger(d) === 0, `dying monster ignored: expected 0, got ${danger(d)}`)
  d.meta.screen = 'title'
  ok(danger(d) === 0, `title screen: expected 0, got ${danger(d)}`)
  for (const st of screenSweep()) {
    const v = danger(st)
    ok(Number.isFinite(v) && v >= 0 && v <= 1, `danger out of [0,1] on ${st.meta.screen}/${st.meta.phase}: ${v}`)
  }

  // --- 4b. musicFor returns only known music ids or null across screens/phases ---
  for (const st of screenSweep()) {
    const id = musicFor(st)
    ok(id === null || MUSIC_IDS.has(id), `musicFor returned unknown id ${id} on ${st.meta.screen}/${st.meta.phase}`)
  }

  // --- 4c. duckFor: every bus <= 0; finite ducks within the table bounds [-12, 0]
  // (real bounds read off duckFor: -3/-6/-9/-10/-12 and -Infinity for silent buses) ---
  for (const st of screenSweep()) {
    for (const flare of [0, 1]) {
      st.fx.flare = flare
      const duck = duckFor(st)
      for (const bus of ['music', 'amb', 'sfx', 'ui'] as const) {
        const v = duck[bus]
        ok(v <= 0 && (v === -Infinity || v >= -12),
          `duckFor ${bus}=${v} outside {-Infinity} U [-12,0] on ${st.meta.screen}/${st.meta.phase} flare=${flare}`)
      }
    }
  }
  // --- 5. every ok() above names the offending kind/id; no wall-clock budget is used here. ---
}
