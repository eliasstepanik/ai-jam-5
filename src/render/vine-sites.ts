// L4 render: world positions of the glowing vines for the visible chunks (cave overhaul A6, design-render §4). Pure derived data: no State
// writes, no canvas. It re-runs the exact floor/wall detail pick that render/cave-details.ts draws (same DetailCtx, same eligibility
// rules, same cleanCells skip, class included) and keeps the vine frames, so a drawn vine has a site and a site has a drawn vine.
// Imports stop at core/world/depth-tone via cave-details; nothing here reaches glow.ts, light.ts or index.ts (no cycle for light.ts).
// vineSprites adds the frame name and the exact drawn anchor (same anchors cave-details.ts blits at) for the shape-following glow.
// It must not value-import tileset.ts or assets/images.ts (the node check runner cannot load them, see checks/depth-tone.check.ts:183)
// - only render-only modules may. The torch fade helper both consumers share lives in keys.ts (torchFade), not here: light.ts cannot
// import this module (the check runner reaches light.ts via render/draft.ts, and this module reaches tileset.ts through cave-details).
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { hash2 } from '../core/noise.ts'
import { cleanCells } from './cracks.ts'
import type { Skip } from './cracks.ts'
import { chunkKey, CHUNK_TILES } from './keys.ts'
import { detailCtx, detailsOn, floorDetailAt, wallDetailAt } from './cave-details.ts'
import type { DetailCtx } from './cave-details.ts'
import type { View } from './view.ts'

const SALT = 0x71e5 // phase salt, unique in src/ (hash2(x, y, seed ^ SALT))
const EMPTY: readonly number[] = []
const EMPTY_SPRITES: readonly VineSprite[] = []
const HASH = 35 // '#'
const isVine = (name: string | null): boolean => name !== null && (name.startsWith('ground_vine_') || name.startsWith('wall_vine_'))

// One glowing vine: frame name (tileFrame-able), the world-px anchor exactly where cave-details.ts blits it (floor x*32+16, y*32+24;
// wall x+16, y+56) and the pulse phase. Derived data only; the consumer owns all drawing.
export type VineSprite = { readonly name: string; readonly x: number; readonly y: number; readonly phase: number }

// Derived cache, rebuilt when anything the pick reads changes: DetailCtx identity (tiles, seed, run, depth/wet/guide inputs), the vein
// list (cleanCells skips vein walls; mining splices it and bumps veinGen) and the exit (cleanCells). Not game state: a hot swap just refills.
type ChunkSites = { readonly triples: readonly number[]; readonly sprites: readonly VineSprite[] }
type Epoch = { c: DetailCtx; skip: Skip; nv: number; vg: number; ex: number; ey: number; chunks: Map<number, ChunkSites> }
let epoch: Epoch | null = null
// ponytail: size-1 memo of the last visible range; the camera sits in one chunk range for many frames, so the common call allocates
// nothing. Upgrade to a per-chunk-range LRU only if a profile shows the concat on chunk-boundary frames.
let last: { e: Epoch; cx0: number; cx1: number; cy0: number; cy1: number; out: ChunkSites } | null = null

function epochOf(s: State, c: DetailCtx): Epoch {
  const e = epoch, { exit } = s.world
  if (e && e.c === c && e.nv === s.veins.length && e.vg === s.world.veinGen && e.ex === exit.tx && e.ey === exit.ty) return e
  epoch = { c, skip: cleanCells(s), nv: s.veins.length, vg: s.world.veinGen, ex: exit.tx, ey: exit.ty, chunks: new Map() }
  return epoch
}

// Sites of chunk (cx, cy): flat x, y, phase triples plus the sprite records, from ONE shared pick pass (both views stay in sync by
// construction). Floor tiles follow floorDetails (inner map ring only, three-cell skip); wall tiles follow paintWalls + wallDetails
// (wall with an open floor tile south, four-cell skip, same unguarded tx - 1 / tx + 1 neighbours).
function chunkSites(e: Epoch, cx: number, cy: number): ChunkSites {
  const key = chunkKey(cx, cy), hit = e.chunks.get(key)
  if (hit) return hit
  const { c, skip } = e, { w, h, tiles, seed } = c, triples: number[] = [], sprites: VineSprite[] = []
  const xa = cx * CHUNK_TILES, ya = cy * CHUNK_TILES, xb = Math.min(w, xa + CHUNK_TILES), yb = Math.min(h, ya + CHUNK_TILES)
  for (let y = Math.max(1, ya); y < Math.min(h - 1, yb); y++) for (let x = Math.max(1, xa); x < Math.min(w - 1, xb); x++) {
    const i = y * w + x
    if (skip(i) || skip(i - 1) || skip(i + 1)) continue
    const name = floorDetailAt(c, x, y)
    if (!isVine(name)) continue
    const phase = hash2(x, y, seed ^ SALT)
    triples.push(x * TILE + 16, y * TILE + 16, phase)
    sprites.push({ name: name!, x: x * TILE + 16, y: y * TILE + 24, phase })
  }
  for (let ty = ya; ty < Math.min(h - 1, yb); ty++) for (let tx = xa; tx < xb; tx++) {
    const i = ty * w + tx
    if (tiles.charCodeAt(i) !== HASH || tiles.charCodeAt(i + w) === HASH || skip(i) || skip(i + w) || skip(i - 1) || skip(i + 1)) continue
    const name = wallDetailAt(c, tx, ty)
    if (!isVine(name)) continue
    const phase = hash2(tx, ty, seed ^ SALT)
    triples.push(tx * TILE + 16, (ty + 1) * TILE + 8, phase)
    sprites.push({ name: name!, x: tx * TILE + 16, y: (ty + 1) * TILE + 8, phase })
  }
  const out = { triples, sprites }
  e.chunks.set(key, out)
  return out
}

// Shared range pass: concat both views of the chunks overlapping the view (chunk granular: a few sites just off screen are
// included, the consumer culls). Empty while details are off or the tiles are not loaded. Deterministic whatever the call order.
function rangeOf(s: State, v: View): ChunkSites {
  if (!detailsOn(s) || s.world.tiles.length !== s.world.w * s.world.h) return { triples: EMPTY, sprites: EMPTY_SPRITES }
  const e = epochOf(s, detailCtx(s))
  const cx0 = Math.floor(v.tx0 / CHUNK_TILES), cx1 = Math.floor(v.tx1 / CHUNK_TILES)
  const cy0 = Math.floor(v.ty0 / CHUNK_TILES), cy1 = Math.floor(v.ty1 / CHUNK_TILES)
  const l = last
  if (l && l.e === e && l.cx0 === cx0 && l.cx1 === cx1 && l.cy0 === cy0 && l.cy1 === cy1) return l.out
  const triples: number[] = [], sprites: VineSprite[] = []
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const ch = chunkSites(e, cx, cy)
    for (const n of ch.triples) triples.push(n)
    for (const sp of ch.sprites) sprites.push(sp)
  }
  const out = { triples, sprites }
  last = { e, cx0, cx1, cy0, cy1, out }
  return out
}

// Flat [x, y, phase, ...] triples in world px for the chunks overlapping the view (light.ts / puddles.ts consumer).
export function vineSites(s: State, v: View): readonly number[] {
  return rangeOf(s, v).triples
}

// The same pick as vineSites, per vine: frame name + exact drawn anchor + phase (vine-glow.ts shape pass).
export function vineSprites(s: State, v: View): readonly VineSprite[] {
  return rangeOf(s, v).sprites
}
