// Cave overhaul G6: sculpt() on synthetic grids (1 = wall, 0 = floor). The generator wiring and zero-stream-draw proof on real caves is G7.
// Pins: purity and determinism, one connected component (r3), the exclusion zones, the cavern no-shortcut rule, the caps, the pillar
// 5x5 rule with spacing >= 3, and that an alcove which cannot be completed leaves the grid byte-for-byte unchanged.
import { EXCL_PAD, MARGIN, CAVERN_MAX, PILLAR_MAX, ALCOVE_MAX, carveAlcove, sculpt } from '../world/gen/sculpt.ts'

const ok = (c: boolean, why: string): void => { if (!c) throw new Error('cave sculpt: ' + why) }

const W = 160, H = 80
const at = (x: number, y: number): number => y * W + x
const rect = (g: Uint8Array, x0: number, y0: number, x1: number, y1: number): void => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[at(x, y)] = 0
}
const blank = (): Uint8Array => new Uint8Array(W * H).fill(1)

// 1-wide corridor, a big room (pillars, alcoves on its flat walls), then a 1-wide corridor again. ponytail: the design's no-shortcut
// spread rule (<= 2r+2) only passes where the floor is a line, so caverns can only land in the 1-wide corridors; the room feeds pillars/alcoves.
function hall(): Uint8Array {
  const g = blank()
  rect(g, 4, 40, 150, 40)
  rect(g, 80, 22, 119, 58)
  return g
}
// U shape: 1-wide upper leg out, connector, 1-wide lower leg back; the legs are 6 rows apart but ~300 steps apart by path.
function ushape(): Uint8Array {
  const g = blank()
  rect(g, 5, 38, 150, 38)
  rect(g, 150, 38, 150, 44)
  rect(g, 5, 44, 150, 44)
  return g
}

// independent brute-force helpers
function dist(g: Uint8Array, src: number): Int32Array {
  const d = new Int32Array(W * H).fill(-1), q = [src]
  d[src] = 0
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W
    for (const j of [x + 1 < W ? i + 1 : -1, i + W < W * H ? i + W : -1, x > 0 ? i - 1 : -1, i >= W ? i - W : -1]) {
      if (j >= 0 && !g[j] && d[j] < 0) { d[j] = d[i] + 1; q.push(j) }
    }
  }
  return d
}
const floors = (g: Uint8Array): number => g.reduce((n, v) => n + (v ? 0 : 1), 0)
const reach = (g: Uint8Array, src: number): number => dist(g, src).reduce((n, v) => n + (v >= 0 ? 1 : 0), 0)
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i])
const cheb = (a: number, b: number): number => Math.max(Math.abs((a % W) - (b % W)), Math.abs(Math.floor(a / W) - Math.floor(b / W)))

function exclusions(): void {
  const entrance = at(5, 40)
  for (const mk of [hall, ushape]) {
    const g0 = mk(), e = mk === ushape ? at(5, 38) : entrance, d0 = dist(g0, e)
    const prot: number[] = []
    for (let i = 0; i < d0.length; i++) if (d0[i] >= 0 && d0[i] < 40) prot.push(i)
    for (let salt = 1; salt <= 60; salt++) {
      const g = g0.slice()
      sculpt(g, W, H, e, salt)
      for (let i = 0; i < g.length; i++) {
        if (g[i] === g0[i]) continue
        const x = i % W, y = Math.floor(i / W)
        ok(x >= MARGIN && y >= MARGIN && x < W - MARGIN && y < H - MARGIN, 'changed tile in the map-edge margin')
        ok(!prot.some((p) => cheb(p, i) <= EXCL_PAD), 'changed tile within ' + EXCL_PAD + ' of floor closer than 40 to the entrance')
      }
    }
  }
}

function connectivityAndCaps(): void {
  let caverns = 0, pillars = 0, alcoves = 0, salts = 0
  for (const mk of [hall, ushape]) {
    const g0 = mk(), e = mk === ushape ? at(5, 38) : at(5, 40)
    for (let salt = 1; salt <= 120; salt++) {
      const g = g0.slice(), s = sculpt(g, W, H, e, salt)
      ok(reach(g, e) === floors(g), 'r3: sculpt left more than one floor component (salt ' + salt + ')')
      ok(s.caverns <= CAVERN_MAX && s.pillars <= PILLAR_MAX && s.alcoves <= ALCOVE_MAX, 'cap exceeded')
      caverns += s.caverns; pillars += s.pillars; alcoves += s.alcoves; salts++
      if (mk === hall) ok(floors(g) - floors(g0) + s.pillars >= 0, 'floor count')
    }
  }
  ok(caverns > 0 && pillars > 0 && alcoves > 0, 'sculpt never produced all three features over ' + salts + ' salts')
}

function pillarRule(): void {
  const g0 = hall(), e = at(5, 40)
  let seen = 0
  for (let salt = 1; salt <= 120; salt++) {
    const g = g0.slice(), s = sculpt(g, W, H, e, salt), made: number[] = []
    for (let i = 0; i < g.length; i++) if (g[i] === 1 && g0[i] === 0) made.push(i)
    ok(made.length <= s.pillars, 'more floor-to-wall changes than counted pillars') // a pillar inside a fresh cavern is wall in both grids
    const open = g.slice() // the grid with every pillar turned back into floor: each 5x5 must then be all floor
    for (const p of made) open[p] = 0
    for (const p of made) {
      const x = p % W, y = Math.floor(p / W)
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) ok(open[at(x + dx, y + dy)] === 0, 'pillar without a full 5x5 floor neighbourhood')
    }
    for (let a = 0; a < made.length; a++) for (let b = a + 1; b < made.length; b++) ok(cheb(made[a], made[b]) >= 3, 'pillars closer than 3')
    seen += made.length
  }
  ok(seen > 0, 'no pillar produced')
}

function noShortcut(): void {
  const g0 = ushape(), e = at(5, 38), d0 = dist(g0, e)
  let carved = 0
  for (let salt = 1; salt <= 150; salt++) {
    const g = g0.slice(), s = sculpt(g, W, H, e, salt)
    carved += s.caverns
    const d1 = dist(g, e)
    // the legs (path distance ~150 apart at best) are never joined: distance to the lower leg never shrinks (a pillar may lengthen it)
    for (let x = 5; x <= 150; x++) {
      ok(d1[at(x, 44)] >= d0[at(x, 44)], 'cavern joined the two legs (salt ' + salt + ')')
    }
  }
  ok(carved > 0, 'no cavern carved on the U grid; the no-shortcut test never reached a cavern')
}

function alcoveAbort(): void {
  // Wall above the corridor (y 20..37 rock), mouth m = (30,38) with the way into the rock at dy = -1.
  const mk = (extra: (g: Uint8Array) => void): Uint8Array => {
    const g = blank()
    rect(g, 4, 38, 60, 40)
    extra(g)
    return g
  }
  const prot = new Uint8Array(W * H), m = at(30, 38)
  const clean = mk(() => {})
  const g = clean.slice()
  ok(carveAlcove(g, W, H, m, 0, -1, 6, prot), 'free alcove did not carve')
  ok(floors(g) - floors(clean) === 3 * 6 + 12, 'alcove tile count (3 x 6 tunnel + 12 new radius-2 bulb tiles)')
  ok(reach(g, at(5, 39)) === floors(g), 'alcove is not attached to the corridor')
  // parallel floor within 2 of the tunnel ahead of the mouth: abort without a partial carve
  const near = mk((x) => rect(x, 33, 30, 35, 32))
  const before = near.slice()
  ok(!carveAlcove(near, W, H, m, 0, -1, 6, prot) && same(near, before), 'blocked alcove (floor ahead) changed the grid')
  // protected tile at the very end of the bulb
  const pr = new Uint8Array(W * H)
  pr[at(30, 38 - 6 - 2)] = 1
  const c2 = clean.slice()
  ok(!carveAlcove(c2, W, H, m, 0, -1, 6, pr) && same(c2, clean), 'protected alcove changed the grid')
  // runs off the map edge
  const edge = clean.slice()
  ok(!carveAlcove(edge, W, H, m, 0, -1, 40, prot) && same(edge, clean), 'edge alcove changed the grid')
  // the whole sculpt pass also never leaves a partial alcove: floor change is wall -> floor only, in whole-feature units (r3 covers shape)
  for (let salt = 1; salt <= 60; salt++) {
    const h = hall(), snapshot = h.slice()
    const s = sculpt(h, W, H, at(5, 40), salt)
    ok(reach(h, at(5, 40)) === floors(h), 'sculpt grid disconnected')
    ok(s.alcoves >= 0 && floors(h) >= floors(snapshot) - s.pillars, 'floor count drop beyond pillars')
  }
}

function deterministic(): void {
  for (const mk of [hall, ushape]) {
    const e = mk === ushape ? at(5, 38) : at(5, 40)
    let differs = false
    for (let salt = 1; salt <= 20; salt++) {
      const a = mk(), b = mk(), sa = sculpt(a, W, H, e, salt), sb = sculpt(b, W, H, e, salt)
      ok(same(a, b) && JSON.stringify(sa) === JSON.stringify(sb), 'twice-equal failed (salt ' + salt + ')')
      const c = mk()
      sculpt(c, W, H, e, salt + 1000)
      if (!same(a, c)) differs = true
    }
    ok(differs, 'salt has no effect')
  }
  // entrance on a wall tile: nothing to anchor on, grid untouched
  const g = hall(), before = g.slice()
  const s = sculpt(g, W, H, at(0, 0), 7)
  ok(same(g, before) && s.caverns + s.pillars + s.alcoves === 0, 'wall entrance changed the grid')
}

export function run(): void {
  exclusions()
  connectivityAndCaps()
  pillarRule()
  noShortcut()
  alcoveAbort()
  deterministic()
}
