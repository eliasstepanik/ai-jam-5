// Stable host: canvas, fixed-timestep loop, input, persistent state, HMR swap.
// Rarely edited. Game logic lives in game.ts.
import * as initialGame from './game.ts'
import type { State } from './game.ts'
import { mergeState } from './merge.ts'
import type { Mod } from './merge.ts'

export type Input = {
  wheel?: number // accumulated hotbar steps: down/right positive, consumed once per fixed update
  keys: Set<string> // held, KeyboardEvent.code
  pressed: Set<string> // went down since the last update step; also 'Blur' when focus or visibility was lost
  mouse: { x: number; y: number; down: boolean } // CSS pixels relative to the canvas, primary button only
  clicks: { x: number; y: number }[] // primary-button downs since the last update step
  view: { w: number; h: number; dpr: number } // canvas size in CSS pixels (same w, h that render receives) + devicePixelRatio used by resize
}

interface Game extends Mod<State> {
  update(s: State, input: Input, dt: number): void
  render(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void
}

const STEP = 1 / 60
const MAX_FRAME = 0.25 // clamp after tab-away so we do not spiral
const STEP_BUDGET_MS = 12 // ponytail: wall-time bailout; per-system time slicing if a normal step ever nears it

let game: Game = initialGame
let error: string | null = null
let lastLogged = ''

function fail(where: string, e: unknown): void {
  error = `${where}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`
  if (error !== lastLogged) console.error(error) // log once, not 60x/s
  lastLogged = error
}

// state survives main.ts re-execution via import.meta.hot.data.
let state: State
try {
  state = mergeState(game, import.meta.hot?.data.state)
} catch (e) {
  fail('init', e) // stale/incompatible saved state: log + overlay, start fresh so the loop still runs
  state = game.init()
}

// ---- canvas ----
const canvas = document.createElement('canvas')
document.body.appendChild(canvas)
const ctx = canvas.getContext('2d')!
let w = 0
let h = 0
function resize(): void {
  const dpr = window.devicePixelRatio || 1
  w = window.innerWidth
  h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  input.view.w = w
  input.view.h = h
  input.view.dpr = dpr
}

// ---- input ----
const input: Input = { keys: new Set(), pressed: new Set(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 0, h: 0, dpr: 1 } }
let wheelRemainder = 0
const GAME_KEYS = /^(Arrow|Space)/ // stop page scroll
const listeners: [EventTarget, string, (e: never) => void][] = []
function on<E extends Event>(t: EventTarget, type: string, fn: (e: E) => void, options?: AddEventListenerOptions): void {
  t.addEventListener(type, fn as EventListener, options)
  listeners.push([t, type, fn as (e: never) => void])
}

function reset(): void {
  state = game.init()
  error = null
  lastLogged = ''
}

on<KeyboardEvent>(window, 'keydown', (e) => {
  if (GAME_KEYS.test(e.code)) e.preventDefault()
  if (import.meta.env.DEV && e.code === 'KeyR' && !e.repeat && !e.ctrlKey && !e.metaKey) return reset()
  if (!input.keys.has(e.code)) input.pressed.add(e.code)
  input.keys.add(e.code)
})
on<KeyboardEvent>(window, 'keyup', (e) => input.keys.delete(e.code))
function lostFocus(): void {
  input.wheel = 0; wheelRemainder = 0
  input.keys.clear()
  input.mouse.down = false
  input.pressed.add('Blur') // game pauses on its next step
}
on<Event>(window, 'blur', lostFocus)
on<Event>(document, 'visibilitychange', () => {
  if (document.hidden) lostFocus()
})
canvas.style.touchAction = 'none' // let touch drags reach pointer events instead of scrolling
on<PointerEvent>(canvas, 'pointermove', (e) => {
  input.mouse.x = e.offsetX
  input.mouse.y = e.offsetY
  input.mouse.down = (e.buttons & 1) !== 0 // a chorded release fires pointermove, not pointerup (R-135)
})
on<PointerEvent>(canvas, 'pointerdown', (e) => {
  input.mouse.x = e.offsetX
  input.mouse.y = e.offsetY
  if (e.button !== 0) return // primary only: a right click must not swing/parry
  canvas.setPointerCapture(e.pointerId) // keeps move/up coming if the drag leaves the canvas
  input.mouse.down = true
  input.clicks.push({ x: e.offsetX, y: e.offsetY })
})
on<PointerEvent>(window, 'pointerup', () => (input.mouse.down = false))
on<PointerEvent>(window, 'pointercancel', () => (input.mouse.down = false))
on<WheelEvent>(canvas, 'wheel', (e) => {
  if (e.ctrlKey || !e.deltaY || state.meta.screen !== 'playing' || state.meta.phase !== 'descent') return
  e.preventDefault()
  const delta = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? h : 1)
  if (Math.sign(delta) !== Math.sign(wheelRemainder)) wheelRemainder = 0
  wheelRemainder += delta
  const steps = Math.trunc(wheelRemainder / 100)
  input.wheel = (input.wheel ?? 0) + steps
  wheelRemainder -= steps * 100
}, { passive: false })
on<Event>(canvas, 'contextmenu', (e) => e.preventDefault())
on<Event>(window, 'resize', resize)
resize()

// ---- loop ----
let acc = 0
let prev = performance.now()
let raf = 0

function frame(now: number): void {
  raf = requestAnimationFrame(frame)
  acc += Math.max(0, Math.min((now - prev) / 1000, MAX_FRAME))
  prev = now

  // ponytail: fixed timestep renders without interpolation (stutter on 120/144 Hz); add interpolation if it matters.
  const t0 = performance.now()
  while (acc >= STEP) {
    acc -= STEP
    try {
      game.update(state, input, STEP)
    } catch (e) {
      fail('update', e)
    }
    input.wheel = 0
    input.pressed.clear()
    input.clicks.length = 0
    if (performance.now() - t0 > STEP_BUDGET_MS) {
      acc = 0 // drop the backlog, never spiral
      break
    }
  }

  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.save()
  try {
    game.render(ctx, state, w, h)
  } catch (e) {
    fail('render', e)
  }
  ctx.restore()
  if (error) drawError()
}

function drawError(): void {
  ctx.fillStyle = 'rgba(120,0,0,0.85)'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  ctx.font = '14px monospace'
  ctx.textBaseline = 'top'
  // ponytail: no wrapping, long lines clip at the edge; full text is in the console.
  error!.split('\n').slice(0, Math.floor(h / 18) - 1).forEach((line, i) => ctx.fillText(line, 12, 12 + i * 18))
  ctx.fillText(`Fix game.ts and save to recover.${import.meta.env.DEV ? ' R resets state.' : ''}`, 12, h - 24)
}

raf = requestAnimationFrame(frame)

// ---- HMR ----
if (import.meta.hot) {
  import.meta.hot.accept('./game.ts', (mod) => {
    if (!mod) return // module failed to load; Vite shows its own overlay
    try {
      const next = mod as unknown as Game
      const merged = mergeState(next, state) // may throw: commit only on success
      game = next
      state = merged
      error = null
      lastLogged = ''
      console.log('[hmr] game.ts swapped, state kept')
    } catch (e) {
      fail('hmr', e) // keep old module + state; overlay shows the error
    }
  })
  // Editing main.ts re-executes it: tear down, hand state to the next instance.
  import.meta.hot.accept()
  import.meta.hot.dispose((data) => {
    data.state = state
    cancelAnimationFrame(raf)
    for (const [t, type, fn] of listeners) t.removeEventListener(type, fn as EventListener)
    canvas.remove()
  })
}
