// Vine glow torch-fade checks: the shared fade both vine consumers call (render/vine-glow.ts:106 alpha, render/light.ts:111 carve).
// Far vines (dist >= TF_FAR * R) drop to the residual so the glow reads as a faint navigation hint, near vines (dist <= TF_FULL * R)
// keep the full pulse, and the fade is monotonic non-increasing between. torchFade lives in render/keys.ts (pure, DOM-free, check-reachable);
// vine-glow.ts and vine-sites.ts themselves cannot be imported here (they reach render/tileset.ts, a bare JSON import node cannot load,
// same trap as depth-tone.check.ts:183). The alpha bound follows: glow alpha = pulse * torchFade with pulse <= BASE + AMP = 0.26
// (vine-glow.ts:20), so a far vine's alpha <= 0.26 * 0.12 = 0.0312 (faint, never fully dark).
// Exports run(); no side effect on import; all state local.
import { torchFade } from '../render/keys.ts'

const FULL = 0.6, FAR = 1.15, RESIDUAL = 0.12 // mirrors of the private TF_* constants in render/keys.ts:49 (asserted below, not imported)

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: vine-glow: ' + msg)
}

export function run(): void {
  for (const R of [100, 170, 22]) {
    // 1. Near: inside TF_FULL * R the fade is exactly 1 -> the pulse alpha is unchanged vs the pre-fade base.
    for (const u of [0, 0.25, 0.5, 0.9, 1]) ok(torchFade(FULL * R * u, R) === 1, `R=${R}: fade is 1 at ${u} * TF_FULL * R`)
    // 2. Far: at and beyond TF_FAR * R the fade is exactly the residual (faint, never zero).
    for (const u of [1, 1.2, 2, 10]) ok(torchFade(FAR * R * u, R) === RESIDUAL, `R=${R}: fade is the residual at ${u} * TF_FAR * R`)
    // 3. Monotonic non-increasing over 0..2 * TF_FAR * R, and always within [RESIDUAL, 1].
    let prev = torchFade(0, R)
    for (let i = 1; i <= 400; i++) {
      const f = torchFade((i / 400) * 2 * FAR * R, R)
      ok(f <= prev, `R=${R}: fade increases at step ${i} (${f} > ${prev})`)
      ok(f >= RESIDUAL && f <= 1, `R=${R}: fade out of [RESIDUAL, 1] at step ${i} (${f})`)
      prev = f
    }
    // 4. The transition band actually transitions: strictly between the plateaus just inside each boundary (no step function).
    ok(torchFade(FULL * R + 1e-6, R) < 1, `R=${R}: fade drops right after TF_FULL * R`)
    ok(torchFade(FAR * R - 1e-6, R) > RESIDUAL, `R=${R}: fade is above the residual right before TF_FAR * R`)
  }
  // 5. Degenerate inputs: R <= 0 and NaN on either side return the residual, never NaN, never a divide by zero.
  ok(torchFade(50, 0) === RESIDUAL, 'R = 0 returns the residual')
  ok(torchFade(50, -10) === RESIDUAL, 'negative R returns the residual')
  ok(torchFade(Number.NaN, 100) === RESIDUAL, 'NaN dist returns the residual')
  ok(torchFade(50, Number.NaN) === RESIDUAL, 'NaN R returns the residual')
  ok(torchFade(-1, 100) === RESIDUAL, 'negative dist returns the residual')
  console.log('vine-glow check ok')
}
