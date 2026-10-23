// L4 render: character atlas lookup (frame rects, timing, flame anchor), flame palette swap and blit. No DOM at import time (R-039).
// Spec: docs/architecture-modules-render.md row `src/render/charatlas.ts` (D5), architecture-render-2 §3.2/3.3, R-184, R-185, ai-jam-5-asset-formats-25d.
// The decoded sheet is NOT loaded here: images.ts fills `res.images.sheets`; this module only reads it.
import charsJson from '../assets/characters.json'
import type { MineralId } from '../core/types.ts'
import { getResources } from '../assets/resources.ts'
import type { Resources } from '../assets/resources.ts'

export type AtlasFrame = { x: number; y: number; dur: number; flame?: [number, number] }
export type FlameMaterial = MineralId | 'base'

type Pt = { readonly x: number; readonly y: number }
type FrameRec = { readonly rect: Pt; readonly duration_ms: number; readonly flame_center_anchor?: Pt }
type AnimRec = { readonly id: string; readonly loop: boolean; readonly directions: Record<string, readonly FrameRec[]> }
type PaletteRec = { readonly id: string; readonly entries: readonly { readonly rgb: readonly number[] }[] }
type CharsJson = { readonly direction_order: readonly string[]; readonly palettes: readonly PaletteRec[]; readonly animations: readonly AnimRec[] }

const J = charsJson as unknown as CharsJson

const FRAME_PX = 64
// DEFAULT: the characters sheet is the second external sheet (cave_tileset.png = 0, characters.png = 1), see resources.ts warnings order.
const SHEET = 1
// DEFAULT: LRU of palette-swapped frames, R-185.
const SWAP_MAX = 256
// DEFAULT: pivot (32,32) minus (12,11), the torch fallback of render-2 §3.3, for frames without a baked flame anchor.
const FLAME_FALLBACK: [number, number] = [FRAME_PX / 2 - 12, FRAME_PX / 2 - 11]
// DEFAULT: unknown character/animation reads as an empty 100 ms frame at the sheet origin, length 0, no loop.
const NO_FRAME: AtlasFrame = { x: 0, y: 0, dur: 100 }

// 'character/animation' -> per direction (atlas order n..nw) frame list + loop flag, built once from the delivered JSON.
// Immutable derived data, re-evaluated with the module on a hot swap.
const ANIMS = new Map<string, { frames: AtlasFrame[][]; loop: boolean }>(
  J.animations.map((a) => [a.id, {
    loop: a.loop,
    frames: J.direction_order.map((d) => (a.directions[d] ?? []).map((f): AtlasFrame => {
      const p = f.flame_center_anchor
      return p ? { x: f.rect.x, y: f.rect.y, dur: f.duration_ms, flame: [p.x, p.y] } : { x: f.rect.x, y: f.rect.y, dur: f.duration_ms }
    })),
  }]))

// Flame colours per material as [outer, middle, core] RGB triples; 'base' is the colour set baked into the sheet.
const FLAME = new Map<string, number[][]>(J.palettes.filter((p) => p.id.startsWith('flame_'))
  .map((p) => [p.id.slice(6), p.entries.map((e) => [e.rgb[0] ?? 0, e.rgb[1] ?? 0, e.rgb[2] ?? 0])]))

// Frame `i` of `animation` for facing `dir` (atlas order n, ne, e, se, s, sw, w, nw). Looping animations wrap `i`, one-shots clamp to the last frame.
// The returned object is shared: do not mutate it.
export function charFrame(character: string, animation: string, dir: number, i: number): AtlasFrame {
  const a = ANIMS.get(character + '/' + animation)
  const list = a?.frames[((dir % 8) + 8) % 8]
  if (!a || !list || list.length === 0) return NO_FRAME
  const n = list.length
  return list[a.loop ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1)] ?? NO_FRAME
}

// Frames per direction; 0 for an unknown animation.
export function animLen(character: string, animation: string): number {
  return ANIMS.get(character + '/' + animation)?.frames[0]?.length ?? 0
}

// True when the animation repeats; false for one-shots and unknown animations.
export function animLoop(character: string, animation: string): boolean {
  return ANIMS.get(character + '/' + animation)?.loop ?? false
}

// Flame centre in frame pixels (0..64, pivot at 32,32); frames without a baked anchor use the fixed fallback.
export function flameAnchor(f: AtlasFrame): [number, number] {
  return f.flame ?? FLAME_FALLBACK
}

// The characters sheet once decoded, else null (loading, failed or not yet requested).
function sheetOf(res: Resources): CanvasImageSource | null {
  return res.images.sheetState[SHEET] === 'ok' ? res.images.sheets[SHEET] ?? null : null
}

// Frame `f` with the three flame colours replaced by those of `material` (R-185): exact RGB match, alpha untouched.
// Cached per frame and material in `res.swapped` (LRU 256). `base`, an unknown material or a missing sheet yields the unswapped frame.
// ponytail: key uses the sheet rect (x|y|material), which is unique per anim/dir/frame, instead of the spec's `anim|dir|i|material` because AtlasFrame carries no anim name. A frame drawn before the sheet loads is returned uncached so it is retried.
export function swappedFrame(res: Resources, f: AtlasFrame, material: FlameMaterial): CanvasImageSource {
  const sheet = sheetOf(res)
  const from = FLAME.get('base')
  const to = FLAME.get(material)
  const key = f.x + '|' + f.y + '|' + material
  const hit = res.swapped.get(key)
  if (hit) { res.swapped.delete(key); res.swapped.set(key, hit); return hit }
  const c = document.createElement('canvas')
  c.width = c.height = FRAME_PX
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!sheet || !g) return c
  g.drawImage(sheet, f.x, f.y, FRAME_PX, FRAME_PX, 0, 0, FRAME_PX, FRAME_PX)
  if (from && to && material !== 'base') {
    const img = g.getImageData(0, 0, FRAME_PX, FRAME_PX)
    const d = img.data
    for (let p = 0; p < d.length; p += 4) {
      for (let k = 0; k < from.length; k++) {
        const s = from[k]
        const t = to[k]
        if (s && t && d[p] === s[0] && d[p + 1] === s[1] && d[p + 2] === s[2]) { d[p] = t[0] ?? 0; d[p + 1] = t[1] ?? 0; d[p + 2] = t[2] ?? 0; break }
      }
    }
    g.putImageData(img, 0, 0)
  }
  res.swapped.set(key, c)
  if (res.swapped.size > SWAP_MAX) res.swapped.delete(res.swapped.keys().next().value as string)
  return c
}

// Blit the 64x64 source rect of `f` at (x, y), no rotation or scale. Draws nothing until the characters sheet is decoded.
export function drawAtlas(ctx: CanvasRenderingContext2D, f: AtlasFrame, x: number, y: number): void {
  const sheet = sheetOf(getResources())
  if (sheet) ctx.drawImage(sheet, f.x, f.y, FRAME_PX, FRAME_PX, x, y, FRAME_PX, FRAME_PX)
}
