// The hot-swappable game module. Edit and save: Vite HMR swaps it in, state is kept.
// Host (main.ts) calls init / update / render, and migrate (if exported) on EVERY hot swap
// and re-run, so migrate must be idempotent. R resets state (dev only).
import type { Input } from './main.ts'

export type State = {
  px: number
  py: number
  score: number
  dots: { x: number; y: number }[]
  time: number
}

const SIZE = 32
const SPEED = 280 // px per second

export function init(): State {
  return { px: 200, py: 200, score: 0, dots: [], time: 0 }
}

// Optional. Export migrate(oldState) when a change to State needs real conversion;
// without it, old values are kept and new keys are filled from init().
// migrate runs on EVERY hot swap and every main.ts re-run, not only when State changes shape,
// and its output is fed back in on the next swap. It MUST be idempotent (safe to run
// repeatedly): migrate(migrate(x)) must equal migrate(x). Fill defaults, never transform
// already-valid values (no `score * 2`).
// export function migrate(old: any): State {
//   const s = { ...init(), ...old }
//   if (old.lives === undefined) s.lives = 3 // idempotent: only fills when missing
//   return s
// }

export function update(s: State, input: Input, dt: number): void {
  s.time += dt
  const k = input.keys
  const dx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
  const dy = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
  const len = Math.hypot(dx, dy) || 1
  s.px += (dx / len) * SPEED * dt
  s.py += (dy / len) * SPEED * dt

  for (const c of input.clicks) s.dots.push({ x: c.x, y: c.y })

  // Walk over a dot to collect it.
  const half = SIZE / 2
  s.dots = s.dots.filter((d) => {
    const hit = Math.abs(d.x - (s.px + half)) < half + 6 && Math.abs(d.y - (s.py + half)) < half + 6
    if (hit) s.score++
    return !hit
  })
}

export function render(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  ctx.fillStyle = '#1b1f2a'
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#ffd166'
  for (const d of s.dots) {
    ctx.beginPath()
    ctx.arc(d.x, d.y, 6, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#06d6a0'
  ctx.fillRect(s.px, s.py, SIZE, SIZE)

  ctx.fillStyle = '#eee'
  ctx.font = '20px monospace'
  ctx.textBaseline = 'top'
  ctx.fillText(`score ${s.score}`, 12, 12)
  ctx.font = '13px monospace'
  ctx.fillStyle = '#889'
  ctx.fillText('WASD / arrows: move   click: drop dot' + (import.meta.env.DEV ? '   R: reset' : ''), 12, h - 24)
}
