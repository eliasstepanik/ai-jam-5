import type { Rnd } from '../../core/rng.ts'
import { carveDisc, carveTunnel } from './carve.ts'
import { PARAMS } from './params.ts'
import type { CaveParams } from './params.ts'

export { MAP_W, MAP_H } from '../../core/state.ts'
export const CELL = 40, MW = 8, MH = 6
export const CELL_INSET = 4, CORR_W = 8, CORR_OFF = 8, CENTRE_JIT = 6
export const ECC_MIN = PARAMS[3].eccMin, ECC_MAX = PARAMS[3].eccMax, ECC_TARGET = 13, TREE_TRIES = 64 // class-3 values; buildMacro reads p
export const MACRO_LOOPS = 2, SPINE_R = 3, CELL_FLOOR_MIN = 150
export const BEACON_DIST_BAND = [PARAMS[3].bdLo, PARAMS[3].bdHi] as const // class-3 band; the per-class band is p.bdLo / p.bdHi

export type MacroLayout = {
  root: number; edges: number[]; loops: [number, number][]
  centre: Int32Array; depth: Int8Array; ecc: number; treeDraws: number; M: Uint8Array
}

export const macroCellOf = (i: number, w: number): number =>
  Math.floor((i % w) / CELL) + Math.floor(Math.floor(i / w) / CELL) * MW

// R-164: classes 1/2 use only the top-left p.cols x p.rows cells of the full MW x MH grid; the map stride (MW) never changes.
export const cellActive = (i: number, p: CaveParams = PARAMS[3]): boolean => i % MW < p.cols && Math.floor(i / MW) < p.rows
export const activeCells = (p: CaveParams = PARAMS[3]): number[] =>
  Array.from({ length: MW * MH }, (_, i) => i).filter((i) => cellActive(i, p))

// R-108 numbering (always the full 8x6 grid): horizontal edges first, then vertical, each in row order.
const edgeCells = (e: number): [number, number] => {
  if (e < 42) { const a = Math.floor(e / 7) * MW + e % 7; return [a, a + 1] }
  const a = e - 42
  return [a, a + MW]
}

// Edge ids with both end cells active, ascending; class 3 is 0..81. Ids keep the full-grid numbering, so edgeCells and the id decoders
// in loops.ts stay valid for every class.
export const activeEdges = (p: CaveParams = PARAMS[3]): number[] =>
  Array.from({ length: 82 }, (_, e) => e).filter((e) => { const [a, b] = edgeCells(e); return cellActive(a, p) && cellActive(b, p) })

function graphDist(edges: readonly number[], source: number): Int8Array {
  const adj: number[][] = Array.from({ length: MW * MH }, () => [])
  for (const e of edges) { const [a, b] = edgeCells(e); adj[a].push(b); adj[b].push(a) }
  const d = new Int8Array(MW * MH).fill(-1), q = [source]
  d[source] = 0
  for (let head = 0; head < q.length; head++) for (const j of adj[q[head]]) {
    if (d[j] >= 0) continue
    d[j] = d[q[head]] + 1
    q.push(j)
  }
  return d
}

function treeLoops(tree: number[], depth: Int8Array, root: number, p: CaveParams): number[] {
  const candidates: { e: number; d: number }[] = []
  for (const e of activeEdges(p)) {
    if (tree.includes(e)) continue
    const [a, b] = edgeCells(e)
    if (depth[a] < 3 || depth[b] < 3) continue
    const d = graphDist(tree, a)[b]
    if (d >= 3) candidates.push({ e, d })
  }
  candidates.sort((a, b) => b.d - a.d || a.e - b.e)
  const loops: number[] = []
  for (const { e } of candidates) {
    if (Math.max(...graphDist([...tree, ...loops, e], root)) < p.eccMin) continue
    loops.push(e)
    if (loops.length === MACRO_LOOPS) break
  }
  return loops
}

// 8x6 layout for the documented 320x240 map (class 3), or its top-left p.cols x p.rows sub-grid; w/h are work-grid dimensions.
// centre is -1 for inactive cells (no jitter draw, no room, no spine disc); M and depth keep the full-grid stride.
export function buildMacro(rnd: Rnd, w: number, h: number, p: CaveParams = PARAMS[3]): MacroLayout {
  const root = rnd.int(0, p.cols - 1), cells = activeCells(p), pool = activeEdges(p), target = Math.round((p.eccMin + p.eccMax) / 2)
  let best: { tree: number[]; loops: number[]; depth: Int8Array; ecc: number } | null = null
  let treeDraws = 0
  for (; treeDraws < TREE_TRIES;) {
    treeDraws++
    const shuffled = pool.slice()
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rnd.int(0, i), t = shuffled[i]
      shuffled[i] = shuffled[j]; shuffled[j] = t
    }
    const parent = Array.from({ length: MW * MH }, (_, i) => i)
    const find = (a: number): number => {
      while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a] }
      return a
    }
    const tree: number[] = []
    for (const e of shuffled) {
      const [a, b] = edgeCells(e), ra = find(a), rb = find(b)
      if (ra === rb) continue
      parent[ra] = rb
      tree.push(e)
      if (tree.length === cells.length - 1) break
    }
    const depth = graphDist(tree, root), ecc = Math.max(...depth), inWindow = ecc >= p.eccMin && ecc <= p.eccMax
    const loops = inWindow ? treeLoops(tree, depth, root, p) : [], candidate = { tree, loops, depth, ecc }
    if (!best || Math.abs(ecc - target) < Math.abs(best.ecc - target)) best = candidate
    if (inWindow && loops.length === MACRO_LOOPS) { best = candidate; break }
  }
  // The first tree always exists; after 64 misses keep its best-ranked successor.
  const chosen = best!, edges = [...chosen.tree, ...chosen.loops].sort((a, b) => a - b)
  const centre = new Int32Array(MW * MH).fill(-1), M = new Uint8Array(w * h).fill(1)
  for (const c of cells) {
    const cx = c % MW, cy = Math.floor(c / MW)
    const x = cx * CELL + CELL / 2 + rnd.int(-CENTRE_JIT, CENTRE_JIT)
    const y = cy * CELL + CELL / 2 + rnd.int(-CENTRE_JIT, CENTRE_JIT)
    centre[c] = y * w + x
    for (let yy = cy * CELL + CELL_INSET; yy < (cy + 1) * CELL - CELL_INSET; yy++) {
      for (let xx = cx * CELL + CELL_INSET; xx < (cx + 1) * CELL - CELL_INSET; xx++) M[yy * w + xx] = 0
    }
  }
  for (const e of edges) {
    const [a] = edgeCells(e), cx = a % MW, cy = Math.floor(a / MW)
    const off = rnd.int(-CORR_OFF, CORR_OFF)
    const x0 = cx * CELL + (e < 42 ? CELL - CELL_INSET : CELL / 2 + off - CORR_W / 2)
    const y0 = cy * CELL + (e < 42 ? CELL / 2 + off - CORR_W / 2 : CELL - CELL_INSET)
    for (let y = y0; y < y0 + CORR_W; y++) for (let x = x0; x < x0 + CORR_W; x++) M[y * w + x] = 0
  }
  return { root, edges, loops: chosen.loops.map(edgeCells), centre, depth: chosen.depth, ecc: chosen.ecc, treeDraws, M }
}

export function carveSpine(g: Uint8Array, w: number, h: number, L: MacroLayout, rnd: Rnd): number {
  let n = 0
  for (const c of L.centre) if (c >= 0) n += carveDisc(g, w, h, c, SPINE_R)
  for (const e of L.edges.slice().sort((a, b) => a - b)) {
    const [a, b] = edgeCells(e)
    n += carveTunnel(g, w, h, L.centre[a], L.centre[b], rnd)
  }
  return n
}
