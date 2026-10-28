// L3 systems: turns Input into a per-step Intent (never stored in State). Writes only player.facing.
// Spec: docs/architecture-systems.md §4 (S4); zoom per docs/architecture-rulings-3.md R-131.
import type { Input } from '../main.ts'
import type { MineralId, State } from '../core/types.ts'
import { MINERALS } from '../core/state.ts'
import { viewZoomCss } from '../core/view.ts'

export type Intent = {
  mx: number; my: number // movement direction, unit vector or (0,0)
  moving: boolean // mx !== 0 || my !== 0
  aimX: number; aimY: number // mouse in world px
  swing: boolean // left click edge this step (clicks.length > 0)
  roll: boolean // pressed 'Space'
  interact: boolean // held 'KeyE'
  interactEdge: boolean // pressed 'KeyE'
  toss: boolean; shake: boolean // pressed 'KeyF' / 'KeyG'
  select: MineralId | null // pressed Digit1..3 -> MINERALS[0..2]
}

const DIGITS = ['Digit1', 'Digit2', 'Digit3']

export function resolveIntent(s: State, input: Input): Intent {
  const { keys, pressed, mouse, view } = input
  const p = s.player
  const ax = +(keys.has('KeyD') || keys.has('ArrowRight')) - +(keys.has('KeyA') || keys.has('ArrowLeft'))
  const ay = +(keys.has('KeyS') || keys.has('ArrowDown')) - +(keys.has('KeyW') || keys.has('ArrowUp'))
  const len = Math.hypot(ax, ay)
  const mx = len ? ax / len : 0 // len 0 -> literal +0, never -0
  const my = len ? ay / len : 0
  const moving = mx !== 0 || my !== 0

  const zoom = viewZoomCss(view.h, view.dpr) // same zoom as render (R-131)
  const aimX = s.cam.x + (mouse.x - view.w / 2) / zoom
  const aimY = s.cam.y + (mouse.y - view.h / 2) / zoom

  if (moving) p.facing = Math.atan2(my, mx)
  else if (s.meta.phase !== 'escape' && Math.hypot(aimX - p.x, aimY - p.y) >= 4) {
    p.facing = Math.atan2(aimY - p.y, aimX - p.x) // else keep: no jitter with the cursor on the player
  }

  const d = DIGITS.findIndex(c => pressed.has(c)) // lowest digit wins
  return {
    mx, my, moving, aimX, aimY,
    swing: input.clicks.length > 0,
    roll: pressed.has('Space'),
    interact: keys.has('KeyE'),
    interactEdge: pressed.has('KeyE'),
    toss: pressed.has('KeyF'),
    shake: pressed.has('KeyG'),
    select: d < 0 ? null : MINERALS[d],
  }
}
