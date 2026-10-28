// Cave depth classes (R-164): one measured preset per class, pure data. Class 3 = the pre-class constants, byte-identical.
// Imports nothing, so macro.ts, generate.ts, validate.ts and fallback.ts can all import it without a cycle.

export type DepthClass = 1 | 2 | 3 | 4

export type CaveParams = {
  readonly depthClass: DepthClass
  readonly eccMin: number // macro tree eccentricity window (macro.ts ECC_MIN / ECC_MAX)
  readonly eccMax: number
  readonly bdLo: number // Beacon distance band, inclusive (macro.ts BEACON_DIST_BAND)
  readonly bdHi: number
  readonly fbLo: number // fallback-ring floor of the band: min(floor(0.9 * bdLo), 459) (validate.ts bandOf)
  readonly cols: number // active top-left macro sub-grid (macro.ts MW x MH is the full 8 x 6 grid)
  readonly rows: number
  readonly rampS: number // rocks escape ramp seconds; class 3 is 60, the literal twin of T.rocks.rampS (the tuning key itself is not read by rampOf)
}

export const BD_BASE = 510 // class-3 band floor: the scale basis of the rule-11 minima, min(abs, floor(abs * bd / 510))

// ponytail: band, ecc, grid and rampS come from the 62-seed probes in R-164; no free [lo, hi] knob, each class is re-validated as a
// whole. Classes 1 and 2 use the R-164 acceptance band (220-340, 340-460), not the measured spans (231-328, 354-446).
// pocketDepth stays one shared T.cave value, add a per-class key only if short classes show plant starvation.
export const PARAMS: Record<DepthClass, CaveParams> = {
  1: { depthClass: 1, eccMin: 5, eccMax: 6, bdLo: 220, bdHi: 340, fbLo: 198, cols: 4, rows: 3, rampS: 40 },
  2: { depthClass: 2, eccMin: 8, eccMax: 9, bdLo: 340, bdHi: 460, fbLo: 306, cols: 6, rows: 4, rampS: 55 },
  3: { depthClass: 3, eccMin: 12, eccMax: 14, bdLo: 510, bdHi: 690, fbLo: 459, cols: 8, rows: 6, rampS: 60 },
  4: { depthClass: 4, eccMin: 17, eccMax: 20, bdLo: 690, bdHi: 860, fbLo: 459, cols: 8, rows: 6, rampS: 105 },
}

// Round and clamp to 1..4; undefined, NaN and infinities fall back to the default class 3.
export function paramsOf(c: number | undefined): CaveParams {
  if (c === undefined || !Number.isFinite(c)) return PARAMS[3]
  return PARAMS[Math.min(4, Math.max(1, Math.round(c))) as DepthClass]
}

// Rule 11 minimum scaled to the Beacon distance: the absolute value holds from bd 510 up, short caves get proportionally fewer.
export const scaledMin = (abs: number, bd: number): number => Math.min(abs, Math.floor(abs * bd / BD_BASE))
