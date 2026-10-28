// L4 render: additive pulse of the glowing vines (cave overhaul A7, design-render §4). Reads vineSites(s, v) (world px x, y, phase
// triples) and draws a cold green halo plus a bright core per site with drawGlowSprite. Pure: no State writes, no rand, no wall clock;
// the pulse runs on s.meta.time, so a paused game freezes it. Wired after drawOreEmission in index.ts (chunk I1), world transform set.
import type { State } from '../core/types.ts'
import { drawGlowSprite } from './glow.ts'
import type { Quality } from './quality.ts'
import type { View } from './view.ts'
import { vineSites } from './vine-sites.ts'

const VINE = '#6dffc4', CORE = '#d8fff0' // cold bioluminescent green-cyan, near-white core
const HALO_R = 20, CORE_R = 5 // world px
const CAP = 48 // nearest sites to the player that get drawn
const BASE = 0.16, AMP = 0.10, RATE = 0.3 // alpha = BASE + AMP * sin(2 pi (RATE * t + phase))

// Scratch for the partial selection (ascending distance, first CAP). Overwritten every call, never read across frames: no state.
const bestD = new Float64Array(CAP), bestI = new Int32Array(CAP)

// Indices (into sites, step 3) of the up to CAP in-view sites nearest to (px, py); returns the count. Insertion into a fixed sorted
// window: O(n * CAP) worst case, no allocation, ties keep site order so equal inputs draw identically.
// ponytail: n is a few hundred visible sites at most; swap for a quickselect only if a profile shows this loop.
function nearest(sites: readonly number[], v: View, px: number, py: number): number {
  let n = 0
  for (let i = 0; i < sites.length; i += 3) {
    const x = sites[i], y = sites[i + 1]
    if (x + HALO_R < v.x0 || x - HALO_R > v.x1 || y + HALO_R < v.y0 || y - HALO_R > v.y1) continue
    const d = (x - px) * (x - px) + (y - py) * (y - py)
    if (n === CAP && d >= bestD[CAP - 1]) continue
    let j = n < CAP ? n++ : CAP - 1
    while (j > 0 && bestD[j - 1] > d) { bestD[j] = bestD[j - 1]; bestI[j] = bestI[j - 1]; j-- }
    bestD[j] = d; bestI[j] = i
  }
  return n
}

export function drawVineGlow(ctx: CanvasRenderingContext2D, s: State, v: View, q: Quality): void {
  const sites = vineSites(s, v)
  if (sites.length === 0) return
  const n = nearest(sites, v, s.player.x, s.player.y)
  if (n === 0) return
  const t = s.meta.time
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let k = 0; k < n; k++) {
    const i = bestI[k], x = sites[i], y = sites[i + 1]
    const a = BASE + AMP * Math.sin(2 * Math.PI * (RATE * t + sites[i + 2]))
    if (q.glow) drawGlowSprite(ctx, VINE, x, y, HALO_R, a)
    drawGlowSprite(ctx, CORE, x, y, CORE_R, 0.5 * a)
  }
  ctx.restore()
}
