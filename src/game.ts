// The hot-swappable game module: a thin facade (L5). Host (main.ts) calls init / update / render, and migrate on EVERY
// hot swap and re-run. Spec: docs/architecture-modules-ui-assets.md §1, R-096 (update order), R-133 (dev keys live here), R-170 (hit testing).
// No module-level state and no listeners: everything lives in State or in the resource registry (assets/resources.ts).
import type { Input } from './main.ts'
import type { State } from './core/types.ts'
import { getResources } from './assets/resources.ts'
import { step } from './systems/step.ts'
import { endLayout, helpClick, helpLayout, hit, pauseLayout, titleLayout, titleReady } from './ui/layout.ts'
import type { Button } from './ui/layout.ts'
import { platformStep } from './ui/platform.ts'
import { render as renderFrame } from './render/index.ts'
import { drawCommit, pollCommit } from './ui/commit.ts'
import { audioStep, warnOnce } from './audio/engine.ts'
import { settingsLayout } from './ui/settings.ts'
import { setAudioLevel } from './systems/settings.ts'
import { beginDebugUpdate, debugAvailable, debugInput, drawDebug, endDebugUpdate } from './ui/debug.ts'

export type { State } from './core/types.ts'
export { init } from './core/state.ts'
export { migrate } from './game-migrate.ts' // idempotent deep default fill (never transforms valid values)

const QUALITY = ['auto', 'q0', 'q1', 'q2', 'q3'] as const

// Legacy Shift+Digit1..6 shortcuts (R-132/R-133), enabled in a developer session. Panel keys live in debugInput.
// Returns the Input step() sees: a copy without the Digit1..6 edges when a Shift chord fired, so they do not also select a mineral or type into the seed field.
function devKeys(s: State, input: Input): Input {
  const p = input.pressed
  if (!input.keys.has('ShiftLeft') && !input.keys.has('ShiftRight')) return input
  const g = s.debug
  if (p.has('Digit1')) g.reveal = !g.reveal
  if (p.has('Digit2')) g.god = !g.god
  if (p.has('Digit3')) g.overlay = !g.overlay
  if (p.has('Digit4')) g.freezeAi = !g.freezeAi
  if (p.has('Digit5')) g.showPaths = !g.showPaths
  if (p.has('Digit6')) s.settings.quality = QUALITY[(QUALITY.indexOf(s.settings.quality) + 1) % QUALITY.length]
  const rest = new Set(p)
  for (let i = 1; i <= 6; i++) rest.delete('Digit' + i)
  return rest.size === p.size ? input : { ...input, pressed: rest }
}

// Same rects the renderer draws (update and render call the same *Layout). Button order == focus order in systems/screens.ts.
function buttons(s: State, w: number, h: number): Button[] | null {
  switch (s.meta.screen) {
    case 'title': {
      return titleLayout(w, h, s, titleReady(s, getResources().images)).buttons // same `ready` as drawScreen (ui/menus.ts)
    }
    case 'settings': return settingsLayout(w, h).buttons
    case 'paused': return pauseLayout(w, h, s).buttons
    case 'dead':
    case 'won': return endLayout(w, h, s).buttons
    default: return null
  }
}

// R-170: stepScreens activates the focused item on ANY click, so the facade does the hit testing before step.
// Hover follows the mouse and moves the cursor when it enters a button; a click moves the cursor to the button it hit and is
// dropped when it hit nothing (click outside a button does nothing) or the seed field (a click only focuses it, it must not start a run).
// Help: a tab click sets the page, a click outside the panel goes back (Escape edge). Returns the Input that step() sees.
function pointer(s: State, input: Input): Input {
  const { w, h } = input.view, { x, y } = input.mouse, u = s.ui
  if (s.meta.screen === 'help') {
    const l = helpLayout(w, h, s)
    u.hover = hit(l.tabs, x, y)
    let back = false
    for (const c of input.clicks) {
      const r = helpClick(l, c.x, c.y)
      if (r === null) continue
      if (r.kind === 'tab') u.helpPage = r.page
      else back = true
    }
    return back ? { ...input, pressed: new Set(input.pressed).add('Escape') } : input
  }
  if (s.meta.screen === 'settings') {
    const l = settingsLayout(w, h), bs = l.buttons
    if (input.pressed.has('Blur')) u.settingsDrag = -1
    if (s.meta.time - u.screenAt >= .25) {
      for (const c of input.clicks) { const i = hit(bs, c.x, c.y); if (i === 0 || i === 1) u.settingsDrag = i }
      const i = u.settingsDrag
      if (i >= 0 && i < 2) {
        const track = l.tracks[i], click = input.clicks[0]
        setAudioLevel(s, i, ((click?.x ?? x) - track.x) / track.w)
        if (!input.mouse.down) u.settingsDrag = -1
        u.cursor = i; u.hover = i
        return { ...input, clicks: [] }
      }
    }
  }
  const bs = buttons(s, w, h)
  if (bs === null) return input // playing: clicks belong to combat
  const over = hit(bs, x, y)
  if (over >= 0 && over !== u.hover) u.cursor = over
  u.hover = over
  if (input.clicks.length === 0) return input
  const clicks = input.clicks.filter((c) => {
    const i = hit(bs, c.x, c.y)
    if (i >= 0) u.cursor = i
    return i >= 0 && !(s.meta.screen === 'title' && i === 4)
  })
  return clicks.length === input.clicks.length ? input : { ...input, clicks }
}

// Render the game, then developer overlays. Access is development-only unless the exported build opts in with ?debug=1.
export function render(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  renderFrame(ctx, s, w, h)
  drawCommit(ctx, s, w) // dev only; before the overlays so the stats panel covers it
  if (debugAvailable()) drawDebug(ctx, s, w, h)
}

// R-096: (1) dev toggles, (2) step (runs stepScreens first, world systems only while playing), (3) platformStep, (4) audioStep (never throws into the loop).
export function update(s: State, input: Input, dt: number): void {
  pollCommit(s, dt) // dev only: re-fetches the running commit sha every 30 s
  const dev = debugAvailable()
  const next = dev ? debugInput(s, devKeys(s, input)) : input
  if (dev) beginDebugUpdate(s)
  step(s, pointer(s, next), dt)
  platformStep(s)
  try { audioStep(s, input) } catch (e) { warnOnce(e) }
  if (dev) endDebugUpdate(s)
}
