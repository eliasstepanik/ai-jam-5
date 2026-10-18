---
type: architecture
title: Last Ember – UI Architecture (1/2) – Decision, Scaling, Fonts, Input Rules, Title and Help
description: Last Ember UI part 1 – canvas-drawn vs DOM decision per screen, module split under src/ui, the 1280x720 reference with half-step UI scale and safe margins, system font stack decision, the pure layout and hit-testing helper shared by update and render, input-to-UI event rules, cursor decision and pixel-exact layouts of the title and help screens.
tags: [project, ai-jam-5, architecture, last-ember, render]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – UI Architecture (1/2)

Part 1 of 2. Next: [[architecture-ui-2]] (HUD, paused, dead/won, animations, accessibility, State additions). Render frame and pass order: [[architecture-render]] (HUD is pass 20–21), [[architecture-render-2]], [[architecture-render-3]]. Resources and audio: [[architecture-resources]], [[architecture-resources-2]], [[architecture-resources-3]]. Hub: [[architecture]]. Spec (governs): [[last-ember-design]] § Controls and HUD, Help screen, End screen. Score fields: [[architecture-scoring-and-save]] §7. State: [[architecture-state]], [[architecture-state-2]] §9 (`ui`), [[architecture-state-3]]. UI art: [[architecture-assets-sprites-3]] §3–4, colours [[architecture-assets-style]] §4.7.

## 1. Decision: everything canvas-drawn

| Screen | Canvas | DOM overlay | Decision and reason |
|---|---|---|---|
| HUD (`playing`) | ✔ | – | must sit in the same frame as the world, scale with it, no layout thrash; ~30 draws |
| title | ✔ | considered for the seed text field | canvas: a typed seed is ≤ 32 chars of `[a-z0-9-]`; a hand-rolled field is ~40 lines, a DOM `<input>` would need focus juggling with the host's window key listeners (keys typed into it would also move the player) and styling in `index.html` |
| help | ✔ | – | static data table, drawn from `HELP` data |
| paused, dead, won | ✔ | – | same button helper; drawn over the frozen world |
| copy link | ✔ + `navigator.clipboard` call | – | no visible DOM |
| loading view (title while `ui.genPending !== ''`) | ✔ | – | centre text `Carving the cave…`, spinner from `meta.time`, `attempt n/8` from `ui.genAttempt` in debug builds only; `Escape` cancels (`genPending = ''`), all other input ignored; screen stays `title` ([[architecture-scale-and-economy-4]] §1.9) |

**DEFAULT (architect):** zero DOM elements besides the host canvas. UI modules add NO event listeners and never touch `document` ([[architecture-resources]] §5). Bitmap font from the atlas is P2.

## 2. Modules (`src/ui/`)

| File | Exports | DOM-free | Lines (est.) |
|---|---|---|---|
| `layout.ts` | `uiScale(w, h)`, `Rect`, `Button`, `titleLayout`, `helpLayout`, `pauseLayout`, `endLayout`, `hudLayout`, `hit(buttons, x, y)` | **yes** (checked) | ~200 |
| `strings.ts` | `STR` (all English text), `HELP` pages data | yes | ~150 |
| ~~`screens.ts`~~ (superseded by [[architecture-rulings]] R-003) | the pure screen machine is `stepScreens(s, input)` in `src/systems/screens.ts` (L3, called first by `step`); DOM effects (clipboard, `?seed` read/write, `res.ui.copyResult`) are `platformStep(s)` in `src/ui/platform.ts` (absorbs `url.ts`). No `src/ui/screens.ts`, no `uiStep` | – | – |
| `draw.ts` | `text`, `panel`, `button`, `keycap`, `ring`, `FONT` | no | ~120 |
| `menus.ts` | `drawScreen(ctx, s, w, h)` (title, help, paused, dead, won) | no | ~280 (split `menus-end.ts` if > 300) |
| `hud.ts` | `drawHud(ctx, s, w, h)` | no | ~250 |
| `debug.ts` | `drawDebug` ([[architecture-render-3]] §8) | no | ~80 |
| `platform.ts` | `platformStep(s)`, `readSeed(): string \| null`, `writeSeed(seed: string)` (R-003, R-029); storage lives in `src/core/storage.ts` (R-005) | guarded | – |

## 3. Reference resolution, scaling, safe margins

- Reference: **1280 × 720 CSS px** (the itch embed size, [[architecture-host-changes-2]] §8). All layout numbers in these files are at `u = 1`.
- `u = max(0.5, floor(min(w / 1280, h / 720) * 2) / 2)` (half steps). Examples: 1280×720 → 1; 1366×768 → 1; 1600×900 → 1; 1920×1080 → 1.5; 2560×1440 → 2; 960×540 → 0.5 (`min(0.75, 0.75) · 2 = 1.5`, floor 1, / 2 = 0.5).
- **Pixel-art scale** `ps = 2u` (UI sprites at 2× at the reference, [[architecture-assets-sprites-3]] §3). Half-step `u` keeps `ps` an integer (1, 2, 3, 4), so UI pixel art stays crisp at any size; `imageSmoothingEnabled = false` in the HUD pass.
- Positions: every rect is computed in reference units and mapped `X = ax · w + (x - ax · 1280) · u`, with an anchor `ax, ay ∈ {0, 0.5, 1}` per element (left/centre/right, top/middle/bottom). So corner elements stay at the corner and centred menus stay centred when the aspect ratio is not 16:9.
- **Safe margin:** 24 px reference (`24u`) from every edge for HUD and corner text. Nothing is ever drawn closer to an edge except full-screen backdrops and vignettes.
- Text sizes: `px = round(size · u)`; minimum 11 CSS px after scaling (clamp) so 0.5 scale stays readable.

```ts
// src/ui/layout.ts
export type Rect = { x: number; y: number; w: number; h: number }
export type Button = Rect & { id: string; enabled: boolean }
export const uiScale = (w: number, h: number): number => Math.max(0.5, Math.floor(Math.min(w / 1280, h / 720) * 2) / 2)
export function place(w: number, h: number, u: number, ax: number, ay: number, x: number, y: number, bw: number, bh: number): Rect {
  return { x: Math.round(ax * w + (x - ax * 1280) * u), y: Math.round(ay * h + (y - ay * 720) * u), w: Math.round(bw * u), h: Math.round(bh * u) }
}
export const hit = (bs: readonly Button[], x: number, y: number): number =>
  bs.findIndex((b) => b.enabled && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)
```

Update and render call the SAME `*Layout(w, h, s)` function: update with `input.view.w/h`, render with its `w/h` (identical values, [[architecture-host-changes]] §1). Hit-testing therefore always matches what is drawn. World-anchored UI (prompts, exit marker) maps world → screen with the render `View`; the world zoom used by aim is `viewZoomCss(input.view.h, input.view.dpr)` from `src/core/view.ts` (= render's `deviceZoom / dpr`, [[architecture-rulings-3]] R-131; the old `h / 360` and one-argument `viewZoomCss(h)` are gone).

## 4. Fonts

- **DEFAULT (architect): system monospace stack, no embedded font.** `FONT = 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace'`. Matches [[architecture-assets-sprites-3]] §3 ("no bundled font"). Zero bytes, no licence, no load race (a web font would need `document.fonts.load` before the first draw).
- Weights: `bold` for titles, values and buttons; normal for body. Sizes (reference): title 40, heading 24, button 18, body 16, small 14, key labels 12.
- Colours ([[architecture-assets-style]] §4.7): text `#e8dcc8`, dim `#8a7f70`, accent `#ff8a1e`, selected/win `#ffd27a`, danger `#ff3b2a`, panel `rgba(18,15,13,0.85)` (`#120f0d` 85 %), border `#3a2e24`, highlight `#5c4a38`.
- Text shadow for readability over the world: draw text twice, first at `+1u, +1u` in `#0a0809`. No `shadowBlur` (expensive).
- Upgrade path (`ponytail:`): if text looks off-style in playtest, embed one OFL pixel font as a Vite-imported `woff2` (≈ 20 KB), credit in README; P2 bitmap font from the atlas.

## 5. Input → UI rules

1. UI logic runs ONLY in `update` (`stepScreens(s, input)` first in `step`, then `platformStep(s)` in the facade; R-003, R-096). `render` draws from State; it never reads `Input` (it does not receive it).
2. **Activation = edges.** Keys: `input.pressed.has(code)`. Mouse: an entry in `input.clicks` whose position hits an enabled button (`hit()`) activates it on that step. The host has no `released` set ([[architecture-host-changes]] §1, R-098), so buttons activate on press, not on release.
3. **Hover:** `ui.hover = hit(buttons, input.mouse.x, input.mouse.y)` each step on menu screens (State addition, [[architecture-ui-2]] §8). Moving the mouse over a button also sets `ui.cursor` to it, so mouse and keyboard share one highlight.
4. **Click ownership:** in `playing`, all clicks belong to combat (swing/parry). The HUD has no clickable elements. On menu screens, clicks never reach gameplay (gameplay systems do not run outside `playing`).
5. `'Blur'` pseudo-key ([[architecture-host-changes]] §3) → `playing` becomes `paused`; ignored on other screens.
6. End-screen lockout: actions ignored until `meta.time - result.endAt >= 0.5` ([[architecture-scoring-and-save]] §7). Same 0.25 s lockout after every screen change (`ui.screenAt`) so one Enter never triggers two screens.
7. Each activation emits a `uiConfirm`/`uiBack` fx event, cursor moves emit `uiMove` (audio, [[architecture-resources-2]] §8).

## 6. Cursor and crosshair

**DEFAULT (architect): native CSS cursor, no canvas-drawn cursor.** Render cannot see the mouse (no `Input` in render), and a State mirror of the mouse would lag up to one step and stutter on 144 Hz screens. One rule in the `index.html` style block (applied to the planned replacement in [[architecture-host-changes-2]] §8, OD-3 approval; R-097):

```css
canvas { cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cg stroke='%230a0809' stroke-width='4'%3E%3Cpath d='M16 3v8M16 21v8M3 16h8M21 16h8'/%3E%3C/g%3E%3Cg stroke='%23ff8a1e' stroke-width='2'%3E%3Cpath d='M16 4v6M16 22v6M4 16h6M22 16h6'/%3E%3C/g%3E%3C/svg%3E") 16 16, crosshair; }
```

The `ui_cursor` sprite is removed from the catalog (R-097); swing cooldown is shown by the torch arc instead. The same crosshair is used on menus (buttons highlight on hover, so the shape is fine).

## 7. TITLE (1280 × 720, u = 1)

| Element | Anchor | Rect / position (x, y, w, h) | Content and style |
|---|---|---|---|
| backdrop | full | `0, 0, w, h` | `SCREENS.keyart` (file `src/assets/art/title-keyart.png`, R-141) cover-cropped, nearest scale `ceil(max(w/960, h/540))`; missing → procedural: black, radial glow `#ff8a1e` alpha 0.25 r 180 at (640, 360) with 12 eye pairs (`#cbb8ff`) on a ring r 260, positions from `hash2(i, 0, 1)` |
| logo | top-centre | `400, 96, 480, 120` | `art_logo` at 1× of its 480×120 (×u); missing → text `LAST EMBER` bold 64 `#e8dcc8`, lower half overdrawn in `#ff8a1e` via clip rect |
| tagline | top-centre | baseline `640, 244` | `STR.tagline` "Carry the last flame down. Light the Beacon. Get out." small 16, dim, centred |
| button 0 Play | centre | `520, 372, 240, 44` | `Play` / while loading `Loading 60 %` (disabled) |
| progress bar | centre | `540, 420, 200, 2` | track `#3a2e24`, fill `#ff8a1e` × `loaded / total`; hidden when done |
| button 1 Help | centre | `520, 428, 240, 44` | `Help` |
| button 2 Sound | centre | `520, 484, 240, 44` | `Sound: On 70 %` / `Sound: Off`; Left/Right or `-`/`=` change volume when focused; Enter/click toggles mute |
| button 3 Flashing | centre | `520, 540, 240, 44` | `Flashing: Full` / `Flashing: Reduced` ([[architecture-ui-2]] §6) |
| button 4 Seed field | centre | `520, 612, 240, 40` | label `Seed` small dim baseline `520, 604`; box: panel fill, border `#3a2e24` (focused `#ffd27a` 2 px); text `ui.seedInput` or placeholder `random` dim; caret `|` blinking at 2 Hz from `meta.time` when focused |
| seed hint | centre | baseline `640, 668` | `Type letters/digits · Backspace · empty = random seed` 12 dim |
| personal best | bottom-left | baseline `24, 696` | `Best 5483 · depth 40/40 · 6:57 · escaped` (SAE3 §4 mid win, [[architecture-scale-and-economy-3]]) 14 dim; none → `No best yet` |
| sound hint | bottom-right | baseline right `1256, 696` | `Click for sound` 14 `#ff8a1e` while audio state ≠ running; else `v0.1 · jam build` 12 dim |
| storage warning | bottom-left | baseline `24, 676` | `Saving disabled in this browser` 12 danger, only if `!ui.storageOk` |

Button drawing (`draw.ts button()`): panel `rgba(18,15,13,0.85)`, 2u border `#3a2e24`; focused/hovered: border `#ffd27a`, text `#ffd27a`, two 4u × 4u ember ticks `#ff8a1e` at the left and right outside edges; disabled: text dim, no hover. Label bold 18 centred, baseline `y + h/2 + 6u`.

Keys: `ArrowUp/KeyW` / `ArrowDown/KeyS` move `ui.cursor` 0..4 (wrap), `Enter`/`Space` activate, `KeyH` = Help, `KeyM` = mute toggle on every screen. **Seed entry:** while `ui.cursor === 4`, `pressed` codes `KeyA`–`KeyZ` → `a`–`z`, `Digit0`–`Digit9`/`Numpad0`–`9` → digits, `Minus` → `-`, `Backspace` deletes, `Escape` clears, `Enter` starts the run with this seed; max `SEED_MAX_LEN = 32` ([[architecture-determinism]] §5). Letters typed while focused do NOT trigger `KeyH`/`KeyM`/`KeyS`/`KeyW`. Dev caveat: the host eats `KeyR` in dev, so `r` cannot be typed in dev builds. Start: set `ui.genPending` (seed key) and `ui.genAttempt = 0`; the generation loop calls `startRun` with the finished cave ([[architecture-scale-and-economy]] §4); a `?seed=` URL pre-fills `ui.seedInput` once per page via `platformStep` (`res.ui.urlRead`, R-077).

## 8. HELP (1280 × 720, u = 1)

Backdrop: key art at 40 % (draw image, then `rgba(0,0,0,0.6)` fill). Panel `120, 72, 1040, 576` (centre anchor). Three pages (`ui.helpPage` 0..2, [[architecture-state-2]] §9), tab strip at `y 88`: three tabs `152 + i·180, 88, 168, 32`, active tab text `#ffd27a` with 2u underline. Footer baseline `640, 628`: `← → / A D page · Esc back` 14 dim. Clicking a tab selects it; `Escape`/`Backspace`/click outside the panel → back to `ui.helpFrom` (title or paused).

**Page 0 – Goal and controls**

| Element | Rect | Content |
|---|---|---|
| goal art | `152, 144, 640, 360` | `art_help-goal` 320×180 at 2u; missing → 4 stacked bands in zone floor colours ([[architecture-assets-style]] §4.2) with a dotted path |
| art labels | over the art | `ENTRANCE` at (472, 164), `ZONES 1–4` at (180, 300), `BEACON` at (472, 490), 14 bold, shadowed |
| goal text | `152, 520, 640, 100` | 3 lines body 16: `Your flame is your light, your shield and your clock.` / `Go deep, light the Beacon at the bottom, then run back up.` / `Deeper is worth more. Dying still scores.` |
| controls table | `824, 144, 320, 460` | rows of 36: keycap (`ui_keycap` at ps, label 12 bold) at x 824 + action text at x 880 body 16 |

Controls rows (`HELP[0].controls`): `WASD` Move · `Mouse` Aim · `Click` Swing / parry · `E` (hold) Mine / light Beacon · `1 2 3` Pick mineral · `F` Toss mineral into the flame · `G` Shake off (plain flame) · `Space` Roll (escape only) · `Esc` / `P` Pause · `M` Mute · `Enter` Confirm / restart.

**Page 1 – Parry**

| Element | Rect | Content |
|---|---|---|
| parry art | `152, 144, 640, 360` | `art_help-parry` at 2u; three labels drawn by code at the panel thirds: `EYES GLOW` (258, 164), `CLICK NOW` (472, 164), `PERFECT` (686, 164) |
| timing ring | centre `976, 300`, r 96 | see below |
| ring legend | `840, 420, 300, 120` | 4 rows of 24: swatch 12×12 + text 14: `eyes glow (telegraph)` `#6b4fb8`, `parry window` `#e8dcc8`, `PERFECT – no flame lost` `#ffd27a`, `too early / late – flame lost` `#8a7f70` |
| rules text | `152, 520, 640, 100` | body 16: `When a shade's eyes flare, it is about to lunge. Swing into it.` / `The closer to the moment of impact, the less flame you lose.` / `No flame, no parry: then every hit costs a heart.` |

Timing ring (procedural, no art): a 360° timeline of one lunge cycle (`T = TELEGRAPH + LUNGE` of a lurker). Arcs, width 10u, from angle `-π/2` clockwise: telegraph `#6b4fb8` alpha 0.8 for `TELEGRAPH / T · 2π`; then the lunge part `#8a7f70`; overdrawn by the good window `#e8dcc8` and the perfect window `#ffd27a` (widths from the gameplay tuning constants, so the diagram always matches the game). A needle (2u line, `#ff8a1e`, length r + 8) rotates with `meta.time % T`; a small shade eye pair at the centre flares (`#ffffff`) while the needle is in the telegraph arc. Centre label `CLICK` 14 bold when the needle is in the perfect window.

**Page 2 – Minerals and tips**

Table at `152, 152`, column x: icon 152, name 208, flame 352, effect 408, key 1088; row height 64, header row 32 (14 dim: `MINERAL`, `FLAME`, `EFFECT`, `KEY`).

| Row | Icon (2u) | Name | Flame swatch | Effect text (body 16) | Key |
|---|---|---|---|---|---|
| plain | small flame drop | `None` | core `#fff4d6` + mantle `#ff8a1e` | `Plain orange flame. G shakes any mineral off.` | `G` |
| sodium | `item_mineral-sodium` (cube) | `Sodium` | `#ffffff` / `#ffe14a` | `Bigger light, burns faster, LURES more shades.` | `1` |
| copper | `item_mineral-copper` (needles) | `Copper` | `#e8fff9` / `#1fd6b8` | `Normal light. Parries are more forgiving.` | `2` |
| strontium | `item_mineral-strontium` (prisms) | `Strontium` | `#ffe0e0` / `#e0182d` | `Small dim light. FEWER shades notice you.` | `3` |

Flame swatch = mantle disc r 12u + core disc r 5u (additive look faked with plain fills). Effect text comes from `HELP[2].minerals` and must be updated with the systems tuning (percentages are spec-level, [[last-ember-design]] § Minerals). Tips at `152, 440, 976, 180`, bullet list body 16: `Resin relights a dead flame instantly.` / `Plants heal one heart. They grow in side rooms.` / `Mining takes 2 s of standing still – that costs light.` / `Keep half your light for the way back.` / `After the Beacon, the cave is lit – but it is collapsing. Roll through lunges.`

## Related

- [[architecture]]
- [[architecture-ui-2]]
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
- [[architecture-determinism]]
- [[architecture-host-changes]]
- [[architecture-host-changes-2]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites-3]]
- [[last-ember-design]]
- [[index]]
- [[architecture-scale-and-economy-3]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
