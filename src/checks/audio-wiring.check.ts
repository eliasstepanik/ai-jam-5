// #102 acceptance: the TRIGGERS/EXTRAS wiring and the danger()/musicFor()/duckFor() ranges.
// Audit wording (Kittingsl, 2026-10-26): automated trigger-table coverage in src/checks and the
// check runner, plus event/loop verification evidence. Spec: KB notes/ai-jam-5-audio-finish-plan.md
// chunks B2 + P1. D-CHECK deviation (Orchestrator default, owner ruling R-043a pending): this check
// imports DOM-free src/audio/trigger.ts and src/audio/mixer.ts (L4). Both are import-safe under Node;
// engine.ts
// is never imported (its module-top import.meta.glob throws under Node), so the lastSeq replay
// guard itself (engine.ts consumeEvents, `if (e.seq <= a.lastSeq) continue`) is verified here
// through the pure trigger functions only - see criterion 3.
import { TRIGGERS, EXTRAS, danger, musicFor, duckFor } from '../audio/trigger.ts'
import type { Trigger } from '../audio/trigger.ts'
import { applyDucks, ensureMixer } from '../audio/mixer.ts'
import type { DuckCause } from '../audio/mixer.ts'
import { makeFakeCtx } from './audio-fake.ts'
import type { FakeParam, FakeParamEvent } from './audio-fake.ts'
import { SOUNDS } from '../assets/sounds.ts'
import type { Group, SoundId } from '../assets/sounds.ts'
import { init } from '../core/state.ts'
import type { Resources } from '../assets/resources.ts'
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
  const emax = d.player.energyMax
  d.player.energyMax = 0 // degenerate fixture (unreachable in play): 0/0 must not leak NaN
  ok(Number.isFinite(danger(d)) && danger(d) >= 0 && danger(d) <= 1,
    `energyMax 0: expected finite in [0,1], got ${danger(d)}`)
  d.player.energyMax = emax
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

  // --- 4c. duckFor: every cause depth <= 0; finite depths within the table bounds [-12, 0]
  // (real depths read off duckFor: -3/-6/-9/-10/-12 and -Infinity for silent buses); timings finite >= 0 ---
  for (const st of screenSweep()) {
    for (const flare of [0, 1]) {
      st.fx.flare = flare
      const duck = duckFor(st)
      for (const bus of ['music', 'amb', 'sfx', 'ui'] as const) {
        for (const c of duck[bus]) {
          ok(c.db <= 0 && (c.db === -Infinity || c.db >= -12),
            `duckFor ${bus} depth ${c.db} outside {-Infinity} U [-12,0] on ${st.meta.screen}/${st.meta.phase} flare=${flare}`)
          ok(Number.isFinite(c.attack) && c.attack >= 0 && Number.isFinite(c.release) && c.release >= 0,
            `duckFor ${bus} timing ${c.attack}/${c.release} not finite >= 0 on ${st.meta.screen}/${st.meta.phase} flare=${flare}`)
        }
      }
    }
  }
  // --- 6. per-cause duck merge (P1) through the real mixer on the fake context: ensureMixer builds
  // the graph on makeFakeCtx, applyDucks drives the duck nodes, and the recorded setTargetAtTime
  // events on each duck gain are the assertions. ---
  const mixerFixture = (): { fake: ReturnType<typeof makeFakeCtx>; res: Resources } => {
    const fake = makeFakeCtx()
    const res = { audio: { ctx: fake.ctx, graphVersion: 0, master: null, masterLp: null,
      comp: null, groups: null, duck: null, lastMaster: 0 } } as unknown as Resources
    ensureMixer(res)
    return { fake, res }
  }
  const duckMusic = (res: Resources, causes: DuckCause[]): void => {
    applyDucks(res, { music: causes, amb: [], sfx: [], ui: [] })
  }
  const duckEvents = (res: Resources, bus: Group): FakeParamEvent[] =>
    ((res.audio.duck![bus] as unknown as { gain: FakeParam }).gain.events
      .filter((e) => e.type === 'setTargetAtTime'))
  {
    // Two overlapping same-depth ducks from different causes: no release before the later one ends,
    // gain never rises while one is active, release uses the last cause's own release.
    const { fake, res } = mixerFixture()
    const a: DuckCause = { db: -6, attack: 0.01, release: 0.6 }
    const b: DuckCause = { db: -6, attack: 0.01, release: 0.2 }
    duckMusic(res, [a])
    fake.advance(1)
    duckMusic(res, [a, b]) // b joins at t=1: depth unchanged -> no new automation
    fake.advance(1)
    duckMusic(res, [b]) // a leaves at t=2: b still holds -6 -> gain must not rise
    fake.advance(1)
    duckMusic(res, []) // b leaves at t=3 -> release starts here, with b's release
    const evs = duckEvents(res, 'music')
    ok(evs.length === 2, `same-depth merge: expected 2 duck events (attack + one release), got ${evs.length}`)
    ok(evs[0].value === 10 ** (-6 / 20) && evs[0].time === 0 && evs[0].tc === 0.01,
      `same-depth merge: attack event wrong: ${JSON.stringify(evs[0])}`)
    ok(evs[1].value === 1 && evs[1].time === 3 && evs[1].tc === 0.2,
      `same-depth merge: release must start when the last cause ends (t=3) with its release 0.2: ${JSON.stringify(evs[1])}`)
    ok(fake.violations.length === 0, `same-depth merge: fake violations: ${fake.violations.join('; ')}`)
  }
  {
    // Deeper-then-shallower: the deeper cause wins while active; releasing it lifts only to the
    // shallower cause, using the deeper cause's release (perfect-parry -6 over low-HP -3).
    const { fake, res } = mixerFixture()
    const low: DuckCause = { db: -3, attack: 0.5, release: 0.5 }
    const parry: DuckCause = { db: -6, attack: 0.01, release: 0.6 }
    duckMusic(res, [low])
    fake.advance(1)
    duckMusic(res, [low, parry]) // deeper joins -> -6 with parry's attack
    fake.advance(1)
    duckMusic(res, [low]) // parry leaves -> lift to -3 with parry's release
    const evs = duckEvents(res, 'music')
    ok(evs.length === 3, `deep/shallow: expected 3 events, got ${evs.length}`)
    ok(evs[1].value === 10 ** (-6 / 20) && evs[1].time === 1 && evs[1].tc === 0.01,
      `deep/shallow: deepening event wrong: ${JSON.stringify(evs[1])}`)
    ok(evs[2].value === 10 ** (-3 / 20) && evs[2].time === 2 && evs[2].tc === 0.6,
      `deep/shallow: lift event must reach -3 with the parry release 0.6: ${JSON.stringify(evs[2])}`)
    ok(fake.violations.length === 0, `deep/shallow: fake violations: ${fake.violations.join('; ')}`)
  }
  // --- 5. every ok() above names the offending kind/id; no wall-clock budget is used here. ---
}
