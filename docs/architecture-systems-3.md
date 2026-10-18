---
type: architecture
title: Last Ember – Gameplay Systems (3/4) – Swing, Parry, Bites, Damage, Roll
description: Last Ember gameplay systems part 3 – swing with input buffer, parry detection against lunging shades with the signed timing delta, grade and flame-loss formula with worked examples (perfect, early 80 ms, late 80 ms, copper, devourer), bite latch and resolution, the damage rules table for lit flame, flame out and escape, hurt invulnerability, and the escape roll with i-frames and dodge detection.
tags: [project, ai-jam-5, architecture, last-ember, systems]
timestamp: 2026-10-17T21:20:00Z
---

# Last Ember – Gameplay Systems (3/4)

Part 3 of 4. Previous: [[architecture-systems]], [[architecture-systems-2]]. Next: [[architecture-systems-4]]. Values: [[architecture-tuning]] §6–§7, [[architecture-tuning-2]] §1. Monster states that feed this file (`windup`, `lunge`, `recover`): [[architecture-monsters-ai]]. Hub: [[architecture]]. Spec: [[last-ember-design]] § Parry, § Flame and health model, § Phase 2. State: [[architecture-state]] §8, [[architecture-state-2]] §2.

All three systems live in `src/systems/combat.ts` (≈ 200 lines; split `parry.ts` out if it grows past 300). Notation: `p = s.player`, `sw = p.swing`, `e = p.energy`, `K = T.monsters[m.kind]`, `M = T.minerals.table[p.activeMineral]`, `rp = 10`, `rm = K.radiusPx`.

## 1. Lunge timeline (shared reference)

A lunge is planned so a standing player is touched at lunge time `K.contactS`. Monster AI sets at lunge start ([[architecture-monsters-ai]] §5): `ai = 'lunge'`, `aiT = 0`, speed `vL = max(30, d0 - rp - rm) / K.contactS` along the locked `lungeDir`, `contactT = -1` (State addition `Monster.contactT`).

| Lunge time `aiT` | Event | Owner |
|---|---|---|
| 0 | lunge starts, `emit('lunge')` | AI |
| first step with `dist <= rp + rm + K.biteSlackPx` | latch: `contactT = aiT`; from now the shade sticks to the player at distance `rp + rm` (moved by AI each step) | `resolveBites` |
| `contactT + T.parry.lateMaxS` (descent) or `contactT` (escape) | BITE: `damagePlayer` | `resolveBites` |
| `K.contactS + K.lungeOverrunS` with no latch | miss → `recover` | AI |

The **perfect moment** is lunge time `K.contactS` (= `PERFECT_AT[kind]` of [[architecture-state-2]] §2). It is a fixed rhythm the player learns: eyes glow 0.4 s, lunge, perfect 0.2 s later (lurker). ponytail: perfect is the PLANNED contact, not the actual one; a player walking into the lunge shifts real contact earlier by a few steps. Upgrade path: set the reference to `contactT` once latched (needs swings to be judged after the latch).

## 2. `stepSwing(s: State, it: Intent, dt: number): void`

Reads intent, `p.facing`, `p.swing`. Writes `p.swing` (`active`, `t`, `dir`, `cooldown`, `buffer`). Emits `swing` (a = dir). Descent only (not called in escape).

```
sw.cooldown = max(0, sw.cooldown - dt)
sw.buffer = max(0, sw.buffer - dt)                    // State addition: player.swing.buffer, default 0
if sw.active: sw.t += dt; if sw.t >= T.swing.activeS: sw.active = false
want = it.swing || sw.buffer > 0
if want and sw.cooldown <= 0:
  sw.active = true; sw.t = 0; sw.dir = p.facing; sw.cooldown = T.swing.cooldownS; sw.buffer = 0
  emit('swing', p.x, p.y, sw.dir)
else if it.swing: sw.buffer = T.swing.bufferS        // click during cooldown, kept 0.10 s
```

- Swinging with the flame out is allowed (stick swings, `swing` sound) but can never parry (`resolveParries` returns when `e <= 0`, **spec**).
- Swinging does not cancel mining or the Beacon hold (only movement does).
- A swing that touches a shade NOT in `lunge` has no effect (DEFAULT, architect: spec defines parry only on lunges).
- Timeline: `cooldownS` 0.5 > `activeS` 0.15, so swings never overlap.

## 3. `resolveParries(s: State): void`

Reads `p`, `monsters`. Writes `p.energy`, `p.parry`, `p.stats.{kills,parries,perfectParries,energyLostToHits}`, monster `ai/aiT/aiDur`, `fx.flare`, `fx.hitstop`, `fx.shake/shakeMag`. Emits `parryPerfect` / `parryGood` / `parryPoor` (a = δ in s), `flameOut` if the loss empties the flame.

```
if s.meta.phase !== 'descent' or e <= 0 or !sw.active: return
for m of s.monsters (array order):
  if m.ai !== 'lunge': continue
  d = hypot(m.x - p.x, m.y - p.y)
  if d - rm > T.swing.reachPx: continue                            // 56 px reach to the shade's edge
  off = abs(wrapPi(atan2(m.y - p.y, m.x - p.x) - sw.dir))
  if off > deg(T.swing.arcDeg / 2) + asin(min(1, rm / max(d, rm))): continue  // arc ±60° widened by body size
  δ = (m.aiT - sw.t) - K.contactS                                   // lunge time at swing start minus perfect
  if δ < -T.parry.earlyMaxS: continue                               // swing far too early: whiff for this shade
  { grade, loss } = parryLoss(δ, m.kind, p.activeMineral)
  applied = min(e, loss); e -= applied; if e <= 0: e = 0; emit('flameOut')
  m.ai = 'dying'; m.aiT = 0; m.aiDur = K.dyingS                    // every graded parry kills (spec)
  stats.kills += 1; stats.parries += 1; if grade === 'perfect': stats.perfectParries += 1
  stats.energyLostToHits += applied
  p.parry = { lastGrade: grade, lastDelta: δ, lastAt: s.meta.steps, energyLost: applied }
  emit(grade === 'perfect' ? 'parryPerfect' : grade === 'good' ? 'parryGood' : 'parryPoor', m.x, m.y, δ)
  if grade === 'perfect': fx.flare = T.parry.flareS; fx.hitstop = T.parry.hitstopS; addShake(s, 'parryPerfect')
```

`wrapPi(a) = a - 2π * floor((a + π) / (2π))` → result in `[−π, π)`. One swing can parry several lunging shades in the same step; each gets its own grade.

### 3.1 `parryLoss(δ, kind, mineral): { grade: ParryGrade; loss: number }` (pure, exported for checks)

```
P = T.parry.perfectS * M.perfectMul
W = max(δ < 0 ? T.parry.earlyMaxS : T.parry.lateMaxS, P + T.parry.minSpanS)
if |δ| <= P + 1e-9: return { grade: 'perfect', loss: 0 }
u = clamp((|δ| - P) / (W - P), 0, 1)
frac = T.parry.lossMinFrac + (T.parry.lossMaxFrac - T.parry.lossMinFrac) * u ^ T.parry.lossExp
return { grade: u <= T.parry.goodSplit ? 'good' : 'poor', loss: K.energyHitE * frac * M.lossMul }
```

The `1e-9` epsilon matters: δ is built from sums of `1/60`, so `2/60` can be `0.033333333333333326` or `…37`.

### 3.2 Worked examples (lurker `energyHitE = 12`, unparried hit costs 12 E)

Constants: P = 0.035, early W = 0.140, late W = 0.090, min 0.15, max 0.80, exp 1.5.

| Case | δ (s) | u | u^1.5 | frac | loss (E) | grade |
|---|---|---|---|---|---|---|
| Perfect (swing 2 steps early) | −0.0333 | – | – | – | **0** | perfect |
| Early 80 ms, plain | −0.080 | (0.080−0.035)/0.105 = 0.4286 | 0.2806 | 0.15 + 0.65 × 0.2806 = 0.3324 | **3.99** | good |
| Late 80 ms, plain | +0.080 | (0.080−0.035)/0.055 = 0.8182 | 0.7401 | 0.6311 | **7.57** | poor |
| Early 80 ms, copper (P = 0.056, ×0.6) | −0.080 | 0.024/0.084 = 0.2857 | 0.1527 | 0.2493 | 12 × 0.2493 × 0.6 = **1.80** | good |
| Late 80 ms, copper | +0.080 | 0.024/0.034 = 0.7059 | 0.5931 | 0.5355 | **3.86** | poor |
| Copper, δ = −0.050 | −0.050 | – (|δ| ≤ 0.056) | – | – | **0** | perfect |
| Early 80 ms, devourer (35 E) | −0.080 | 0.4286 | 0.2806 | 0.3324 | **11.63** | good |
| Edge early, plain | −0.140 | 1 | 1 | 0.80 | **9.60** | poor |
| Whiff | −0.150 | – | – | – | no parry; bite lands later | – |

In-game δ is a multiple of 1/60 s: "80 ms early" is really −0.0833 (5 steps): u = 0.4603, frac = 0.3530, loss 4.24 E. Late +0.0833: u = 0.8788, frac = 0.6854, loss 8.22 E. Late is punished harder than early on purpose: a late swing means the jaws were already closing.

Worked timeline (lurker, standing player, d0 = 131 px): vL = 112/0.2 = 560 px/s. After lunge step k the gap is `d = 131 − 9.333k`. The arc can first touch when `d − 9 ≤ 56` → d ≤ 65 → lunge step 8 (aiT 0.133 s). Latch when `d ≤ 23` → step 12 (aiT 0.200 s, d = 19). Bite when `aiT ≥ 0.200 + 0.090 = 0.290` → step 18 (aiT 0.300 s). Because δ = `(m.aiT − sw.t) − contactS` stays constant while both clocks run, a swing started before the shade is in reach (e.g. lunge step 5, δ = −0.117) is graded on the first step the arc touches (step 8). A swing started during the windup gives δ < −0.2 and whiffs. Swing started at lunge step 10 (0.1667): δ = −0.0333 → perfect, resolved at step 10 (arc in reach since step 8). Swing started at step 17: δ = +0.0833 → poor, 8.22 E, resolved on step 17 before the bite on step 18.

## 4. `resolveBites(s: State): void` and `damagePlayer(s: State, m: Monster): void`

```
for m of s.monsters:
  if m.ai !== 'lunge': continue
  d = hypot(m.x - p.x, m.y - p.y)
  if m.contactT < 0 and d <= rp + rm + K.biteSlackPx: m.contactT = m.aiT
  if m.contactT < 0: continue
  delay = s.meta.phase === 'escape' ? 0 : T.parry.lateMaxS
  if m.aiT + 1e-9 >= m.contactT + delay: damagePlayer(s, m)
```

`damagePlayer` applies the rules table and always moves `m` out of `lunge` (to `dying` or `recover`), so a shade bites at most once per lunge.

### 4.1 Damage rules

| # | Situation | Player effect | Attacker | Event | Stats |
|---|---|---|---|---|---|
| 1 | `debug.god` | none | `recover` | – | – |
| 2 | escape and `p.roll.invuln > 0` | none (DODGE) | `recover` | `dodge` (State addition to `FxEventKind`) | – |
| 3 | `p.hurtT > 0` | none (no energy, no HP) | descent with lit flame (`e > 0`): still DIES at the flame, `setDying(s, m)`, NO kill credit; otherwise `recover` (R-149) | `monsterDie` via `setDying` | – |
| 4 | descent, flame lit (`e > 0`) | `applied = min(e, K.energyHitE)`; `e -= applied`; `hurtT = T.flame.flameHitInvulnS` (0.4 s); `hitFlash = T.hurt.flashS` | dies at the flame: `setDying`, `stats.kills += 1` (**spec**) | `flameHit` (a = applied); `flameOut` if `e` hit 0 | `energyLostToHits += applied` |
| 5 | descent, flame out (`e <= 0`) | `hurtPlayerHp(s, 'bite')` | survives (no flame to die at): `toRecover` | `hpHit` (inside `hurtPlayerHp`) | `damageTaken` (inside) |
| 6 | escape (no roll) | `hurtPlayerHp(s, 'bite')` | survives: `toRecover` | `hpHit` (inside) | `damageTaken` (inside) |

**`hurtPlayerHp(s: State, src: 'bite' | 'rock'): boolean`** (`src/systems/combat.ts`, exported; R-058 refined by R-148). The ONE HP-loss path for bites (rules 5–6) and rocks ([[architecture-rocks-2]] §2 `landRock`):

```
if debug.god or p.hurtT > 0: return false                 // rocks skip rule 2: roll i-frames never apply
p.hp -= src === 'rock' ? T.rocks.damageHp : 1             // both 1 today (spec: 1 pip)
p.hurtT = T.hurt.hpInvulnS; p.hitFlash = T.hurt.flashS     // 0.8 s, 0.25 s (R-147: no literals)
stats.damageTaken += 1; emit(s, 'hpHit', p.x, p.y); addShake(s, 'hpHit')
return true
```

- HP damage is always exactly 1 pip regardless of kind (**spec**). Only flame damage scales with size.
- Overflow: a lit-flame hit that empties the flame does NOT also cost HP (rule 4 only); the flame is the shield. DEFAULT (architect).
- `hp` reaching 0 is handled by `checkEnd` in the same step (§1 of [[architecture-systems]]).
- Energy sinks summary (binding values, [[architecture-scale-and-economy-2]] §2): passive burn `[.5, .7, 1.0, 1.4]` E/s, mining 3 E/s, Beacon hold 4 E/s with the 1 E floor (hold of 5 s in zone 4 = 27 E), hits 12/20/35 E, imperfect parries ≤ 80 % of a hit. A Beacon press below `T.beacon.minStartE` (40 E) is denied and costs **nothing** ([[architecture-systems-2]] §5). Hits during a running hold use rule 4 normally: the 1 E floor guards only the hold cost and the burn, not hits. A hit that empties the flame mid-hold (e.g. devourer 35 E at e < 35) cancels the hold (`beaconHold = 0`, [[architecture-systems-2]] §5) and a new start needs the gate again.
- Worked with the gate: zone 4, e = 45 at the Beacon, a stalker bite lands one step before the press → e = 25 < 40 → the press is denied.
- Rule 3 with a lit flame is a **DEFAULT (architect)**, R-149: spec 'a shade that attacks you dies at the flame' wins over the i-frame; the i-frame only protects the player (no energy loss, no HP). No kill credit, so i-frame farming earns no score. Flame out or escape: the attacker recovers as before.
- Shake: rule 4 `addShake(s, 'flameHit')`; rules 5–6 shake inside `hurtPlayerHp` ([[architecture-systems-4]] §4). The attacker entering `dying` emits `monsterDie`; entering `recover` sets `aiDur = K.recoverS` and `lungeCd = randRange(K.lungeCdS)` ([[architecture-monsters-ai]] §5).

Worked (rule 4): zone 3, e = 25, a stalker bites unparried: applied 20 → e = 5, radius 105.0 → 69.1 px, `hurtT` 0.4 s. A second lurker latched at the same time bites 3 steps later → `hurtT > 0` → rule 3: no energy loss, but the flame is lit (e = 5), so it dies at the flame without kill credit (R-149). Rule 5: e = 0, hp 3 → 2, 0.8 s safe.

## 5. `tickPlayerTimers(s: State, dt: number): void`

`hurtT = max(0, hurtT - dt)`, `hitFlash = max(0, hitFlash - dt)`. Runs after damage, so a hit in this step keeps its full duration minus nothing (it was set this step, then −dt: effective 0.4 s − 1 step; accepted).

## 6. `stepRoll(s: State, it: Intent, dt: number): void` (`src/systems/movement.ts`)

Escape only. Reads intent, `p.roll`, `p.facing`. Writes `p.roll`, `p.vx/vy`. Emits `roll`.

```
r = p.roll
r.cooldown = max(0, r.cooldown - dt); r.invuln = max(0, r.invuln - dt)
if r.t > 0:
  r.t = max(0, r.t - dt)
  p.vx = r.dirX * T.roll.speedPxS; p.vy = r.dirY * T.roll.speedPxS     // stepMovement skips its block while r.t > 0
  if r.t === 0: p.vx = r.dirX * sprint; p.vy = r.dirY * sprint          // exit at sprint speed, no stall
  return
if it.roll and r.cooldown <= 0:
  [dx, dy] = it.moving ? [it.mx, it.my] : [cos(p.facing), sin(p.facing)]
  r.dirX = dx; r.dirY = dy; r.t = T.roll.durationS; r.invuln = T.roll.invulnS; r.cooldown = T.roll.cooldownS
  p.vx = dx * 420; p.vy = dy * 420; emit('roll', p.x, p.y, atan2(dy, dx))
```

- Roll vs walls: `moveCircle` stops the blocked axis; the roll timer continues.
- I-frames protect against bites only (rule 2), not against rocks: rocks are dodged by moving out of the shadow ([[architecture-rocks]]).
- **Dodge detection**: a bite resolved while `invuln > 0` = dodge (rule 2). Because escape bites have no latch delay, the roll must cover the contact step: a roll started up to 0.30 s before contact dodges.
- Cooldown is measured from roll start (1.5 s); `sfx_roll-ready` plays when the audio layer sees `roll.cooldown` cross 0 (polled, no event).

Worked: sprinting right at 240 px/s, roll with `D` held: 0.30 s × 420 = 126 px vs 72 px sprinting, i-frames 18 steps, next roll at 1.5 s.

## Related

- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-systems]]
- [[architecture-systems-2]]
- [[architecture-systems-4]]
- [[architecture-tuning]]
- [[architecture-tuning-2]]
- [[architecture-monsters-ai]]
- [[architecture-monsters-ai-2]]
- [[architecture-rocks]]
- [[architecture-assets-audio-2]]
