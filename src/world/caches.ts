import type { State, TilePt, Zone } from '../core/types.ts'
import { depthOf, zoneOfDepth } from '../core/score.ts'
import { TILE } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { bfs4 } from './bfs.ts'
import { buildFlow } from './flowfield.ts'
import type { FlowField } from './flowfield.ts'
import { beaconRoomMask } from './gen/places.ts'

type Entry<T> = { key: string; v: T }
let solidE: Entry<Uint8Array> | null = null
let pendE: Entry<Uint8Array> | null = null
let emptyE: Entry<Uint8Array> | null = null
let depthE: Entry<Int32Array> | null = null
let exitE: Entry<Int32Array> | null = null
let zoneE: Entry<Uint8Array> | null = null
let beaconE: Entry<Uint8Array> | null = null
let exitBufs: [Int32Array, Int32Array] | null = null
let exitFlip = 0
let flowE: Entry<FlowField | null> | null = null
let flowBufs: [Int16Array, Int16Array] | null = null
let flowFlip = 0
let work = new Uint8Array(0)

const baseKey = (s: State): string => s.meta.runId + ':' + s.world.tilesHash + ':' + s.world.w + 'x' + s.world.h

function tileIndex(s: State, p: TilePt): number {
  return Number.isInteger(p.tx) && Number.isInteger(p.ty) && p.tx >= 0 && p.ty >= 0
    && p.tx < s.world.w && p.ty < s.world.h ? p.ty * s.world.w + p.tx : -1
}

function baseBlocked(s: State): (i: number) => boolean {
  const { tiles, w, h } = s.world, valid = tiles.length === w * h
  return (i) => !valid || tiles.charCodeAt(i) === 35
}

function blockedGrid(s: State, blocked: (i: number) => boolean): Uint8Array {
  const n = s.world.w * s.world.h
  if (work.length !== n) work = new Uint8Array(n)
  for (let i = 0; i < n; i++) work[i] = blocked(i) ? 1 : 0
  return work
}

function bfsField(s: State, start: number, blocked: (i: number) => boolean, out?: Int32Array): Int32Array {
  const g = blockedGrid(s, blocked), target = out ?? new Int32Array(g.length)
  // bfs4 seeds its source explicitly. Fields must instead leave a blocked source unreachable.
  if (start < 0 || start >= g.length || g[start]) return target.fill(-1)
  return bfs4(g, s.world.w, s.world.h, start, target)
}

export function getSolid(s: State): Uint8Array {
  const w = s.world
  const key = s.meta.runId + ':' + w.tilesHash + ':' + w.w + 'x' + w.h + ':' + w.solidSig
  if (solidE?.key === key) return solidE.v
  const n = w.w * w.h, g = new Uint8Array(n)
  if (w.tiles.length !== n) g.fill(1)
  else for (let i = 0; i < n; i++) g[i] = w.tiles.charCodeAt(i) === 35 ? 1 : 0
  for (const r of s.rocks) if (r.landed) for (const i of r.tiles) g[i] = 1
  solidE = { key, v: g }
  return g
}

export function getPendingMask(s: State): Uint8Array {
  const key = baseKey(s) + ':' + s.world.pendingSig
  if (pendE?.key === key) return pendE.v
  const g = new Uint8Array(s.world.w * s.world.h)
  for (const r of s.rocks) if (!r.landed) for (const i of r.tiles) g[i] = 1
  pendE = { key, v: g }
  return g
}

export function getEmptyMask(s: State): Uint8Array {
  const n = s.world.w * s.world.h, key = String(n)
  if (emptyE?.key === key) return emptyE.v
  const v = new Uint8Array(n)
  emptyE = { key, v }
  return v
}

export function getDepthField(s: State): Int32Array {
  const key = baseKey(s)
  if (depthE?.key === key) return depthE.v
  const v = bfsField(s, tileIndex(s, s.world.entrance), baseBlocked(s))
  depthE = { key, v }
  return v
}

export function getExitDist(s: State): Int32Array {
  const key = baseKey(s) + ':' + s.world.exit.tx + ',' + s.world.exit.ty + ':' + s.world.solidSig + ':' + s.world.pendingSig
  if (exitE?.key === key) return exitE.v
  const solid = getSolid(s), pending = getPendingMask(s), n = solid.length
  if (!exitBufs || exitBufs[0].length !== n) { exitBufs = [new Int32Array(n), new Int32Array(n)]; exitFlip = 0 }
  // ponytail: two ping-pong buffers, not a pool; callers must not retain a field across steps.
  const v = bfsField(s, tileIndex(s, s.world.exit), (i) => solid[i] === 1 || pending[i] === 1, exitBufs[exitFlip])
  exitFlip = 1 - exitFlip
  exitE = { key, v }
  return v
}

// Windowed flow field rooted at the player tile (issue #113 F4). Key has solidSig, not pendingSig, like getSolid.
export function getFlowField(s: State): FlowField | null {
  const { w, h } = s.world, win = T.ai.flowWindow
  const ptx = Math.floor(s.player.x / TILE), pty = Math.floor(s.player.y / TILE)
  const key = baseKey(s) + ':' + s.world.solidSig + ':' + ptx + ',' + pty + ':' + win
  if (flowE?.key === key) return flowE.v
  const solid = getSolid(s), inMap = ptx >= 0 && pty >= 0 && ptx < w && pty < h
  if (!inMap || solid[pty * w + ptx] === 1) { flowE = { key, v: null }; return null }
  const n = (2 * win + 1) * (2 * win + 1)
  if (!flowBufs || flowBufs[0].length !== n) { flowBufs = [new Int16Array(n), new Int16Array(n)]; flowFlip = 0 }
  // ponytail: two ping-pong buffers, not a pool; a reader may hold the previous field for one rebuild only.
  const dist = flowBufs[flowFlip]
  buildFlow(solid, w, h, ptx, pty, win, dist)
  flowFlip = 1 - flowFlip
  flowE = { key, v: { dist, ptx, pty, win } }
  return flowE.v
}

export function getZoneField(s: State): Uint8Array {
  const key = baseKey(s)
  if (zoneE?.key === key) return zoneE.v
  const d = getDepthField(s), v = new Uint8Array(d.length)
  for (let i = 0; i < v.length; i++) v[i] = zoneOfDepth(depthOf(d[i], s.world.beaconDist))
  zoneE = { key, v }
  return v
}

export function getBeaconRoom(s: State): Uint8Array {
  const key = baseKey(s)
  if (beaconE?.key === key) return beaconE.v
  const d = getDepthField(s), g = blockedGrid(s, baseBlocked(s)), v = new Uint8Array(g.length)
  const beacon = tileIndex(s, s.world.beacon)
  if (beacon >= 0) for (const i of beaconRoomMask(g, s.world.w, beacon, d, s.world.beaconDist)) v[i] = 1
  beaconE = { key, v }
  return v
}

export const zoneAt = (s: State, i: number): Zone => getZoneField(s)[i] as Zone
export const isBeaconRoom = (s: State, i: number): boolean => getBeaconRoom(s)[i] === 1
export const pathDistAt = (s: State, i: number): number => getDepthField(s)[i]
export const exitDistAt = (s: State, i: number): number => getExitDist(s)[i]

// Tests and HMR can discard every derived entry; normal writers bump the signatures.
export function clearCaches(): void {
  solidE = pendE = emptyE = zoneE = beaconE = null
  depthE = exitE = null
  exitBufs = null
  exitFlip = 0
  flowE = null
  flowBufs = null
  flowFlip = 0
  work = new Uint8Array(0)
}
