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
import { validateCave } from '../validate.ts'

const CX = 160, CY = 120, RX = 148, RY = 108, BAND = 2 // CG4 §4: |q - 1| <= BAND / RY, about 4 tiles wide
const CHORD_Y0 = 119, CHORD_Y1 = 121 // CG4 §4 step 2
const BX = 160, BY = 222, BH = 3 // Beacon chamber 7x7 centred at (160, 222)
const STUB = 3, ROOM = 4 // 2-wide 3-long stubs, 4x4 rooms (CG4 §4 step 4)
const S60 = Math.sqrt(3) / 2 // sqrt is correctly rounded (IEEE 754), unlike sin/cos
const DIRS6: readonly (readonly [number, number])[] = [[1, 0], [0.5, S60], [-0.5, S60], [-1, 0], [-0.5, -S60], [0.5, -S60]] // k * 60 deg
const FALLBACK_ATTEMPT = 8 // R-165: populate(core, cs, 8), so stats.attempts = 9

function rect(t: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!isEdge(x, y, MAP_W, MAP_H)) t[y * MAP_W + x] = 1
}

// CaveCore.t encoding (0 '#', 1 '.'); returns the entrance tile index.
function carveRing(t: Uint8Array): number {
  const w = MAP_W, h = MAP_H
  // q = hypot(dx / RX, dy / RY) in [1 - BAND/RY, 1 + BAND/RY]  <=>  RX^2 (RY - BAND)^2 <= dx^2 RY^2 + dy^2 RX^2 <= RX^2 (RY + BAND)^2
  const lo = RX * RX * (RY - BAND) ** 2, hi = RX * RX * (RY + BAND) ** 2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = (x - CX) ** 2 * RY * RY + (y - CY) ** 2 * RX * RX
    if (v >= lo && v <= hi && !isEdge(x, y, w, h)) t[y * w + x] = 1
  }
  let l = CX, r = CX // chord between the inner edges of the left and right ring arms
  while (!t[CY * w + l - 1]) l--
  while (!t[CY * w + r + 1]) r++
  rect(t, l, CHORD_Y0, r, CHORD_Y1)
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
  rect(t, BX - BH, BY - BH, BX + BH, BY + BH)
  // Entrance: topmost ring floor tile in column CX, opened with the placeEntrance disc so all 8 neighbours are floor (rule 4).
  let entrance = CX
  while (!t[entrance]) entrance += w
  const g = t.map((v) => 1 - v)
  carveDisc(g, w, h, entrance, ENTRANCE_R)
  for (let i = 0; i < g.length; i++) t[i] = 1 - g[i]
  return entrance
}

export function fallbackCave(seed: number): CaveResult {
  const w = MAP_W, h = MAP_H, t = new Uint8Array(w * h), entrance = carveRing(t), g = t.map((v) => 1 - v)
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
  const why = res ? validateCave(res).why : 'populate null'
  // ponytail: no second fallback exists, so a broken ring fails loudly (0 of 1 262 probed seeds); upgrade: hand-placed items
  if (!res || why) throw new Error('fallbackCave: fixed ring rejected for seed ' + seed + ': ' + why)
  return res
}
