// A29 screens/step/run gap checks: each scenario pins one behaviour of src/systems/screens.ts, step.ts or run.ts that flips under a
// single-line mutation the older step/run checks do not see. Spec: architecture-systems.md §1.3/§2, architecture-ui.md §5/§7,
// architecture-ui-2.md §4, R-067, R-068, R-077. Exports run(); no side effect on import; DOM-free; state is local per scenario.
import type { Input } from '../main.ts'
import type { CaveResult, Monster, Screen, State } from '../core/types.ts'
import { HELP_PAGES, init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { resolveParries } from '../systems/combat.ts'
import { stepExplore } from '../systems/explore.ts'
import { startRun } from '../systems/run.ts'
import { stepScreens } from '../systems/screens.ts'
import { step } from '../systems/step.ts'
import { generateCave } from '../world/generate.ts'

const DT = 1 / 60

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const inp = (pressed: string[] = [], clicks = 0): Input => ({
  keys: new Set<string>(), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false },
  clicks: Array.from({ length: clicks }, () => ({ x: 1, y: 1 })), view: { w: 640, h: 360, dpr: 1 },
})

// A started run with the world quiet: no director spawns, no AI motion, no cave pickups or monsters.
function quiet(cave: CaveResult): State {
  const s = init()
  startRun(s, '1', cave)
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.debug.freezeAi = true
  Object.assign(s, { monsters: [], pickups: [] })
  return s
}

// A quiet run switched to `screen` with every lock (0.25 s change, 0.5 s end) long expired and the cursor on `row`; `ui` adds ui fields.
function at(cave: CaveResult, screen: Screen, row = 0, ui: Partial<State['ui']> = {}): State {
  const s = quiet(cave)
  Object.assign(s.meta, { screen, time: 10 })
  Object.assign(s.ui, { cursor: row, screenAt: 0, ...ui })
  return s
}

const esc = (cave: CaveResult): State => { const s = quiet(cave); s.meta.phase = 'escape'; return s }

const links = (s: State): number => s.fx.events.filter((e) => e.kind === 'copyLink').length

// A shade in the lunge, latched on the player long enough ago that this step's bite fires, 24 px ahead (dir 0).
function latched(s: State): Monster {
  const m = spawnMonster(s, 'lurker', s.player.x + 24, s.player.y, 100)
  return Object.assign(m, { ai: 'lunge' as const, aiT: T.monsters.lurker.contactS, contactT: 0.1 })
}

export function run(): void {
  const cave = generateCave(parseSeed('1')) // one cave for every scenario (startRun copies it)

  // S26: Help returns to the screen it was opened from (ui.helpFrom): paused -> paused, title -> title.
  for (const from of ['paused', 'title'] as const) {
    const s = at(cave, from, 1)
    stepScreens(s, inp(['Enter']))
    ok(s.meta.screen === 'help' && s.ui.helpFrom === from && s.ui.helpPage === 0, 'Help row opens help from ' + from)
    s.meta.time += 1
    stepScreens(s, inp(['Escape']))
    ok(s.meta.screen === from, 'Escape on help returns to ' + from + ' (got ' + s.meta.screen + ')')
  }

  // S09/S10: help pages clamp at both ends (HELP_PAGES = 3).
  {
    const s = at(cave, 'help')
    ok(HELP_PAGES === 3, 'three help pages')
    stepScreens(s, inp(['ArrowLeft']))
    ok(s.ui.helpPage === 0, 'ArrowLeft on page 0 stays on page 0 (got ' + s.ui.helpPage + ')')
    for (let k = 0; k < HELP_PAGES; k++) stepScreens(s, inp(['ArrowRight'])) // one press too many: a wrap would land on page 0
    ok(s.ui.helpPage === HELP_PAGES - 1, 'ArrowRight stops on the last page (got ' + s.ui.helpPage + ')')
    stepScreens(s, inp(['ArrowLeft']))
    ok(s.ui.helpPage === HELP_PAGES - 2, 'ArrowLeft steps back one page')
  }

  // S08: the menu cursor wraps in both directions on the column menus (title 6 rows, paused 5 rows) and on the end-screen row (4).
  for (const [sc, n] of [['title', 6], ['paused', 5]] as const) {
    const s = at(cave, sc)
    stepScreens(s, inp(['ArrowUp']))
    ok(s.ui.cursor === n - 1, 'ArrowUp at row 0 wraps to the last row on ' + sc + ' (got ' + s.ui.cursor + ')')
    stepScreens(s, inp(['ArrowDown']))
    ok(s.ui.cursor === 0, 'ArrowDown at the last row wraps to row 0 on ' + sc + ' (got ' + s.ui.cursor + ')')
  }
  {
    const s = at(cave, 'dead'); stepScreens(s, inp(['ArrowLeft']))
    ok(s.ui.cursor === 3, 'ArrowLeft at button 0 wraps to the last button on dead (got ' + s.ui.cursor + ')')
    stepScreens(s, inp(['ArrowRight']))
    ok(s.ui.cursor === 0, 'ArrowRight at the last button wraps to 0 on dead')
  }

  // S13/S19: Space and a mouse click activate the focused item like Enter (Sound row cycles: 0.7 default -> 100, see volume-cycle.check.ts). Space types nowhere in the seed field.
  for (const sc of ['title', 'paused'] as const) {
    for (const [what, input] of [['Enter', inp(['Enter'])], ['Space', inp(['Space'])], ['click', inp([], 1)]] as const) {
      const s = at(cave, sc, 2)
      stepScreens(s, input)
      ok(s.settings.volume === 1 && !s.settings.muted, what + ' cycles the focused Sound row on ' + sc)
    }
  }
  {
    const s = at(cave, 'title', 5); stepScreens(s, inp(['Space']))
    ok(s.ui.genPending === '' && s.meta.screen === 'title', 'Space does not start a run from the seed field')
  }

  // S22: Q on the paused screen quits to the title and that frame does not simulate (stepScreens false, no world step).
  {
    ok(!stepScreens(at(cave, 'paused'), inp(['KeyQ'])), 'stepScreens returns false on the quit frame')
    const s = at(cave, 'paused'), n = s.meta.steps, x = s.player.x, e = s.player.energy
    step(s, inp(['KeyQ']), DT)
    ok(s.meta.screen === 'paused' && s.ui.confirmT > 0 && s.meta.steps === n && s.player.x === x && s.player.energy === e, 'first quit press leaves steps, player and flame untouched (steps ' + s.meta.steps + ')')
    step(s, inp(['KeyQ']), DT)
    ok(String(s.meta.screen) === 'title', 'second Q press confirms quit')
    const q = at(cave, 'paused', 4), k = q.fx.events.length
    stepScreens(q, inp(['Enter']))
    ok(q.ui.confirmT > 0 && q.fx.events.length === k + 1 && q.fx.events[k].kind === 'uiConfirm', 'first Quit press arms the confirm and emits one uiConfirm, not uiMove (ui.md §5 rule 7)')
  }

  // S23: the unpause frame simulates (stepScreens true, one world step).
  {
    const s = at(cave, 'paused'), n = s.meta.steps
    ok(stepScreens(at(cave, 'paused'), inp(['Escape'])), 'stepScreens returns true on the unpause frame')
    step(s, inp(['Escape']), DT)
    ok(s.meta.screen === 'playing' && s.meta.steps === n + 1, 'unpause frame is a world step (steps ' + n + ' -> ' + s.meta.steps + ')')
  }

  // S11/S12: dead/won item 3 copies the link; KeyC does too, but not on the title (no link to copy) nor on help (R-175: help returns first).
  for (const sc of ['dead', 'won'] as const) {
    const s = at(cave, sc, 3); stepScreens(s, inp(['Enter']))
    ok(links(s) === 1 && s.meta.screen === sc, 'item 3 on ' + sc + ' emits copyLink and stays on the screen')
    const t = at(cave, sc)
    stepScreens(t, inp(['KeyC']))
    ok(links(t) === 1, 'KeyC on ' + sc + ' emits copyLink')
  }
  for (const sc of ['title', 'help'] as const) {
    const s = at(cave, sc); stepScreens(s, inp(['KeyC']))
    ok(links(s) === 0, 'KeyC on ' + sc + ' emits no copyLink')
  }

  // S24: Escape inside the focused seed field clears it; with the focus elsewhere the text is kept.
  for (const [row, want] of [[5, ''], [0, 'abc']] as const) {
    const s = at(cave, 'title', row, { seedInput: 'abc' })
    stepScreens(s, inp(['Escape']))
    ok(s.ui.seedInput === want, 'Escape on row ' + row + ' leaves the seed text "' + want + '" (got ' + s.ui.seedInput + ')')
  }

  // R21/R30: startRun emits one relight and advances fx.seq by exactly the number of events it emitted, from any starting seq.
  {
    const s = init(); s.fx.seq = 5; startRun(s, '1', cave)
    const ev = s.fx.events
    ok(ev.length === 1 && ev[0].kind === 'relight' && ev[0].seq === 5, 'startRun emits exactly one relight with the old seq')
    ok(s.fx.seq === 5 + ev.length, 'fx.seq advances by the event count (got ' + s.fx.seq + ')')
  }

  // P01: a click on a free step starts a swing (resolveIntent maps clicks to intent.swing, descent stepSwing starts it).
  {
    const s = quiet(cave), q = quiet(cave)
    step(s, inp([], 1), DT)
    step(q, inp(), DT)
    const sw = s.player.swing
    ok(sw.active && sw.t === 0 && sw.cooldown === T.swing.cooldownS, 'a click starts the swing on that step (active ' + sw.active + ')')
    ok(!q.player.swing.active, 'no click, no swing')
  }

  // P22: hitstop freezes the world, not fx: shake still fades by one dt on a hitstop frame (R-067 read as world frozen).
  {
    const s = quiet(cave); Object.assign(s.fx, { hitstop: 0.1, shake: 0.3, shakeMag: 5 }); step(s, inp(), DT)
    ok(s.fx.hitstop === 0.1 - DT && s.fx.shake === 0.3 - DT, 'tickFx runs on a hitstop frame (shake ' + s.fx.shake + ')')
  }

  // P28: the step that ends the run stops there: no fx tick, no camera lerp. A surviving control step ticks both.
  {
    const s = quiet(cave), c = quiet(cave)
    for (const t of [s, c]) { Object.assign(t.fx, { shake: 0.3, shakeMag: 5 }); t.cam.x = t.player.x - 40 }
    s.player.hp = 0
    const cx = s.cam.x
    step(s, inp(), DT)
    step(c, inp(), DT)
    ok(s.meta.screen === 'dead' && c.meta.screen === 'playing', 'hp 0 ends the run, control keeps playing')
    ok(c.fx.shake === 0.3 - DT && c.cam.x > cx, 'control step ticks fx and moves the camera')
    ok(s.fx.shake === 0.3 && s.cam.x === cx, 'ending step skips tickFx and stepCamera (shake ' + s.fx.shake + ')')
  }

  // P27/P30/P31 phase guards (step.ts guards by phase; stepExplore, resolveParries too). B8 sets phase 'escape' later, so by hand here.
  {
    const s = esc(cave); step(s, inp([], 1), DT)
    ok(!s.player.swing.active && s.player.swing.cooldown === 0 && s.player.swing.buffer === 0, 'escape: a click starts no swing and buffers none')
  }
  {
    const far = (t: State): void => { t.player.x = t.world.beacon.tx * 32 + 16; t.player.y = t.world.beacon.ty * 32 + 16 }
    const d = quiet(cave), e0 = d.world.explored.join()
    far(d)
    step(d, inp(), DT)
    ok(d.world.explored.join() !== e0, 'descent control: a far tile reveals new tiles')
    const s = esc(cave)
    far(s)
    step(s, inp(), DT)
    ok(s.world.explored.join() === e0 && s.world.exploreKey === -1, 'escape: step() explores nothing and keeps exploreKey')
    const t = esc(cave)
    far(t)
    stepExplore(t)
    ok(t.world.explored.join() === e0 && t.world.exploreKey === -1, 'escape: stepExplore() reveals nothing and keeps exploreKey')
  }
  {
    const s = esc(cave)
    latched(s)
    Object.assign(s.player.swing, { active: true, t: 0.05, dir: 0 })
    resolveParries(s)
    ok(s.player.stats.parries === 0 && s.player.parry.lastGrade === 'none', 'escape: resolveParries() does not parry')
    const t = quiet(cave), m = latched(t)
    t.meta.phase = 'escape'
    Object.assign(t.player.swing, { active: true, t: 0.05, dir: 0 })
    step(t, inp(), DT)
    ok(t.player.stats.parries === 0 && m.ai !== 'dying', 'escape: step() does not parry (parries ' + t.player.stats.parries + ')')
  }

  // N25: the end-screen lock runs from result.endAt (the dying step, meta.time ~100), not from 0.
  {
    const s = quiet(cave)
    s.meta.time = 100
    s.player.hp = 0
    step(s, inp(), DT)
    const dead = s.meta.screen === 'dead' && (s.result?.endAt ?? 0) > 100, held: boolean[] = []
    for (let k = 0; k < 2; k++) { // 0.3 s: past the 0.25 s change lock, inside the 0.5 s end lock; 0.6 s: expired
      s.meta.time += 0.3
      stepScreens(s, inp(['Escape']))
      held.push(s.meta.screen === 'dead')
    }
    ok(dead && held.join() === 'true,false' && s.meta.screen === 'title', 'end lock holds at 0.3 s, expires by 0.6 s (held ' + held.join() + ')')
  }
  // N46/N47: toasts age and `copied` decays by exactly 1 s per 60 steps. N01-N03/N12: startRun then drops toasts, copy label, deny shake.
  {
    const s = at(cave, 'title', 0, { toasts: [{ text: 'a', t: 0.9 }, { text: 'b', t: 1.5 }], copied: 2 })
    for (let k = 0; k < 60; k++) stepScreens(s, inp())
    ok(s.ui.toasts.length === 1 && Math.abs(s.ui.toasts[0].t - 0.5) < 1e-9 && Math.abs(s.ui.copied - 1) < 1e-9, 'toasts and copied age 1 s per 60 steps (copied ' + s.ui.copied + ')')
    Object.assign(s.ui, { copied: 1, copyMsg: 'Copied!', denyT: 0.3 })
    startRun(s, '1', cave)
    ok(s.ui.toasts.length === 0 && s.ui.copied === 0 && s.ui.copyMsg === '' && s.ui.denyT === 0, 'startRun resets toasts, copied, copyMsg, denyT')
  }

  // N28: the volume step rounds (0.35 + 0.1 -> 0.5, 0.1 + 0.2 - 0.1 -> 0.2). Volume keys act only on title/paused: on dead/won they leave 0.5.
  for (const [sc, row, v, key, want] of [
    ['title', 2, 0.35, 'ArrowRight', 0.5], ['title', 2, 0.1 + 0.2, 'ArrowLeft', 0.2],
    ['dead', 1, 0.5, 'ArrowRight', 0.5], ['dead', 2, 0.5, 'Equal', 0.5], ['won', 2, 0.5, 'Minus', 0.5],
  ] as const) {
    const s = at(cave, sc, row)
    s.settings.volume = v
    stepScreens(s, inp([key]))
    ok(s.settings.volume === want, key + ' from ' + v + ' gives ' + want + ' (got ' + s.settings.volume + ')')
  }

  // N31-N33/N43-N45: the seed field types z, numpad digits, '-', w, h (not nav keys); Backspace deletes.
  {
    const s = at(cave, 'title', 5)
    for (const k of [['KeyZ', 'Numpad7', 'Minus'], ['Backspace'], ['KeyW', 'KeyH']]) stepScreens(s, inp(k))
    ok(s.ui.seedInput === 'z7wh' && s.ui.cursor === 5 && s.meta.screen === 'title', 'seed field types z7-, Backspace, wh: ' + s.ui.seedInput)
  }

  // N37-N40: KeyD pages help, reopened help starts on page 0, KeyD/KeyA walk the end-screen buttons; N30: Blur pauses only a run.
  {
    const s = at(cave, 'title', 1), pages: number[] = []
    for (const key of ['Enter', 'KeyD', 'Escape', 'Enter']) {
      s.meta.time += 1
      stepScreens(s, inp([key]))
      pages.push(s.ui.helpPage)
      s.ui.cursor = 1 // Escape leaves the title cursor on 0; point it back at Help
    }
    ok(s.meta.screen === 'help' && pages.join() === '0,1,1,0', 'KeyD pages help, reopening resets to page 0 (pages ' + pages.join() + ')')
    const d = at(cave, 'dead'), cur: number[] = []
    for (const key of ['KeyD', 'KeyA']) { stepScreens(d, inp([key])); cur.push(d.ui.cursor) }
    ok(cur.join() === '1,0', 'KeyD moves the dead cursor 0 -> 1, KeyA back (got ' + cur.join() + ')')
    for (const t of [at(cave, 'title'), d]) { const sc = t.meta.screen; stepScreens(t, inp(['Blur'])); ok(t.meta.screen === sc, 'Blur leaves the ' + sc + ' screen alone') }
  }

  // D4b (R-164): title Depth row (focus 4) via stepScreens, Map-backed fake localStorage as in score.check.ts. Row: [screen, row, class, input, 'class|saved|Best|events|run pending'].
  // Best starts as the class-1 Best (score 7) in every row: a class switch must reload it ('7' for class 1, '-' for null elsewhere), a clamp leaves it.
  const mem = new Map<string, string>(), prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), b1 = JSON.stringify({ v: 1, score: 7, depth: 1, seconds: 1, mineralsUsed: 0, hpLeft: 3 })
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } }, configurable: true, writable: true })
  try {
    for (const [sc, row, from, key, want] of [
      ['title', 4, 3, 'Enter', '4|4|-|uiConfirm|false'], ['title', 4, 4, 'Space', '1|1|7|uiConfirm|false'], ['title', 4, 1, 'click', '2|2|-|uiConfirm|false'], ['title', 4, 2, 'Enter', '3|3|-|uiConfirm|false'],
      ['title', 4, 1, 'ArrowLeft', '1|-|7||false'], ['title', 4, 4, 'ArrowRight', '4|-|-||false'], ['title', 4, 3, 'ArrowLeft', '2|2|-|uiMove|false'], ['title', 4, 2, 'Minus', '1|1|7|uiMove|false'],
      ['title', 4, 'random', 'Enter', '4|4|-|uiConfirm|false'], ['title', 3, 3, 'ArrowRight', '3|-|7||false'], ['paused', 4, 3, 'ArrowRight', '3|-|7||false'], ['help', 0, 3, 'ArrowRight', '3|-|7||false'],
      ['title', 5, 3, 'Enter', '3|-|7|uiConfirm|true'], ['title', 5, 3, 'ArrowRight', '3|-|7||false'],
    ] as const) {
      const t = at(cave, sc, row), n = t.fx.events.length
      mem.clear(); mem.set('last-ember:best:1', b1)
      Object.assign(t, { best: JSON.parse(b1) }); Object.assign(t.settings, { depthClass: from })
      stepScreens(t, key === 'click' ? inp([], 1) : inp([key]))
      const got = [t.settings.depthClass, JSON.parse(mem.get('last-ember:settings') ?? '{}').depthClass ?? '-', t.best?.score ?? '-', t.fx.events.slice(n).map((e) => e.kind), t.ui.genPending !== ''].join('|')
      ok(got === want, `${sc} row ${row} class ${from} + ${key} gives ${want} (got ${got})`)
    }
  } finally { Object.defineProperty(globalThis, 'localStorage', prev ?? { value: undefined, configurable: true, writable: true }) } // ponytail: an absent store comes back as undefined; read() catches the TypeError like any missing store
}
