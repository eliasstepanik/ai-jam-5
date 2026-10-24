// Issue #119: the 0..40 depth readout is class-blind by spec, so the class name and the Beacon path length (tiles) are shown next to it.
// Pins the pure formatter src/core/depth-label.ts that the HUD, the end screen and the title Best line use. Exports run(); no side effect on import.
import { DEPTH_NAMES, depthName, depthTag } from '../core/depth-label.ts'
import { DEPTH_MAX, depthOf } from '../core/score.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

// Beacon path length in tiles for seed 'abc' per class (issue #119 diagnosis): class 3 is stored as depthClass undefined.
const DIST: [number | undefined, number][] = [[1, 262], [2, 381], [undefined, 560], [4, 768]]

export function run(): void {
  const tag = (c: number | undefined, d: number): string => depthTag(c, d)
  // exact strings for the extremes and the default class
  ok(tag(1, 262) === 'Shallow · 262 tiles', 'class 1 tag is "Shallow · 262 tiles", got ' + tag(1, 262))
  ok(tag(4, 768) === 'Deep · 768 tiles', 'class 4 tag is "Deep · 768 tiles", got ' + tag(4, 768))
  ok(tag(undefined, 560) === 'Standard · 560 tiles', 'class undefined (= 3) tag is "Standard · 560 tiles", got ' + tag(undefined, 560))
  ok(tag(3, 560) === tag(undefined, 560), 'explicit class 3 reads the same as undefined (legacy Standard)')
  ok(tag(2, 381) === 'Short · 381 tiles', 'class 2 tag is "Short · 381 tiles"')
  // every class differs from every other in name AND in distance part, so neither alone hides the class
  const tags = DIST.map(([c, d]) => tag(c, d))
  ok(new Set(tags).size === 4, 'four classes give four distinct tags')
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const [a, b] = [tags[i].split(' · '), tags[j].split(' · ')]
    ok(a[0] !== b[0], `class names differ: ${tags[i]} vs ${tags[j]}`)
    ok(a[1] !== b[1], `distances differ: ${tags[i]} vs ${tags[j]}`)
  }
  // name list and fallback
  ok(DEPTH_NAMES.join(',') === 'Shallow,Short,Standard,Deep', 'DEPTH_NAMES order is class 1..4')
  ok(depthName(1) === 'Shallow' && depthName(4) === 'Deep', 'depthName maps 1 and 4')
  ok(depthName('random') === 'Standard' && depthName(NaN) === 'Standard' && depthName(undefined) === 'Standard', 'non-class values read as Standard')
  ok(depthName(0) === 'Shallow' && depthName(9) === 'Deep', 'out-of-range classes clamp to 1..4')
  // no world yet (beaconDist 0, NaN, negative): name only, no "0 tiles"
  ok(tag(1, 0) === 'Shallow' && tag(4, NaN) === 'Deep' && tag(undefined, -5) === 'Standard', 'unusable beaconDist leaves the name alone')
  // deterministic: same input, same text
  ok(tag(4, 768) === tag(4, 768) && depthTag(1, 262) === depthTag(1, 262), 'formatter is deterministic')
  // the score model is untouched: the Beacon is still depth 40 in every class, so only the tag tells the classes apart
  for (const [, d] of DIST) ok(depthOf(d, d) === DEPTH_MAX && DEPTH_MAX === 40, `depth at the Beacon stays ${DEPTH_MAX} for beaconDist ${d}`)
}
