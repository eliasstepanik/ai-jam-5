// Cave overhaul G6: natural-shape pass (caverns, cover pillars, dead-end alcoves). Pure in (grid, entrance, salt): it writes only `g`
// (1 = wall, 0 = floor), draws nothing from any RNG stream and decides every placement with the stateless core hash2. carveCore calls it
// between the loops and placeBeacon with salt = hashSeed(cs, 'cave:sculpt') (skipped when its `skip` list names 'sculpt').
// Design: KB projects/ai-jam-5/cave-overhaul-design-gen.md section 1. Caverns and alcoves only add floor next to existing floor; a pillar
// removes one tile whose 5x5 neighbourhood is floor, so the single 4-connected component (validate r3) is preserved.
import { hash2 } from '../../core/noise.ts'
import { bfs4 } from '../bfs.ts'

export const EXCL_D0 = 40 // nothing is touched near floor closer than this to the entrance (r4 ring, T1-T4 teach windows, r10 safe start)
export const EXCL_PAD = 2 // Chebyshev padding around those floor tiles, so a changed tile never sits next to a protected one
export const MARGIN = 3 // untouched map-edge band (validate r2 wants an all-wall border)
export const CAVERN_MAX = 8, PILLAR_MAX = 40, ALCOVE_MAX = 10
export const BLOCK = 15 // one cavern candidate per BLOCK x BLOCK block
export const CAVERN_BASE = 0.5
// ponytail: accept = CAVERN_BASE + CAVERN_RATE * depth share. Tuned over the 62 cave.check.ts SEEDS (G7t): BASE 0.5 / RATE 0.3 / BLOCK 15 give ~7.9 caverns per cave
// (min 6), because the no-shortcut rule only passes on near-linear floor, so most candidates are rejected, not carved. The rules stay; raise BASE/RATE or lower BLOCK for more
// (8 = cap), lower them if cave.check.ts:126 (attempt-0 accept >= 50/62) or the 0.92 beaconDist ratio ever fails. BASE 0.5 (design 0.15) / RATE 0.3 (design 0.35) /
// BLOCK 15 (design 20) also differ from the design: with the design values the no-shortcut rule left too few caverns. BLOCK is fixture-sensitive, do not change it.
// ponytail: alcove constants differ from KB cave-overhaul-design-gen section 1 (q 0.25..0.8 kept; rate 0.012, cap 14) in two places, both tuned over the same 62 SEEDS:
// ALCOVE_RATE 0.06 (design 0.012): the design rate was never measured against the real wd == 1 + single-wall-side + abort rules, which reject most candidates; 0.012 gives
// ~2 alcoves, 0.06 gives mean 9.7 (min 7, max 10). ALCOVE_MAX 10 (design 14): the cap, not the rate, bounds sculpt-added floor to <= 2.52 % (14 gave 2.9 %).
// Measured max alcove tip / M0 = 0.819, so the r5 bound 0.8 * M0 + 12 stays well under the A4 0.92 * M0 floor.
export const CAVERN_RATE = 0.3
export const RIM_KEEP = 0.6 // chance an outer-ring cavern tile is carved (organic edge instead of a disc)
export const PILLAR_RATE = 0.004, PILLAR_Q_MIN = 0.35, PILLAR_WD_MIN = 4
export const ALCOVE_RATE = 0.06, ALCOVE_Q_MIN = 0.25, ALCOVE_Q_MAX = 0.8
export const ALCOVE_LEN_MIN = 6, ALCOVE_LEN_SPAN = 5, ALCOVE_BULB_R = 2
// Per-feature offsets added to the caller's salt so the four hash gates are independent streams (no RNG involved).
const K_ACCEPT = 1, K_RIM = 2, K_PILLAR = 3, K_ALCOVE = 4, K_LEN = 5

// alcoveTiles: tile indices (y * w + x, ascending, no duplicates) of every floor tile the alcove pass carved (tunnels and bulbs).
export type SculptStats = { caverns: number; pillars: number; alcoves: number; alcoveTiles: readonly number[] }

// 4-neighbour distance to the nearest wall (wall = 0, floor >= 1); the grid edge is not a wall (the generator border already is).
function wallDist(g: Uint8Array, w: number, h: number): Int32Array {
  const n = w * h, d = new Int32Array(n).fill(-1), q = new Int32Array(n)
  let head = 0, tail = 0
  for (let i = 0; i < n; i++) if (g[i]) { d[i] = 0; q[tail++] = i }
  while (head < tail) {
    const i = q[head++], x = i % w, v = d[i] + 1
    if (x + 1 < w && d[i + 1] < 0) { d[i + 1] = v; q[tail++] = i + 1 }
    if (i + w < n && d[i + w] < 0) { d[i + w] = v; q[tail++] = i + w }
    if (x > 0 && d[i - 1] < 0) { d[i - 1] = v; q[tail++] = i - 1 }
    if (i >= w && d[i - w] < 0) { d[i - w] = v; q[tail++] = i - w }
  }
  return d
}

const inDisc = (dx: number, dy: number, r: number): boolean => dx * dx + dy * dy <= r * r + r // same disc shape as carve.ts carveDisc

// Protected tiles: Chebyshev EXCL_PAD around every reachable floor tile with d0 < EXCL_D0, plus the map-edge margin.
function protect(d0: Int32Array, w: number, h: number): Uint8Array {
  const prot = new Uint8Array(w * h)
  for (let i = 0; i < d0.length; i++) {
    if (d0[i] < 0 || d0[i] >= EXCL_D0) continue
    const x = i % w, y = (i - x) / w
    for (let yy = Math.max(0, y - EXCL_PAD); yy <= Math.min(h - 1, y + EXCL_PAD); yy++) {
      for (let xx = Math.max(0, x - EXCL_PAD); xx <= Math.min(w - 1, x + EXCL_PAD); xx++) prot[yy * w + xx] = 1
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < MARGIN || y < MARGIN || x >= w - MARGIN || y >= h - MARGIN) prot[y * w + x] = 1
  return prot
}

// Caverns: per BLOCK the floor tile with the largest wall distance is the candidate. A cavern is skipped as a whole when any disc tile is
// protected or off-map, or when it would join floor whose entrance distance differs by more than 2r+2 (the no-shortcut rule).
function caverns(g: Uint8Array, w: number, h: number, d0: Int32Array, M0: number, prot: Uint8Array, salt: number, cav: Uint8Array): number {
  const wd = wallDist(g, w, h)
  let made = 0
  for (let by = 0; by < h && made < CAVERN_MAX; by += BLOCK) {
    for (let bx = 0; bx < w && made < CAVERN_MAX; bx += BLOCK) {
      let c = -1
      for (let y = by; y < Math.min(h, by + BLOCK); y++) for (let x = bx; x < Math.min(w, bx + BLOCK); x++) {
        const i = y * w + x
        if (!g[i] && !prot[i] && d0[i] >= EXCL_D0 && (c < 0 || wd[i] > wd[c])) c = i
      }
      if (c < 0) continue
      const cx = c % w, cy = (c - cx) / w, q = Math.min(1, d0[c] / M0)
      if (hash2(cx, cy, salt + K_ACCEPT) >= CAVERN_BASE + CAVERN_RATE * q) continue
      const r = 3 + Math.floor(4 * q)
      let ok = true, lo = d0[c], hi = d0[c]
      for (let dy = -(r + 1); dy <= r + 1 && ok; dy++) for (let dx = -(r + 1); dx <= r + 1; dx++) {
        if (!inDisc(dx, dy, r + 1)) continue
        const x = cx + dx, y = cy + dy
        if (x < 0 || y < 0 || x >= w || y >= h) { if (inDisc(dx, dy, r)) { ok = false; break } else continue }
        const i = y * w + x
        if (inDisc(dx, dy, r) && prot[i]) { ok = false; break }
        if (cav[i]) { ok = false; break } // an earlier cavern tile (d0 = -1 there) would hide its depth from lo/hi: discs never overlap or touch
        if (d0[i] >= 0) { if (d0[i] < lo) lo = d0[i]; if (d0[i] > hi) hi = d0[i] }
      }
      if (!ok || hi - lo > 2 * r + 2) continue
      // inner disc first (always connected to the centre tile), then the jittered rim, each rim tile only if it touches floor
      for (let pass = 0; pass < 2; pass++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (!inDisc(dx, dy, r)) continue
        const x = cx + dx, y = cy + dy, i = y * w + x
        const rim = !inDisc(dx, dy, r - 1)
        if (rim !== (pass === 1)) continue
        if (rim && (hash2(x, y, salt + K_RIM) >= RIM_KEEP || !(g[i - 1] === 0 || g[i + 1] === 0 || g[i - w] === 0 || g[i + w] === 0))) continue
        g[i] = 0
        cav[i] = 1
      }
      made++
    }
  }
  return made
}

// Pillars: single wall tiles inside caverns or deep open rooms. The whole 5x5 around the tile must be floor, which keeps the
// neighbourhood 4-connected and also gives Chebyshev spacing >= 3 between pillars.
function pillars(g: Uint8Array, w: number, h: number, d0: Int32Array, M0: number, prot: Uint8Array, salt: number, cav: Uint8Array): number {
  const wd = wallDist(g, w, h)
  let made = 0
  for (let y = MARGIN; y < h - MARGIN && made < PILLAR_MAX; y++) for (let x = MARGIN; x < w - MARGIN && made < PILLAR_MAX; x++) {
    const i = y * w + x
    if (g[i] || prot[i] || d0[i] < 0) continue
    if (!cav[i] && !(wd[i] >= PILLAR_WD_MIN && d0[i] / M0 >= PILLAR_Q_MIN)) continue
    if (hash2(x, y, salt + K_PILLAR) >= PILLAR_RATE) continue
    let open = true
    for (let dy = -2; dy <= 2 && open; dy++) for (let dx = -2; dx <= 2; dx++) if (g[i + dy * w + dx]) { open = false; break }
    if (!open) continue
    g[i] = 1
    made++
  }
  return made
}

// Alcove: a 3-wide straight tunnel of `len` tiles into the wall behind mouth tile m (direction dx,dy), ending in a radius-2 bulb. All-or-nothing:
// every tile is validated first and `g` is written only when the whole shape fits. Existing floor behind the mouth line is the corridor itself
// and is ignored; any existing floor ahead of it within Chebyshev 2 of a new tile, a protected tile or the map edge aborts.
export function carveAlcove(g: Uint8Array, w: number, h: number, m: number, dx: number, dy: number, len: number, prot: Uint8Array): boolean {
  const mx = m % w, my = (m - mx) / w, px = Math.abs(dy), py = Math.abs(dx), tiles: number[] = []
  for (let k = 1; k <= len; k++) for (let s = -1; s <= 1; s++) {
    const x = mx + k * dx + s * px, y = my + k * dy + s * py
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    tiles.push(y * w + x)
  }
  const bx = mx + len * dx, by = my + len * dy
  for (let oy = -ALCOVE_BULB_R; oy <= ALCOVE_BULB_R; oy++) for (let ox = -ALCOVE_BULB_R; ox <= ALCOVE_BULB_R; ox++) {
    if (!inDisc(ox, oy, ALCOVE_BULB_R)) continue
    const x = bx + ox, y = by + oy
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    tiles.push(y * w + x)
  }
  for (const t of tiles) {
    if (prot[t] || !g[t]) return false
    const tx = t % w, ty = (t - tx) / w
    for (let yy = Math.max(0, ty - 2); yy <= Math.min(h - 1, ty + 2); yy++) for (let xx = Math.max(0, tx - 2); xx <= Math.min(w - 1, tx + 2); xx++) {
      if (!g[yy * w + xx] && (xx - mx) * dx + (yy - my) * dy >= 1) return false
    }
  }
  for (const t of tiles) g[t] = 0
  return true
}

function alcoves(g: Uint8Array, w: number, h: number, d0: Int32Array, M0: number, prot: Uint8Array, salt: number): number {
  const wd = wallDist(g, w, h)
  let made = 0
  for (let y = MARGIN; y < h - MARGIN && made < ALCOVE_MAX; y++) for (let x = MARGIN; x < w - MARGIN && made < ALCOVE_MAX; x++) {
    const i = y * w + x
    if (g[i] || prot[i] || wd[i] !== 1 || d0[i] < 0) continue
    const q = d0[i] / M0
    if (q < ALCOVE_Q_MIN || q > ALCOVE_Q_MAX || hash2(x, y, salt + K_ALCOVE) >= ALCOVE_RATE) continue
    // exactly one wall 4-neighbour: that side is the way into the rock (a corner has no unambiguous perpendicular)
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ax, ay]) => g[i + ay * w + ax])
    if (dirs.length !== 1) continue
    const len = ALCOVE_LEN_MIN + Math.floor(hash2(x, y, salt + K_LEN) * ALCOVE_LEN_SPAN)
    if (carveAlcove(g, w, h, i, dirs[0][0], dirs[0][1], len, prot)) made++
  }
  return made
}

export function sculpt(g: Uint8Array, w: number, h: number, entrance: number, salt: number): SculptStats {
  const stats: SculptStats = { caverns: 0, pillars: 0, alcoves: 0, alcoveTiles: [] }
  const d0 = bfs4(g, w, h, entrance)
  let M0 = 0
  for (let i = 0; i < d0.length; i++) if (d0[i] > M0) M0 = d0[i]
  if (M0 < 1) return stats // entrance is not floor: nothing to anchor the exclusions on
  const prot = protect(d0, w, h), cav = new Uint8Array(w * h)
  stats.caverns = caverns(g, w, h, d0, M0, prot, salt, cav)
  const d1 = bfs4(g, w, h, entrance) // caverns add floor: reachable distances for the depth shares of pillars and alcoves
  stats.pillars = pillars(g, w, h, d1, M0, prot, salt, cav)
  const before = g.slice() // alcoves are the only pass after this point that turns wall into floor, so the diff is exactly their tiles
  stats.alcoves = alcoves(g, w, h, d1, M0, prot, salt)
  const tiles: number[] = []
  for (let i = 0; i < g.length; i++) if (before[i] && !g[i]) tiles.push(i)
  stats.alcoveTiles = tiles
  return stats
}
