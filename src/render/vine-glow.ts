// L4 render: additive shape-following pulse of the glowing vines (cave overhaul A7 + shape/torch update). Reads vineSprites(s, v)
// (frame name, exact drawn anchor, phase) and draws each vine's own sprite silhouette, recoloured to the glow colour, so the glow
// hugs the vine shape instead of a round blob. The pulse alpha is multiplied by torchFade(dist, flameRadius(s)): far vines stay a
// faint navigation hint, near vines read bright. Pure: no State writes, no rand, no wall clock; the pulse runs on s.meta.time, so a
// paused game freezes it. Wired after drawOreEmission in index.ts (chunk I1), world transform set, composite already 'lighter'.
import type { State } from '../core/types.ts'
import { flameRadius } from '../systems/light.ts'
import { getResources } from '../assets/resources.ts'
import { blit, tileFrame, tilesetOf } from './tileset.ts'
import { torchFade } from './keys.ts'
import { ctx2d, newCanvas } from './light.ts'
import type { Quality } from './quality.ts'
import type { View } from './view.ts'
import { vineSprites } from './vine-sites.ts'
import type { VineSprite } from './vine-sites.ts'

const VINE: readonly [number, number, number] = [109, 255, 196] // #6dffc4 cold bioluminescent green-cyan
const CORE: readonly [number, number, number] = [216, 255, 240] // #d8fff0 near-white core tone
const CAP = 48 // nearest vines to the player that get drawn
const BASE = 0.16, AMP = 0.10, RATE = 0.3 // alpha = (BASE + AMP * sin(2 pi (RATE * t + phase))) * torchFade
const CORE_LUMA = 200, CORE_SPAN = 55 // pixels with min(rgb) >= CORE_LUMA - CORE_SPAN get the core tone
const HALO_PAD = 4, HALO_BLUR = 1.5 // px padding / blur radius of the soft-edge halo canvas

// Scratch for the partial selection (ascending distance, first CAP). Overwritten every call, never read across frames: no state.
const bestD = new Float64Array(CAP), bestI = new Int32Array(CAP)

// Indices (into sprites) of the up to CAP in-view sprites nearest to (px, py); returns the count. Insertion into a fixed sorted
// window: O(n * CAP) worst case, no allocation, ties keep sprite order so equal inputs draw identically.
// ponytail: n is a few hundred visible vines at most; swap for a quickselect only if a profile shows this loop.
function nearest(sprites: readonly VineSprite[], v: View, px: number, py: number): number {
  let n = 0
  for (let i = 0; i < sprites.length; i++) {
    const sp = sprites[i], f = tileFrame(sp.name)
    const x0 = sp.x - f[4], y0 = sp.y - f[5]
    if (x0 + f[2] < v.x0 || x0 > v.x1 || y0 + f[3] < v.y0 || y0 > v.y1) continue
    const d = (sp.x - px) * (sp.x - px) + (sp.y - py) * (sp.y - py)
    if (n === CAP && d >= bestD[CAP - 1]) continue
    let j = n < CAP ? n++ : CAP - 1
    while (j > 0 && bestD[j - 1] > d) { bestD[j] = bestD[j - 1]; bestI[j] = bestI[j - 1]; j-- }
    bestD[j] = d; bestI[j] = i
  }
  return n
}

// Tinted silhouette of one frame: blit the frame into an offscreen canvas, keep its alpha, set RGB to the glow colour (the strongest
// pixels, min(rgb) above the threshold, take the near-white core tone), put it back. Keyed by atlas generation like ore-emission.ts and
// stored in the shared res.swapped cache, whose LRU 256 cap charatlas/ore-emission already enforce - no own cap here (a smaller one would
// evict flame frames every frame and re-allocate canvases per frame). A hot swap or atlas reload just refills. `key` carries the atlas
// gen so stale entries are never read.
function silhouette(key: string): HTMLCanvasElement | null {
  const ts = tilesetOf()
  if (!ts) return null
  const res = getResources(), cache = res.swapped
  let c = cache.get(key)
  if (c) return c
  const name = key.slice(key.lastIndexOf(':') + 1), f = tileFrame(name)
  if (f[2] === 0 || f[3] === 0) return null // unknown frame: draw nothing (tileset.ts NO_FRAME behaviour)
  c = newCanvas(f[2], f[3])
  const g = ctx2d(c)
  blit(g, ts, name, f[4], f[5])
  const im = g.getImageData(0, 0, f[2], f[3]), d = im.data
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]
    if (a === 0) continue
    const strong = Math.min(d[i], d[i + 1], d[i + 2]) >= CORE_LUMA - CORE_SPAN
    const col = strong ? CORE : VINE
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = a
  }
  g.putImageData(im, 0, 0)
  cache.set(key, c)
  return c
}

// Soft-edge halo: the silhouette blurred by HALO_BLUR px into a HALO_PAD-padded canvas, the crisp silhouette re-drawn on top so the
// core stays readable. ctx.filter blur is feature-detected: without it the halo is the crisp shape (slightly stronger glow, no crash).
function halo(key: string): HTMLCanvasElement | null {
  const base = silhouette(key)
  if (!base) return null
  const hkey = key + ':h', res = getResources(), cache = res.swapped
  let c = cache.get(hkey)
  if (c) return c
  const f = tileFrame(key.slice(key.lastIndexOf(':') + 1))
  c = newCanvas(f[2] + HALO_PAD * 2, f[3] + HALO_PAD * 2)
  const g = ctx2d(c)
  if (typeof g.filter === 'string') {
    g.filter = 'blur(' + HALO_BLUR + 'px)'
    g.drawImage(base, HALO_PAD, HALO_PAD)
    g.filter = 'none'
  }
  g.drawImage(base, HALO_PAD, HALO_PAD)
  cache.set(hkey, c)
  return c
}

export function drawVineGlow(ctx: CanvasRenderingContext2D, s: State, v: View, q: Quality): void {
  const sprites = vineSprites(s, v)
  if (sprites.length === 0) return
  const n = nearest(sprites, v, s.player.x, s.player.y)
  if (n === 0) return
  const t = s.meta.time, R = flameRadius(s), px = s.player.x, py = s.player.y
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let k = 0; k < n; k++) {
    const sp = sprites[bestI[k]], f = tileFrame(sp.name)
    const pulse = BASE + AMP * Math.sin(2 * Math.PI * (RATE * t + sp.phase))
    const fade = torchFade(Math.hypot(sp.x - px, sp.y - py), R)
    const a = pulse * fade
    if (a <= 0) continue
    // q.glow off (low quality): crisp silhouette only, no blurred halo (the old code drew the core only here).
    const img = q.glow ? halo('vine:' + getResources().images.gen + ':' + sp.name) : silhouette('vine:' + getResources().images.gen + ':' + sp.name)
    if (!img) continue
    const pad = q.glow ? HALO_PAD : 0
    ctx.globalAlpha = a
    ctx.drawImage(img, sp.x - f[4] - pad, sp.y - f[5] - pad)
  }
  ctx.restore()
}
