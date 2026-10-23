// L4 ui: dev-only label with the commit this checkout runs (short sha). Prod build: both functions are no-ops (import.meta.env.DEV is
// replaced by false at build time, so the fetch and the '__commit' URL are tree-shaken). No module state: sha and countdown are in State.debug.
import type { State } from '../core/types.ts'
import { commitTick, normalizeCommit } from '../core/commit.ts'
import { FONT } from './draw.ts'

// Called from update() with the fixed dt. A fetch error is silent and keeps the last value.
// ponytail: a swap during the few ms of an in-flight fetch drops that answer (it writes the old State object); the next poll in 30 s fixes it.
export function pollCommit(s: State, dt: number): void {
  if (!import.meta.env.DEV || !commitTick(s.debug, dt)) return
  fetch('./__commit', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error('commit ' + r.status))))
    .then((t) => { s.debug.commit = normalizeCommit(t) })
    .catch(() => { /* silent: keep the last value */ })
}

// Top-centre, small, low alpha, dark outline for contrast on light and dark art; clear of the HUD rows, title buttons and the DEV button.
export function drawCommit(ctx: CanvasRenderingContext2D, s: State, w: number): void {
  if (!import.meta.env.DEV || s.debug.commit === '') return
  const dpr = ctx.getTransform().a // same screen-space reset as drawDebug: CSS px on every render path (title, help and world)
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 0.6; ctx.globalCompositeOperation = 'source-over'
  ctx.font = '10px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(6,8,11,0.9)'; ctx.strokeText(s.debug.commit, w / 2, 3)
  ctx.fillStyle = '#e8dcc8'; ctx.fillText(s.debug.commit, w / 2, 3)
  ctx.restore()
}
