// Fallback ring cave (CG2 §6, CG4 §4, R-163, R-165): FIXED geometry, 0 random draws; the tag 'cave:fallback' only derives the
// populate seed cs. Integer ellipse test and a literal direction table (no Math.hypot/sin/cos), so the ring is bit-identical in
// every JS engine (determinism §4: the cave is cross-browser identical). populate + validateCave run like a normal attempt (CG2 §6 step 6).
import type { CaveCore, CaveResult } from '../../core/types.ts'
import { MAP_H, MAP_W } from '../../core/state.ts'
import { hashSeed } from '../../core/rng.ts'
import { bfs4 } from '../bfs.ts'
import { carveDisc, isEdge } from './carve.ts'
import { ENTRANCE_R, beaconRoomMask } from './places.ts'
import { populate } from './populate.ts'
import { PARAMS } from './params.ts'
import type { CaveParams } from './params.ts'
import { validateCave } from '../validate.ts'

const CX = 160, CY = 120, BAND = 2 // CG4 §4: |q - 1| <= BAND / RY, about 4 tiles wide
const CHORD_Y0 = 119, CHORD_Y1 = 121 // CG4 §4 step 2
const BX = 160, BH = 3 // Beacon chamber 7x7 centred at (160, BY)
const STUB = 3, ROOM = 4 // 2-wide 3-long stubs, 4x4 rooms (CG4 §4 step 4)
const S60 = Math.sqrt(3) / 2 // sqrt is correctly rounded (IEEE 754), unlike sin/cos
const DIRS6: readonly (readonly [number, number])[] = [[1, 0], [0.5, S60], [-0.5, S60], [-1, 0], [-0.5, -S60], [0.5, -S60]] // k * 60 deg
const FALLBACK_ATTEMPT = 8 // R-165: populate(core, cs, 8), so stats.attempts = 9

// Ring geometry per depth class (R-164). rx, ry: outer ellipse radii. Class 3 is the original ring (bd 515, chamber at the bottom, centre
// chord). Classes 1 and 2 are smaller copies of it (bd 231 and 383). Class 4 needs bd 690-860, longer than any single ring on 320x240, so
// it adds an inner ring (irx, iry) joined to the outer one by one bottom link; the Beacon sits at the top of the inner ring and there is
// no chord (it would short-cut into the inner ring). bd = outer half ring + link + inner half ring = 792.
// ponytail: radii are tuned by hand per class (62 check seeds + 1000 more pass); upgrade: derive them from the class band midpoint.
type Geo = { readonly rx: number; readonly ry: number; readonly irx: number; readonly iry: number }
const GEO: Record<number, Geo> = {
  1: { rx: 66, ry: 48, irx: 0, iry: 0 },
  2: { rx: 110, ry: 80, irx: 0, iry: 0 },
  3: { rx: 148, ry: 108, irx: 0, iry: 0 },
  4: { rx: 148, ry: 108, irx: 66, iry: 48 },
}

function rect(t: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!isEdge(x, y, MAP_W, MAP_H)) t[y * MAP_W + x] = 1
}

function band(t: Uint8Array, rx: number, ry: number): void {
  const w = MAP_W, h = MAP_H
  // q = hypot(dx / rx, dy / ry) in [1 - BAND/ry, 1 + BAND/ry]  <=>  rx^2 (ry - BAND)^2 <= dx^2 ry^2 + dy^2 rx^2 <= rx^2 (ry + BAND)^2
  const lo = rx * rx * (ry - BAND) ** 2, hi = rx * rx * (ry + BAND) ** 2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = (x - CX) ** 2 * ry * ry + (y - CY) ** 2 * rx * rx
    if (v >= lo && v <= hi && !isEdge(x, y, w, h)) t[y * w + x] = 1
  }
}

// CaveCore.t encoding (0 '#', 1 '.'); returns the entrance tile index.
function carveRing(t: Uint8Array, geo: Geo): number {
  const w = MAP_W, h = MAP_H, RX = geo.rx, RY = geo.ry, inner = geo.iry > 0
  band(t, RX, RY)
  if (inner) {
    band(t, geo.irx, geo.iry)
    rect(t, CX - 1, CY + geo.iry, CX + 2, CY + RY) // 4-wide link between the two bottoms
  } else {
    let l = CX, r = CX // chord between the inner edges of the left and right ring arms
    while (!t[CY * w + l - 1]) l--
    while (!t[CY * w + r + 1]) r++
    rect(t, l, CHORD_Y0, r, CHORD_Y1)
  }
  for (const [dx, dy] of DIRS6) {
    let ex = CX, ey = CY // outermost ring tile on the ray (ring band only: rooms are carved after their ray is walked)
    for (let s = 0; s <= RX + BAND + 1; s++) {
      const x = Math.round(CX + s * dx), y = Math.round(CY + s * dy)
      if (t[y * w + x]) { ex = x; ey = y }
    }
    // 2x2 stamps one step apart overlap, so the stub stays 4-connected to the band (validation rule 3)
    for (let s = 1; s <= STUB; s++) {
      const x = Math.round(ex + dx * s - 0.5), y = Math.round(ey + dy * s - 0.5)
      rect(t, x, y, x + 1, y + 1)
    }
    const rx = Math.round(ex + dx * (STUB + ROOM / 2) - ROOM / 2), ry = Math.round(ey + dy * (STUB + ROOM / 2) - ROOM / 2)
    rect(t, rx, ry, rx + ROOM - 1, ry + ROOM - 1)
  }
  const by = inner ? CY - geo.iry + 6 : CY + RY - 6 // class 3: 222
  rect(t, BX - BH, by - BH, BX + BH, by + BH)
  // Entrance: topmost ring floor tile in column CX, opened with the placeEntrance disc so all 8 neighbours are floor (rule 4).
  let entrance = CX
  while (!t[entrance]) entrance += w
  const g = t.map((v) => 1 - v)
  carveDisc(g, w, h, entrance, ENTRANCE_R)
  for (let i = 0; i < g.length; i++) t[i] = 1 - g[i]
  return entrance
}

// p: depth class (R-164), default class 3 = the original ring; the ring validates under its own class (band [p.fbLo, p.bdHi]).
export function fallbackCave(seed: number, p: CaveParams = PARAMS[3]): CaveResult {
  const w = MAP_W, h = MAP_H, t = new Uint8Array(w * h), entrance = carveRing(t, GEO[p.depthClass]), g = t.map((v) => 1 - v)
  const dist = bfs4(g, w, h, entrance)
  let beacon = entrance
  for (let i = 0; i < dist.length; i++) if (dist[i] > dist[beacon]) beacon = i // max dist, lowest index on ties (CG2 §6 step 4)
  const beaconDist = dist[beacon], chamber = beaconRoomMask(g, w, beacon, dist, beaconDist), beaconMask = new Uint8Array(w * h)
  for (const i of chamber) beaconMask[i] = 1
  const core: CaveCore = {
    w, h, t, entrance, beacon, dist, beaconDist, beaconMask, chamber,
    stats: {
      attempts: 1, floor: t.reduce((n, v) => n + v, 0), dropped: 0, beaconDist, loops: 2, tunnelTiles: 0, chamberR: BH,
      mainLoop: false, fallback: true, ecc: 0, treeDraws: 0, // populate reads fallback (pocket depth 5, R-163); validate reads it (band 459)
    },
  }
  const res = populate(core, hashSeed(seed >>> 0, 'cave:fallback'), FALLBACK_ATTEMPT)
  const why = res ? validateCave(res, p).why : 'populate null'
  // ponytail: no second fallback exists, so a broken ring fails loudly (0 of 1 262 probed seeds); upgrade: hand-placed items
  if (!res || why) throw new Error('fallbackCave: fixed ring rejected for seed ' + seed + ': ' + why)
  return res
}
