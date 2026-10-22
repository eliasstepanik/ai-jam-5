// L4 render: explored-memory canvas, one pixel per tile, blitted by drawDarkness (light.ts) under the light masks.
// Spec: docs/architecture-render-2.md §5.2, architecture-modules-render.md (memory.ts row), R-086/C4 (memoryCanvas(s), not drawMemory).
// Canvas, ImageData and the word copy live in res.memory (resources.ts); this module keeps no state and never writes State.
// Per frame: compare world.explored words with the copy, repaint only changed words, upload one dirty rect.
import type { State } from '../core/types.ts'
import { getResources } from '../assets/resources.ts'
import { tileCache } from './tiles.ts'
import { ctx2d, newCanvas } from './light.ts'

const HASH = 35 // '#'
const FLOOR_MIX = 0.35, WALL_MIX = 0.12 // render-2 §5.2: weight of the memory tint over the zone darkness fill
// Zone darkness fill and memory tint, index = zone - 1 (render-2 §5.2).
const DARK: readonly number[] = [0x0a0806, 0x06080b, 0x050906, 0x0a050c]
const TINT: readonly number[] = [0x4a4236, 0x3b4a5c, 0x3a5244, 0x4a3a5c]

// mix(dark, tint, k) as r, g, b integers. COLORS per zone: [dark r,g,b, floor r,g,b, wall r,g,b] (offsets 0, 3, 6).
function ramp(dark: number, tint: number, k: number): [number, number, number] {
  const ch = (sh: number): number => Math.round(((dark >> sh) & 255) * (1 - k) + ((tint >> sh) & 255) * k)
  return [ch(16), ch(8), ch(0)]
}
const COLORS: readonly (readonly number[])[] = DARK.map((d, i) => [
  (d >> 16) & 255, (d >> 8) & 255, d & 255, ...ramp(d, TINT[i], FLOOR_MIX), ...ramp(d, TINT[i], WALL_MIX),
])

// Memory canvas for the current world, brought up to date with world.explored; null for a title/empty world.
// ponytail: created on the first world frame and never disposed (resources §2). A same-size new run keeps the canvas and repaints in
// full (key = tilesHash; a changed hash or size forces the full rebuild, an equal hash on a new run is caught by the word diff).
export function memoryCanvas(s: State): HTMLCanvasElement | null {
  const { w, h, explored, tiles, tilesHash } = s.world
  const t = tileCache(s)
  if (!t) return null
  const m = getResources().memory, n = w * h, nWords = Math.ceil(n / 32)
  if (!m.canvas || m.canvas.w !== w || m.canvas.h !== h || !m.img || m.words.length !== nWords) {
    const cv = newCanvas(w, h)
    m.canvas = { canvas: cv, ctx: ctx2d(cv), w, h }
    m.img = m.canvas.ctx.createImageData(w, h)
    m.words = new Int32Array(nWords)
    m.key = -1
  }
  const full = m.key !== tilesHash
  const data = m.img.data
  let dx0 = w, dy0 = h, dx1 = -1, dy1 = -1
  for (let k = 0; k < nWords; k++) {
    const word = explored[k] | 0
    if (!full && word === m.words[k]) continue
    m.words[k] = word
    for (let i = k * 32, end = Math.min(n, i + 32); i < end; i++) {
      const c = COLORS[t.zone[i] - 1] ?? COLORS[0]
      const wall = tiles.charCodeAt(i) === HASH
      const lit = ((word >>> (i & 31)) & 1) === 1
      const o = lit ? (wall ? 6 : 3) : 0
      data[i * 4] = c[o]; data[i * 4 + 1] = c[o + 1]; data[i * 4 + 2] = c[o + 2]; data[i * 4 + 3] = 255
    }
    const x0 = (k * 32) % w, y0 = Math.floor((k * 32) / w), y1 = Math.floor((Math.min(n, k * 32 + 32) - 1) / w)
    // A word may wrap to the next row (w is not a multiple of 32): widen to the full row then.
    const wraps = y1 !== y0
    dx0 = Math.min(dx0, wraps ? 0 : x0); dx1 = Math.max(dx1, wraps ? w - 1 : x0 + 31)
    dy0 = Math.min(dy0, y0); dy1 = Math.max(dy1, y1)
  }
  m.key = tilesHash
  if (dx1 >= 0) m.canvas.ctx.putImageData(m.img, 0, 0, dx0, dy0, Math.min(w - 1, dx1) - dx0 + 1, dy1 - dy0 + 1)
  return m.canvas.canvas
}
