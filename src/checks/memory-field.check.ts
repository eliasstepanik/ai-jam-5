// Projected fog memory owns the same raised cap/face footprint, with a uniform off-map margin.
import { memoryOwners, memoryRect, MEMORY_PIXEL, MEMORY_PAD } from '../render/memory-field.ts'
const ok = (v: boolean, msg: string): void => { if (!v) throw Error('memory projection: ' + msg) }
export function run(): void {
  const w = 9, h = 9, a = new Array(w * h).fill('.') as string[]
  a[4 * w + 4] = '#'; a[5 * w + 4] = '#'
  const rect = memoryRect(w, h, 48), owners = memoryOwners(a.join(''), w, h, 48)
  const at = (x: number, y: number): number => owners[Math.floor((y - rect.top) / MEMORY_PIXEL) * rect.w + Math.floor((x - rect.left) / MEMORY_PIXEL)]
  const upper = (4 * w + 4) * 2 + 1, lower = (5 * w + 4) * 2 + 1
  ok(at(136, 88) === upper, 'north cap is raised by 48px')
  ok(at(136, 120) === lower, 'later row owns its raised cap')
  ok(at(136, 152) === lower - 1 && at(136, 184) === lower - 1, 'brighter south face reaches the ground footprint')
  ok(at(136, 200) === (6 * w + 4) * 2, 'floor beyond the face is not shifted')
  ok(at(120, 88) === (2 * w + 3) * 2 && at(168, 88) === (2 * w + 5) * 2, 'east and west floor stay aligned')
  for (let x = 0; x < rect.w; x++) ok(owners[x] === -1 && owners[(rect.h - 1) * rect.w + x] === -1, 'dark top/bottom margin')
  for (let y = 0; y < rect.h; y++) ok(owners[y * rect.w] === -1 && owners[y * rect.w + rect.w - 1] === -1, 'dark side margins')
  ok(rect.left === -MEMORY_PAD && rect.top === -48 - MEMORY_PAD, 'world origin includes raised caps and padding')
  const edge = memoryOwners('#' + '.'.repeat(w * h - 1), w, h, 48)
  ok(edge[(MEMORY_PAD / MEMORY_PIXEL) * rect.w + MEMORY_PAD / MEMORY_PIXEL] === 1, 'first-row cap can extend north of the grid')
  ok(at(136, h * 32 - 8) === -1, 'virtual off-map rock covers the southern ground strip')
  ok(owners.every(v => v === -1 || (v >= 0 && v < w * h * 2)), 'all projected owners are valid')
}
