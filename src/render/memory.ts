// Explored memory follows the same raised cap/face geometry as world art, including a dark off-map margin.
// Derived pixels and ownership live in the registry; unchanged frames do no pixel work. State stays read-only.
import type { State } from '../core/types.ts'
import { getResources } from '../assets/resources.ts'
import { ctx2d, newCanvas } from './light.ts'
import { FACE_H } from './tiles-paint.ts'
import { MEMORY_COLORS, memoryOwners, memoryRect } from './memory-field.ts'

export function memoryCanvas(s: State): HTMLCanvasElement | null {
  const { w, h, explored, tiles, tilesHash } = s.world
  if (s.settings.pureDarkness || !w || !h || tiles.length !== w * h) return null
  const m = getResources().memory, rect = memoryRect(w, h, FACE_H), nWords = Math.ceil(w * h / 32)
  if (!m.canvas || m.canvas.w !== rect.w || m.canvas.h !== rect.h || !m.img || m.words.length !== nWords) {
    const cv = newCanvas(rect.w, rect.h)
    m.canvas = { canvas: cv, ctx: ctx2d(cv), w: rect.w, h: rect.h }
    m.img = m.canvas.ctx.createImageData(rect.w, rect.h)
    m.words = new Int32Array(nWords); m.key = -1
  }
  const key = tilesHash ^ 0x4d454d33, revision = import.meta.url
  const full = m.key !== key || m.revision !== revision || !m.owners
  if (full) m.owners = memoryOwners(tiles, w, h, FACE_H)
  let changed = full
  for (let k = 0; !changed && k < nWords; k++) changed = (explored[k] | 0) !== m.words[k]
  if (!changed) return m.canvas.canvas
  const data = m.img.data, owners = m.owners!
  let x0 = rect.w, y0 = rect.h, x1 = -1, y1 = -1
  for (let i = 0; i < owners.length; i++) {
    const owner = owners[i], tile = owner >> 1, word = tile >> 5, bit = 1 << (tile & 31)
    if (!full && (owner < 0 || (((explored[word] | 0) ^ m.words[word]) & bit) === 0)) continue
    const seen = owner >= 0 && ((explored[word] | 0) & bit) !== 0
    const o = seen ? (owner & 1 ? 6 : 3) : 0
    data[i * 4] = MEMORY_COLORS[o]; data[i * 4 + 1] = MEMORY_COLORS[o + 1]; data[i * 4 + 2] = MEMORY_COLORS[o + 2]; data[i * 4 + 3] = 255
    const x = i % rect.w, y = Math.floor(i / rect.w)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  for (let k = 0; k < nWords; k++) m.words[k] = explored[k] | 0
  m.key = key; m.revision = revision
  if (x1 >= 0) m.canvas.ctx.putImageData(m.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
  return m.canvas.canvas
}
