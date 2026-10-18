---
type: architecture
title: Last Ember – UI Architecture (2/2) – HUD, Paused, End Screens, Animations, Accessibility
description: Last Ember UI part 2 – pixel-exact playing HUD (HP pips, mineral hotbar, depth, active flame, hold-ring prompt, exit arrow with distance, toasts, PERFECT text), paused and dead/won layouts with score fields, seed copy link, keyboard focus and navigation, fades and shakes, accessibility (shape-coded minerals, reduced flashing, volume), English-only note and the UI State additions.
tags: [project, ai-jam-5, architecture, last-ember, render]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – UI Architecture (2/2)

Part 2 of 2. Previous: [[architecture-ui]] (decision, scaling, fonts, input rules, title, help). Render: [[architecture-render]] (pass 20–21), [[architecture-render-2]], [[architecture-render-3]] (vignettes, §9 State additions). Resources: [[architecture-resources]], [[architecture-resources-2]], [[architecture-resources-3]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. Score and end-screen fields: [[architecture-scoring-and-save]] §5–7. State: [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]]. UI art: [[architecture-assets-sprites-3]] §3.

All coordinates at the 1280 × 720 reference (`u = 1`), mapped with `place()` and the anchor given ([[architecture-ui]] §3). `ps = 2u` for UI sprites.

## 1. PLAYING HUD (`src/ui/hud.ts`)

Draw order inside the HUD pass: toasts → HP → hotbar → active flame → depth → prompt → exit arrow → PERFECT text. Everything in screen space, `imageSmoothingEnabled = false`, text shadowed.

| Element | Anchor | Rect (x, y, w, h) | Content and rules |
|---|---|---|---|
| HP pips | top-left | first pip centre `(36, 36)`, pitch 28, 5 pips → last centre `(148, 36)` | `ui_hp-pip` 12×12 at ps (24×24). Frame 0 full for `i < hp`, 1 empty otherwise; the pip just lost shows frame 2 (lost) for 0.3 s (`player.hurtT > HURT_INVULN - 0.3`) and shakes ±2u (`hash2(meta.steps, i, 3)`). At `hp === 1` the last pip pulses scale 1 → 1.15 at 70 BPM. |
| active flame | top-left | `24, 60, 160, 24` | flame swatch (mantle disc r 8u + core r 3u) at `(36, 72)` + text 14 bold at x 52: `PLAIN` / `SODIUM` / `COPPER` / `STRONTIUM` in the mantle colour; `FLAME OUT` in danger red, blinking 2 Hz, when `energy <= 0` in descent. Hidden in escape. |
| depth readout | top-right | right edge `1256`, baseline `44` | `ui_depth` icon 12×12 at ps left of the text + `DEPTH 14` bold 18 + ` / 40` 14 dim; below (baseline 64) `ZONE 2` 12 dim. Current depth (not max, [[architecture-scoring-and-save]] §1). |
| run clock | top-right | right edge `1256`, baseline `84` | `3:42` 14 dim (`steps / 60` as m:ss). DEFAULT (architect): shown, since time scores. |
| hotbar | bottom-centre | 3 slots, each `ui_slot` 24×24 at ps = 48 × 48: x `560, 616, 672` (pitch 56), y `644` | Slot `i` = `MINERALS[i]`. Frame `selected` when `player.selected === MINERALS[i]`. Icon `item_mineral-*` 16×16 at ps centred. Count `×2` bold 12 at slot bottom-right (`x + 44, y + 44` baseline, right-aligned); count 0 → icon at 30 % alpha and count dim. Keybind label `1`/`2`/`3` 12 dim centred above each slot (baseline `y − 6`). Active mineral marker: 4u bar under the slot in the mantle colour (`y + 52`). Hint line baseline `708`: `F toss · G shake off` 12 dim, centred. Hidden in escape (no torch). |
| interaction prompt | world-anchored | centre = screen pos of the target + `(0, −40u)` | Shown when a vein (player within 40 px of its face, [[architecture-state-2]] §4) or the Beacon (within 48 px, not lit) is in range: `ui_keycap` 16×16 at ps with `E` bold 12, hold ring around it: `ctx.arc(cx, cy, 20u, −π/2, −π/2 + 2π·p)`, `lineWidth 3u`, `#ff8a1e`, track ring `#3a2e24`. `p = mining.progress / MINE_TIME` or `beaconHold / BEACON_HOLD`. Label under it, 12: `Mine copper` / `Light the Beacon (costs flame)`; inventory full (3) → `Full` dim and no ring. Screen pos via `toScreen(v, x, y)` ([[architecture-render]] §4.2); `drawHud` builds `v` with `makeView(ctx, s, w, h)` while the transform is `setTransform(dpr,…)`, so `getTransform().a` is the dpr as in the world pass. |
| exit marker | edge-anchored | see §1.1 | escape only |
| toasts | top-centre | stack from `(640, 120)`, line pitch 26, max 3 | text 16 bold in a panel `w = textWidth + 24u`, h 24, alpha `min(1, t / 0.3)` (fade out last 0.3 s); new toast slides down 8u over 0.15 s. Sources: `+1 Copper`, `Resin – flame relit`, `+1 heart`, `Inventory full`, `No sodium left`, `Saving disabled in this browser`. Written by systems via `toast(s, text)` (`ui.toasts`, max 3, t 1.8 s). |
| PERFECT text | centre | baseline `(640, 300)` | while `fx.flare > 0`: `PERFECT` bold 32 `#ffd27a`, scale `1 + 0.3·fl` (fl = flare / FLARE_TIME), alpha `fl`; `GOOD` 24 `#e8dcc8` for 0.4 s after a good parry (`meta.steps - parry.lastAt < 24` and grade good); `POOR` 20 dim likewise. Text rises 16u over its lifetime. |
| danger cues | full | – | low-HP and hit vignettes are render passes ([[architecture-render-3]] §4), not HUD |

### 1.1 Exit marker (escape)

- Direction: **superseded by [[architecture-rulings]] R-059/R-060:** `exitHeading(s)` in `src/world/route.ts` ([[architecture-rocks-2]] §6 steps 1–4); smoothing and the 0.1 s distance update keep their state in `getResources().hud` ([[architecture-resources]] §2). Distance = escape-field value at the player tile (tiles).
- Placement: if the exit is on screen → arrow sits above the exit, bobbing ±4u at 2 Hz, pointing down. Else → on an ellipse inset by the safe margin: centre `(w/2, h/2)`, radii `(w/2 − 64u, h/2 − 64u)`, point at `angle`; `ui_exit-arrow` 24×24 at ps rotated by `angle` (16-step quantised like all rotations).
- Label under the arrow: `EXIT 42 m` 14 bold `#cfe3ff` (1 tile = 1 m, DEFAULT architect). Arrow alpha pulses 0.7–1 at 1 Hz.
- First 2 s of escape: centred banner `RUN!` bold 40 `#ffd27a` with `Reach the entrance` 16 under it at (640, 200).

## 2. PAUSED (over the frozen world)

Backdrop: world frame (State frozen) + `rgba(0,0,0,0.55)` full-screen. Panel centre `440, 176, 400, 376`.

| Element | Rect / baseline | Content |
|---|---|---|
| title | baseline `640, 224` | `PAUSED` bold 40 centred |
| button 0 | `520, 260, 240, 44` | `Resume` (Esc / P / Enter) |
| button 1 | `520, 316, 240, 44` | `Help` (opens help, `ui.helpFrom = 'paused'`) |
| button 2 | `520, 372, 240, 44` | `Sound: On 70 %` (same behaviour as title) |
| button 3 | `520, 428, 240, 44` | `Flashing: Full` / `Flashing: Reduced` |
| button 4 | `520, 484, 240, 44` | `Quit to title` – needs confirm: first press relabels `Really quit? Enter` for 2 s (`ui.confirmT`) |
| hint | baseline `640, 544` | `Seed 8812 · depth 14 · 3:42` 12 dim |

## 3. DEAD and WON (over the frozen world)

Backdrop: world + `rgba(0,0,0,0.6)` (won: `rgba(40,24,8,0.55)` warm). Panel centre `340, 96, 600, 528`. Fade-in 0.4 s (§5). Fields from `RunResult` ([[architecture-scoring-and-save]] §5, §7).

| Row | Baseline y | Left x 380 (label, 16 dim) | Right x 900 right-aligned (value, 18 bold) |
|---|---|---|---|
| title | 152 (centred) | `THE EMBER DIED` (danger `#ff3b2a`) / `YOU ESCAPED` (`#ffd27a`), bold 40 | – |
| new best banner | 188 (centred) | `NEW BEST!` bold 20 `#ffd27a` with 2u ember ticks, pulsing scale 1–1.08 at 1.5 Hz; otherwise `Best 5483` 14 dim (banner iff `result.isNewBest`, [[architecture-scoring-and-save]] §6 step 4; example dead run 4370 < best 5483 → `Best 5483`) | – |
| depth | 236 | `Depth` | `40 / 40 · Zone 4` |
| time | 266 | `Time` | `6:20` |
| minerals | 296 | `Minerals used` | `6` |
| hp left | 326 | `Hearts left` | `1` (won only; dead: row omitted, rows below move up 30) |
| divider | 344 | 1u line `#3a2e24` from 380 to 900 | – |
| score | 384 | `Score` bold 20 | `4370` bold 28 `#ffd27a`, counts up from 0 over 0.8 s after the fade (`ease-out`, derived from `meta.time - endAt`) |
| breakdown | 410 | 12 dim, centred: `depth 4000 · escape 0 · time 220 · minerals 150 · hearts 0` (example = "Death in escape", [[architecture-scale-and-economy-3]] §4) | – |
| flavour | 436 | 12 dim, centred: `Parries 9 (perfect 3) · Kills 12` | – |
| seed | 476 | `Seed` | `8812` + button `Copy link` at `760, 458, 140, 28` (14 bold); after copy `Copied!` for 1.5 s (`ui.copied`) |
| buttons | 520 | 3 buttons 168 × 44 at x `364, 556, 748`, y `528` | `New run` (Enter, random seed) · `Retry seed` (T) · `Title` (Esc) |
| hint | 600 (centred) | `Enter new run · T retry seed · C copy · Esc title` 12 dim | – |

- **Copy link (R-003, R-077):** `stepScreens` emits `copyLink` on the click/`KeyC` edge; `platformStep` (`src/ui/platform.ts`) consumes it and calls `navigator.clipboard?.writeText(shareText)` in the same update step (sticky activation makes this allowed in Chrome/Firefox; Safari not verified). Guard `typeof navigator !== 'undefined'`. `shareText = SHARE_BASE ? SHARE_BASE + '?seed=' + encodeURIComponent(seedText) : 'Last Ember seed ' + seedText` ([[architecture-scoring-and-save]] §5). Failure (`reject` or no clipboard) → `ui.copied` shows `Copy failed – seed ${seedText}` for 2 s. The promise result is written back on the next step via a resource flag (`res.ui.copyResult`), never into State from a callback.
- Lockout 0.5 s after `endAt` (input ignored; buttons drawn dim until it passes).

## 4. Focus and keyboard navigation

| Screen | Focus order (`ui.cursor`) | Keys |
|---|---|---|
| title | 0 Play, 1 Help, 2 Sound, 3 Flashing, 4 Seed | ↑/↓/W/S move (wrap); Enter/Space activate; ←/→/`-`/`=` volume on Sound; typing on Seed ([[architecture-ui]] §7) |
| help | tabs 0–2 (`ui.helpPage`) | ←/→/A/D page; Esc/Backspace back |
| paused | 0 Resume, 1 Help, 2 Sound, 3 Flashing, 4 Quit | ↑/↓ move; Enter activate; Esc/P resume |
| dead / won | 0 New run, 1 Retry seed, 2 Title, 3 Copy link | ←/→/A/D move; Enter activate; T retry; C copy; Esc title |
| playing | none | gameplay keys only; Esc/P pause; M mute |

`ui.cursor` resets to 0 on every screen change (written with `ui.screenAt = meta.time`). Focus ring = the button's focused style (`#ffd27a` border); it is always visible on menu screens, so keyboard users never lose focus.

## 5. Animations (all derived from State clocks, render stays pure)

| Animation | Clock | Curve |
|---|---|---|
| screen fade-in (help, paused, dead, won panels) | `k = clamp((meta.time - ui.screenAt) / 0.25, 0, 1)` (end screens 0.4 s) | panel alpha `k`, panel y offset `(1 - k) · 12u` |
| title logo breathe | `meta.time` | glow alpha `0.2 + 0.1 · sin(t · 1.2)` behind the logo (additive `#ff8a1e` glow sprite) |
| button hover | `ui.hover` change is instant; ember ticks flicker `0.8 + 0.2 · vnoise(t · 6)` | – |
| HP pip loss shake | `player.hurtT` | ±2u for 0.3 s |
| toast slide/fade | `toast.t` | §1 |
| score count-up | `meta.time - result.endAt` | `1 - (1 - x)^3` over 0.8 s |
| denied shake (toss with 0 pieces) | `ui.denyT` (State addition, 0.25 s) | hotbar slot offset `±3u · sin(t · 60)` |

`meta.time` advances on every screen ([[architecture-state]] §7), so menu animations run while the world is frozen.

## 6. Accessibility

- **Colour-blind safe minerals:** every mineral has a distinct icon SHAPE (sodium cube, copper needle spray, strontium crossed prisms, [[architecture-assets-sprites-3]] §1.3) and its NAME appears in the active-flame readout; the hotbar keeps a fixed order (1 sodium, 2 copper, 3 strontium). The flame itself differs in light radius and brightness, not only hue.
- **Reduced flashing:** `settings.reducedFlash` (State addition), a `Flashing: Full` / `Flashing: Reduced` button on title (button 3, [[architecture-ui]] §7) and paused (button 3, §2); Enter/click toggles. Effects: full-screen flashes × 0.3, low-HP pulse amplitude 0, screen shake × 0.4, PERFECT text no scale pop ([[architecture-render-3]] §4).
- **Volume:** master volume and mute on title and paused, `M` everywhere, persisted ([[architecture-resources-3]] §3).
- **Readable text:** minimum 11 CSS px, shadowed, colour contrast text `#e8dcc8` on panel `#120f0d` ≈ 13:1.
- **No time-critical UI:** menus never time out; pause is always available (also on blur).
- Not done (`ponytail:`): key rebinding, screen-reader support, subtitles for audio cues (the eye flare is the visual twin of `sfx_eye-open`, so cues are already dual-coded).

## 7. Localisation

English only. All strings live in `src/ui/strings.ts` (`STR`, `HELP`) so a later translation is a data swap; numbers are formatted by hand (`m:ss`, no `Intl`). No right-to-left support.

## 8. UI State additions required (not yet in [[architecture-state-2]] §9)

Writer `screens.ts` below means `src/systems/screens.ts` `stepScreens` (R-003); `ui.copyMsg` is written by `platformStep` from `res.ui.copyResult`.

| Field | Type, default | Writer | Why |
|---|---|---|---|
| `ui.hover` | `number`, `-1` | `screens.ts` | mouse hover highlight ([[architecture-ui]] §5) |
| `ui.screenAt` | `number`, `0` | `screens.ts` | fade-in clock and 0.25 s screen-change lockout |
| `ui.helpFrom` | `'title' \| 'paused'`, `'title'` | `screens.ts` | Help is reachable from two screens |
| `ui.confirmT` | `number`, `0` | `screens.ts` | quit-to-title confirm window |
| `ui.denyT` | `number`, `0` | `flame.ts` (R-009) | hotbar shake on empty toss |
| `ui.copyMsg` | `string`, `''` | `screens.ts` | `Copied!` vs `Copy failed – …` text for `ui.copied` |
| `settings.reducedFlash` | `boolean`, `false` | `screens.ts` | accessibility; persisted |
| `settings.quality` | `'auto' \| 'q0'…'q3'`, `'auto'` | `src/game.ts` dev toggle `Shift+Digit6` (R-132, R-133); persisted in `SettingsRecord.quality` (R-142) | [[architecture-render-3]] §3.3 |
| `world.beaconLitAt` | `number`, `0` | `beacon.ts` | Beacon transition and escape music delay |
| `FxEventKind` UI/audio kinds | union in [[architecture-state-2]] §7 (authoritative, R-082 + `denied`) | mapping [[architecture-resources-2]] §8 | audio triggers |

All are additive with defaults in `init()`; `migrate` fills them; no `STATE_VERSION` bump ([[architecture-state-3]] §2). Note `fill()` keeps a value only if its `typeof` matches the default, so `ui.helpFrom` and `settings.quality` are all-string unions on purpose.

## Related

- [[architecture]]
- [[architecture-ui]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-resources-3]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-scoring-and-save]]
- [[architecture-assets-sprites-3]]
- [[architecture-assets-style]]
- [[last-ember-design]]
- [[architecture-rulings]]
- [[architecture-rulings-3]]
- [[architecture-rocks-2]]
- [[index]]
