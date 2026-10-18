---
type: architecture
title: Last Ember – Economy Reference Simulator (src/checks/economy.check.ts)
description: Binding reference code for src/checks/economy.check.ts – a pure expected-value simulator of the flame economy at the 320x240 scale, using the part 2 constants and the part 3 §1.2 stepped method (front-loaded slots, cap 100, Beacon cluster at bd−20 with 4 E detour each way, start gate 40 E), with assertions pinned to the part 3 §1.2 arrival-energy table.
tags: [project, ai-jam-5, architecture, last-ember, balance]
timestamp: 2026-10-18T11:00:00Z
---

# Last Ember – Economy Reference Simulator

Moved out of [[architecture-scale-and-economy-3]] §6 on 2026-10-18 and rewritten from the binding constants of [[architecture-scale-and-economy-2]] §2–§4. The method is part 3 §1.2 (restating part 2 §4). Base analysis: [[architecture-economy-check]] §0, §3, §8 (the 160×120 sketch there is superseded by this file). Values: [[architecture-tuning]]. Hub: [[architecture]], [[index]]. Spec: [[last-ember-design]].

## 1. Contract

- File `src/checks/economy.check.ts`. Exports `run(): void`; no side effect on import; throws on failure ([[architecture-rulings]] R-040). Wired from `src/checks/all.ts`.
- No `node:` imports (R-039). A local `ok(cond, msg)` throws `Error`.
- Pure: no State, no RNG, no DOM. Means only.
- Literals mirror part 2. When the values land in `tuning.ts`, swap the constants for `T.flame.burnPerS`, `T.resin.smallE/largeE`, `T.beacon.minStartE`, and keep the asserts.

## 2. Model (part 3 §0, §1.2)

- Zone need = `(burn × burnMul + hit × hitMul) × (zoneS + extraS) + 9 E mining + extraE`. Net drain = burn + hit; `hitEps = net − burn` per profile.
- Pickups sit at `(k + 0.5) / n × spread` of the zone: spread 0.6 for near-path resin (mid, expert), 0.8 for all resin (beginner). Drain is linear between slots. Energy clamps at 100.
- Resin strings at D\* 600, `S` = 25 E, `L` = 50 E. Near-path small 3/4/5/4, large 0/0/1/1, L slots Z3 k = 3, Z4 k = 2. Beginner adds off-path small 3/3/2/1, large 0/1/1/1; Z4 L at k = 2, 5. In Z1–Z3 the beginner hits the cap, so L order there does not change the result.
- Cluster (1 L + 2 S = 100 E) at `bd − 20`, which is fraction `1 − 20 / 150 = 0.867` of zone 4. Detour costs 4 E each way. A dark arrival relights at 0.
- Gate: a Beacon press needs ≥ 40 E. The hold costs `4 × 5 + 1.4 × 5 = 27` E, so a passed gate always completes the hold.
- Mods (zone 4 only): greedy `+20 s, +9 E` (1.5 veins, one plant, pocket search; part 3 §1.3); sodium burn ×1.5, hits ×1.6; strontium/copper hits ×0.5.

## 3. Code

```ts
// src/checks/economy.check.ts – expected-value flame economy at 320x240 (part 3 §1.2 stepped method)
type Z4 = [number, number, number, number]
type Profile = { zoneS: number; hitEps: Z4; spread: number; resin: string[] }
type Mod = { extraS: number; extraE: number; burnMul: number; hitMul: number }

// ponytail: means at D* 600 only, literals mirror part 2; read T.flame/T.resin/T.beacon once in tuning.ts,
// add D 510/690 counts (part 2 §3.1) and Monte-Carlo hits when flame-out variance matters
const E_MAX = 100, GATE_E = 40, SMALL_E = 25, LARGE_E = 50, CLUSTER_E = 50 + 2 * 25, DETOUR_E = 4
const BURN: Z4 = [0.5, 0.7, 1.0, 1.4]
const MINE_E = 3 * 2 * 1.5 // 3 E/s × 2 s × 1.5 veins per zone
const HOLD_E = 4 * 5 + BURN[3] * 5 // 27 E
const CLUSTER_AT = 1 - 20 / (600 / 4) // bd − 20 inside the 150-tile zone 4
const NEAR = ['SSS', 'SSSS', 'SSSLSS', 'SSLSS'] // near-path, first 60 % of each zone
const ALL = ['SSSSSS', 'SSSLSSSS', 'SSSLSSLSS', 'SSLSSLS'] // near + off-path (beginner)

export const MID: Profile = { zoneS: 67, hitEps: [0.18, 0.67, 1.0, 1.07], spread: 0.6, resin: NEAR }
export const BEG: Profile = { zoneS: 83, hitEps: [0.27, 1.23, 1.77, 1.89], spread: 0.8, resin: ALL }
export const EXP: Profile = { zoneS: 55, hitEps: [0.09, 0.26, 0.41, 0.44], spread: 0.6, resin: NEAR }
const PLAIN: Mod = { extraS: 0, extraE: 0, burnMul: 1, hitMul: 1 }
const GREEDY: Mod = { ...PLAIN, extraS: 20, extraE: 9 }
const SODIUM: Mod = { ...PLAIN, burnMul: 1.5, hitMul: 1.6 }
const CALM: Mod = { ...PLAIN, hitMul: 0.5 } // strontium / copper

// linear drain, pickups at (k + 0.5) / n × spread, clamp at E_MAX; dip = lowest energy before a pickup
function zone(e: number, need: number, items: string, spread: number) {
  let x = 0, dip = E_MAX
  for (let k = 0; k < items.length; k++) {
    const s = ((k + 0.5) / items.length) * spread
    e -= (s - x) * need
    x = s
    dip = Math.min(dip, e)
    e = Math.min(E_MAX, e + (items[k] === 'L' ? LARGE_E : SMALL_E))
  }
  return { e, x, dip }
}

// borders[i] = energy leaving zone i (1 = depth 20, 3 = Beacon without cluster); negative = dark deficit
export function descend(p: Profile, z4: Mod = PLAIN, cluster = true) {
  const borders: number[] = []
  let e = E_MAX, need = 0, r = { e, x: 0, dip: E_MAX }
  for (let i = 0; i < 4; i++) {
    const m = i === 3 ? z4 : PLAIN
    need = (BURN[i] * m.burnMul + p.hitEps[i] * m.hitMul) * (p.zoneS + m.extraS) + MINE_E + m.extraE
    r = zone(e, need, p.resin[i], p.spread)
    e = r.e - (1 - r.x) * need
    borders.push(e)
  }
  const atCluster = r.e - (CLUSTER_AT - r.x) * need
  const relit = Math.min(E_MAX, Math.max(0, atCluster - DETOUR_E) + CLUSTER_E) - DETOUR_E
  return { borders, dip: r.dip, atCluster, beacon: cluster ? relit - (1 - CLUSTER_AT) * need : e }
}

// farthest out-and-back detour (tiles) that still gains energy (part 3 §1.4)
export const backfillMaxTiles = (gainE: number, drainEps: number, overhead = 1) => (1.875 * gainE) / (overhead * drainEps)

const ok = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(`economy.check: ${msg}`)
}

export function run(): void {
  const mid = descend(MID), beg = descend(BEG), exp = descend(EXP, PLAIN, false), midSkip = descend(MID, PLAIN, false)
  const want: [number, number, string][] = [
    [mid.borders[1], 52.1, 'mid depth 20'], [mid.borders[2], 35.7, 'mid Z3→4'], [mid.dip, 25.2, 'mid Z4 dip'],
    [midSkip.beacon, 11.1, 'mid Beacon, no cluster'], [mid.beacon, 72.8, 'mid Beacon, cluster'],
    [beg.borders[1], 57.7, 'beginner depth 20'], [beg.borders[2], 41.6, 'beginner Z3→4'],
    [beg.dip, 11.1, 'beginner Z4 dip'], [beg.beacon, 58.4, 'beginner Beacon, cluster'],
    [exp.beacon, 49.3, 'expert Beacon, no cluster'], [HOLD_E, 27, 'Beacon hold'],
    [backfillMaxTiles(SMALL_E, BURN[3] + MID.hitEps[3]), 19.0, 'Z4 mid break-even, small'],
  ]
  for (const [got, w, msg] of want) ok(Math.abs(got - w) <= 1, `${msg}: ${got.toFixed(1)} vs ${w}`)
  ok(midSkip.beacon < GATE_E && mid.beacon >= GATE_E, 'gate blocks mid only when the cluster is skipped')
  ok(exp.beacon >= GATE_E && GATE_E > HOLD_E, 'expert passes without the cluster; gate covers the hold')
  ok(descend(BEG, PLAIN, false).beacon < 0, 'beginner skipping the cluster goes dark')
  ok(descend(BEG, CALM, false).beacon >= GATE_E, 'strontium/copper beginner passes without the cluster')
  for (const [name, m] of [['greedy', GREEDY], ['sodium', SODIUM]] as const) {
    ok(descend(MID, m).atCluster < 0, `${name} mid is dark before the cluster`)
    ok(descend(MID, m, false).beacon < GATE_E, `${name} mid without the cluster is gate-blocked`)
  }
}
```

≈ 66 non-blank code lines. Style: no semicolons, single quotes, 2-space indent, no `enum`, no parameter properties, `as const` only on a literal.

## 4. Expected values (hand-checked against part 3 §1.2, §1.3)

| Run | Depth 20 | Z3→4 | Z4 dip | At cluster | Beacon, no cluster | Beacon, cluster |
|---|---|---|---|---|---|---|
| Mid plain | 52.1 | 35.7 | 25.2 | 34.4 | 11.1 (blocked) | 72.7 |
| Mid greedy | 52.1 | 35.7 | 21.7 | −16.0 (dark ≈ 6.5 s) | −47.0 (blocked) | 65.0 (after relight) |
| Mid sodium Z4 | 52.1 | 35.7 | 19.8 | −43.4 (dark ≈ 11 s) | −78.6 (blocked) | 60.7 (after relight) |
| Beginner plain | 57.7 | 41.6 | 11.1 | 22.2 | −15.3 (dark) | 58.4 |
| Beginner strontium Z4 | 57.7 | 41.6 | 30.0 | – | 47.7 (passes) | – |
| Expert plain | 70.6 | 61.0 | 54.4 | – | 49.3 (passes) | skips |

Break-even for a small in Z4 at mid drain 2.47 E/s is 19.0 tiles. Greedy and sodium runs pass the gate only through a flame-out and a relight at the cluster, so the check pins the flame-out (`atCluster < 0`) and the gate block without the cluster. Day 4 logs whether that matches play ([[architecture-scale-and-economy-3]] §5.2, row "Gate in B").

## 5. Limits and open items

- D 510/690 rows of part 3 §1.2 are not asserted. Adding them needs the part 2 §3.1 per-zone counts and the L slot list from part 3 §1.2 (beginner k = 2, 4 at 510; k = 2, 5 at 690). Zone times: mid 57.4/67/76.6 s, beginner 71/83/95 s, expert 47.2/55/62.8 s.
- Zone time follows part 2 (67 s mid). Part 1 states ≈ 77 s with fight stops (part 3 §1.6 item 6). At 77 s the mid cluster arrival drops to ≈ 69.4 E; the asserts stay inside ±1 E only at 67 s.
- Deficits carry between zones in the code. Only zone 4 goes negative for the tested runs, so this does not change the asserts.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-scale-and-economy-3]]
- [[architecture-scale-and-economy-2]]
- [[architecture-economy-check]]
- [[architecture-tuning]]
- [[architecture-rulings]]
