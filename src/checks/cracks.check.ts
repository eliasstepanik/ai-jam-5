// Issue #85: crack decor (src/render/cracks.ts) and floor variety. Real generated caves through startRun; no canvas (the draw callback of
// groundCracks / wallCrackAt records), no node: imports. Runs the PRODUCTION placement code (cleanCells, groundCracks, wallCrackAt).
// Asserts determinism and order independence, density bands, wall/floor consistency, clean entrance / Beacon room / vein walls, the
// all-floor footprint of large cracks, chunk-margin consistency and tileset frame names/sizes.
// ponytail: the call sites in tiles-paint.ts (paintFloor -> groundCracks, paintWalls -> wallCrackAt) are not covered: tiles-paint.ts pulls
// in the DOM resource store and a JSON import node cannot load without an attribute, so no check can import it (R-043, browser-verified).
import tilesetJson from '../assets/cave_tileset.json' with { type: 'json' }
import type { State } from '../core/types.ts'
import { MAP_H, MAP_W, init } from '../core/state.ts'
import { floorVariant } from '../core/grid.ts'
import { startRun } from '../systems/run.ts'
import { getBeaconRoom } from '../world/caches.ts'
import { caveOf } from './caves.ts'
import { CHUNK_TILES } from '../render/keys.ts'
import { depth01Field } from '../render/depth-tone.ts'
import { ALL_CRACK_FRAMES, GROUND_LARGE, GROUND_P, GROUND_SMALL, LARGE_RX, LARGE_RY, WALL_CRACKS, WALL_P, cleanCells, groundCrack, groundCracks, wallCrack, wallCrackAt } from '../render/cracks.ts'

function ok(cond: boolean, msg: string): void { if (!cond) throw new Error('cracks check: ' + msg) }

type Fr = { frame: { w: number; h: number }; anchor: number[]; category: string }
const FRAMES = (tilesetJson as unknown as { frames: Record<string, Fr> }).frames
const SEEDS = [7, 42, 1234]
const NONE = (): boolean => false

function runOf(seed: number): State {
  const s = init()
  startRun(s, String(seed), caveOf(seed))
  return s
}

// Absolute draws "name@x,y" (world px) of every chunk, keyed by chunk index; wall cracks use anchor (tx, ty) as the position.
function chunkDraws(s: State): Map<number, Set<string>> {
  const m = new Map<number, Set<string>>(), cw = Math.ceil(s.world.w / CHUNK_TILES), ch = Math.ceil(s.world.h / CHUNK_TILES)
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const set = new Set<string>(), ox = cx * CHUNK_TILES * 32, oy = cy * CHUNK_TILES * 32
    groundCracks(s, cx, cy, ox, oy, (name, x, y) => set.add(`${name}@${x + ox},${y + oy}`))
    m.set(cy * cw + cx, set)
  }
  return m
}

// Exclusions: for each class of special cell, some raw (no skip) crack exists over many hash seeds, and none survives cleanCells.
function exclusions(s: State, label: string): void {
  const { w, h, tiles, entrance } = s.world, room = getBeaconRoom(s), skip = cleanCells(s)
  const ei = entrance.ty * w + entrance.tx, roomCells: number[] = [], veinWalls = s.veins.filter(v => v.stand === v.tile + w).map(v => v.tile)
  for (let i = 0; i < room.length; i++) if (room[i] === 1) roomCells.push(i)
  ok(roomCells.length > 0 && veinWalls.length > 0, `${label}: fixture has Beacon room cells (${roomCells.length}) and south vein walls (${veinWalls.length})`)
  ok(skip(ei) && roomCells.every(i => skip(i)) && s.veins.every(v => skip(v.tile)), `${label}: cleanCells marks entrance, Beacon room and veins`)
  ok(!skip(ei + 1 + w) || room[ei + 1 + w] === 1, `${label}: cleanCells leaves an ordinary neighbour of the entrance alone`)
  let rawE = 0, rawR = 0, rawV = 0
  for (let k = 1; k <= 300; k++) {
    const at = (i: number, sk: (i: number) => boolean): string | null => groundCrack(tiles, w, h, i % w, Math.floor(i / w), k, sk)
    if (at(ei, NONE) !== null) { rawE++; ok(at(ei, skip) === null, `${label}: hash seed ${k}: crack on the entrance`) }
    for (const i of roomCells) if (at(i, NONE) !== null) { rawR++; ok(at(i, skip) === null, `${label}: hash seed ${k}: crack on Beacon room cell ${i}`) }
    for (const i of veinWalls) if (wallCrack(tiles, w, h, i % w, Math.floor(i / w), k, NONE) !== null) {
      rawV++; ok(wallCrack(tiles, w, h, i % w, Math.floor(i / w), k, skip) === null, `${label}: hash seed ${k}: wall crack on vein wall ${i}`)
    }
  }
  ok(rawE > 0 && rawR > 0 && rawV > 0, `${label}: unskipped cracks do occur on special cells (entrance ${rawE}, room ${rawR}, vein ${rawV}), so the exclusion is exercised`)
  // a large crack anywhere near a special cell is dropped as a whole: no large anchor within the footprint of one
  for (const i of [ei, ...roomCells]) {
    const tx = i % w, ty = Math.floor(i / w)
    for (let y = ty - LARGE_RY; y <= ty + LARGE_RY; y++) for (let x = tx - LARGE_RX; x <= tx + LARGE_RX; x++) {
      const n = groundCrack(tiles, w, h, x, y, s.meta.seed, skip)
      ok(n === null || !GROUND_LARGE.includes(n), `${label}: large crack at ${x},${y} reaches special cell ${tx},${ty}`)
    }
  }
}

// The chunk-level calls scale their chance by crackMul(depth01); the single-anchor reference uses the default chance, which equals crackMul = 1,
// i.e. depth01 0.5. Pin the (cached, derived) depth field to 0.5 for the comparison and restore it afterwards.
function margins(s: State, label: string): void {
  const f = depth01Field(s), saved = f.slice()
  f.fill(0.5)
  try { marginsAt(s, label) } finally { f.set(saved) }
}

// Chunk margin: the same cell decision is seen from every chunk the frame touches, and every anchor is drawn by its own chunk.
function marginsAt(s: State, label: string): void {
  const { w, h, tiles } = s.world, skip = cleanCells(s), cw = Math.ceil(w / CHUNK_TILES), draws = chunkDraws(s)
  let all = 0, crossing = 0
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const name = groundCrack(tiles, w, h, tx, ty, s.meta.seed, skip)
    if (!name) continue
    all++
    const key = `${name}@${tx * 32 + 16},${ty * 32 + 16}`, f = FRAMES[name]
    const x0 = tx * 32 + 16 - f.anchor[0], y0 = ty * 32 + 16 - f.anchor[1] // frame rect in world px
    const cx0 = Math.max(0, Math.floor(x0 / 256)), cx1 = Math.min(cw - 1, Math.floor((x0 + f.frame.w - 1) / 256))
    const cy0 = Math.max(0, Math.floor(y0 / 256)), cy1 = Math.min(Math.ceil(h / CHUNK_TILES) - 1, Math.floor((y0 + f.frame.h - 1) / 256))
    if (cx1 > cx0 || cy1 > cy0) crossing++
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      ok(draws.get(cy * cw + cx)?.has(key) === true, `${label}: chunk ${cx},${cy} misses ${key} that overlaps it`)
    }
  }
  ok(all > 0 && crossing > 0, `${label}: fixture has cracks (${all}) and chunk-crossing ones (${crossing})`)
  let drawn = 0
  for (const set of draws.values()) drawn += set.size
  ok(drawn > all, `${label}: chunks draw overlapping cracks more than once (${drawn} draws vs ${all} cracks)`)
  // nothing is drawn that the per-tile function does not say: no stray anchors from the margin loop
  for (const set of draws.values()) for (const key of set) {
    const m = /^(.+)@(\d+),(\d+)$/.exec(key)
    ok(m !== null && groundCrack(tiles, w, h, (+m[2] - 16) / 32, (+m[3] - 16) / 32, s.meta.seed, skip) === m[1], `${label}: stray draw ${key}`)
  }
  // wall crack callback: anchor passes through unchanged, same frame as wallCrack
  let walls = 0
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const rec: string[] = []
    wallCrackAt(s, skip, tx, ty, 5 + tx, 7 + ty, (n, x, y) => rec.push(`${n}@${x},${y}`))
    const want = wallCrack(tiles, w, h, tx, ty, s.meta.seed, skip)
    ok(want === null ? rec.length === 0 : rec.length === 1 && rec[0] === `${want}@${5 + tx},${7 + ty}`, `${label}: wallCrackAt ${tx},${ty} draws ${rec.join()} want ${want}`)
    if (want) walls++
  }
  ok(walls > 0, `${label}: wall cracks are drawn (${walls})`)
}

export function run(): void {
  // frames exist with the expected category and a centred anchor that fits the footprint the paint code reserves
  for (const n of ALL_CRACK_FRAMES) ok(n in FRAMES, `tileset has frame ${n}`)
  for (const n of [...GROUND_SMALL, ...GROUND_LARGE]) ok(FRAMES[n].category === 'overlay_ground', `${n} is overlay_ground`)
  for (const n of WALL_CRACKS) ok(FRAMES[n].category === 'overlay_wall' && FRAMES[n].frame.w === 32 && FRAMES[n].anchor[1] === 48, `${n} is a 32 px wall frame, anchor y 48`)
  for (const n of GROUND_SMALL) ok(FRAMES[n].frame.w === 32 && FRAMES[n].frame.h === 32, `${n} fits one tile`)
  for (const n of GROUND_LARGE) {
    const f = FRAMES[n]
    ok(f.anchor[0] * 2 === f.frame.w && f.anchor[1] * 2 === f.frame.h, `${n} anchor is the frame centre`)
    ok(f.frame.w <= 2 * (LARGE_RX * 32 + 16) && f.frame.h <= 2 * (LARGE_RY * 32 + 16), `${n} fits the ${2 * LARGE_RX + 1}x${2 * LARGE_RY + 1} tile footprint`)
  }

  const used = new Set<string>()
  for (const seed of SEEDS) {
    const s = runOf(seed), { tiles } = s.world, w = MAP_W, h = MAP_H
    ok(tiles.length === w * h && s.world.w === w && s.world.h === h, `seed ${seed}: tiles length`)
    const room = getBeaconRoom(s), ei = s.world.entrance.ty * w + s.world.entrance.tx
    const skip = cleanCells(s)
    exclusions(s, `seed ${seed}`)
    margins(s, `seed ${seed}`)
    const g: (string | null)[] = [], wl: (string | null)[] = []
    let floor = 0, groundN = 0, large = 0, faces = 0, wallN = 0
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const i = ty * w + tx, isWall = tiles.charCodeAt(i) === 35
        const gc = groundCrack(tiles, w, h, tx, ty, seed, skip), wc = wallCrack(tiles, w, h, tx, ty, seed, skip)
        g.push(gc); wl.push(wc)
        if (!isWall) floor++
        if (isWall && ty + 1 < h && tiles.charCodeAt(i + w) !== 35 && !skip(i) && !skip(i + w)) faces++
        if (gc) {
          groundN++; used.add(gc)
          ok(!isWall, `seed ${seed}: ground crack on a wall tile ${tx},${ty}`)
          if (GROUND_LARGE.includes(gc)) {
            large++
            for (let y = ty - LARGE_RY; y <= ty + LARGE_RY; y++) for (let x = tx - LARGE_RX; x <= tx + LARGE_RX; x++) {
              ok(x >= 0 && y >= 0 && x < w && y < h && tiles.charCodeAt(y * w + x) !== 35, `seed ${seed}: large crack at ${tx},${ty} covers a wall`)
              ok(!skip(y * w + x), `seed ${seed}: large crack at ${tx},${ty} covers a special cell`)
            }
          } else ok(!skip(i), `seed ${seed}: crack on a special cell ${tx},${ty}`)
        }
        if (wc) {
          wallN++; used.add(wc)
          ok(isWall && ty + 1 < h && tiles.charCodeAt(i + w) !== 35, `seed ${seed}: wall crack without a visible face at ${tx},${ty}`)
          ok(!skip(i) && !skip(i + w), `seed ${seed}: wall crack at a special cell ${tx},${ty}`)
        }
        ok(!(gc && wc), `seed ${seed}: wall and ground crack on one tile`)
      }
    }
    // density: GROUND_P is the anchor share; large frames dropped near walls can only lower it, never raise it
    const gd = groundN / floor, wd = wallN / faces
    ok(gd >= 0.04 && gd <= GROUND_P, `seed ${seed}: ground crack density ${gd.toFixed(4)} in 4%..GROUND_P`)
    ok(GROUND_P <= 0.06 && Math.abs(gd - GROUND_P) < 0.01, `seed ${seed}: ground density ${gd.toFixed(4)} near GROUND_P ${GROUND_P}`)
    ok(wd >= 0.05 && wd <= 0.11 && Math.abs(wd - WALL_P) < 0.02, `seed ${seed}: wall crack density ${wd.toFixed(4)} in 5..11% and near WALL_P ${WALL_P}`)
    ok(large > 0 && large < groundN, `seed ${seed}: both small and large ground cracks occur (${large}/${groundN})`)
    // determinism and order independence: recompute in reverse, identical
    for (let k = w * h - 1; k >= 0; k -= 13) {
      const tx = k % w, ty = (k - tx) / w
      ok(groundCrack(tiles, w, h, tx, ty, seed, skip) === g[k] && wallCrack(tiles, w, h, tx, ty, seed, skip) === wl[k], `seed ${seed}: crack at ${tx},${ty} is deterministic`)
    }
    // seed dependence: another seed over the same tiles draws a different layout
    let moved = 0
    for (let k = 0; k < w * h; k++) if ((groundCrack(tiles, w, h, k % w, Math.floor(k / w), seed + 1, skip) === null) !== (g[k] === null)) moved++
    ok(moved > groundN, `seed ${seed}: crack positions depend on the seed (${moved} of ${groundN} moved)`)
    // special cells: entrance, Beacon room and vein walls carry no crack of their own
    ok(g[ei] === null && wl[ei] === null, `seed ${seed}: entrance is clean`)
    for (let i = 0; i < room.length; i++) if (room[i] === 1) ok(g[i] === null && wl[i] === null, `seed ${seed}: Beacon room tile ${i} is clean`)
    for (const v of s.veins) ok(g[v.tile] === null && wl[v.tile] === null, `seed ${seed}: vein wall ${v.tile} is clean`)

    // floor variety (issue #85): over this cave's floor cells (24 px cells covering the map) all 10 variants occur at about 10% each
    const cnt = new Array<number>(10).fill(0)
    let cells = 0
    for (let fy = 0; fy < (h * 32) / 24; fy++) for (let fx = 0; fx < (w * 32) / 24; fx++) {
      const tx = Math.floor((fx * 24 + 12) / 32), ty = Math.floor((fy * 24 + 12) / 32)
      if (tiles.charCodeAt(ty * w + tx) === 35) continue
      cnt[floorVariant(fx, fy, seed)]++; cells++
    }
    for (let v = 0; v < 10; v++) ok(cnt[v] / cells > 0.085 && cnt[v] / cells < 0.115, `seed ${seed}: floor variant ${v} share ${(cnt[v] / cells).toFixed(4)} in 8.5..11.5%`)
  }
  for (const n of ALL_CRACK_FRAMES) ok(used.has(n), `crack frame ${n} is drawn on at least one of the checked caves`)
  console.log('cracks check ok')
}
