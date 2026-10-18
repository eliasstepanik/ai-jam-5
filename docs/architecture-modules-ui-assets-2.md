---
type: architecture
title: Last Ember – Module Tree – UI, Assets, Host, Tooling (2/2)
description: Authoritative file list part 2 for Last Ember – host and tooling table (main.ts, merge.ts, check.ts, index.html, vite.config.ts, tsconfig.json, package.json, ci.yml, pack-atlas and check-assets scripts) with exact changes and approval needs, the proposed package.json scripts block, glob-free check wiring for Node 22.18, the asset folder layout with generated files, and the conflicts and gaps table.
tags: [project, ai-jam-5, architecture, last-ember, modules]
timestamp: 2026-10-17T22:30:00Z
---

# Last Ember – Module Tree: UI, Assets, Host, Tooling (2/2)

Part 1: [[architecture-modules-ui-assets]] (layer rule, `game.ts` facade, `src/ui`, `src/assets`). Siblings: [[architecture-modules-core]], [[architecture-modules-world]], [[architecture-modules-systems]], [[architecture-modules-render]]. Hub: [[architecture]], [[index]]. Spec: [[last-ember-design]]. Sources: [[architecture-host-changes]], [[architecture-host-changes-2]], [[architecture-assets-pipeline]], [[architecture-assets-pipeline-2]], [[architecture-resources]], [[architecture-ui]], [[architecture-ui-2]].

## 1. Host and tooling table

**Approval:** `src/main.ts` is the stable host (AGENTS.md "Golden rule": change it only for a real host need). Every row marked **APPROVAL** needs the owner's yes before `@build` touches it. Ship them as ONE PR, tier medium ([[architecture-host-changes-2]] §11).

| File | Status | Exact change (copied from spec) | Req. | Risk | Approval |
|---|---|---|---|---|---|
| `src/main.ts` | EDIT | (1) `Input` type gains `view: { w: number; h: number; dpr: number }` and the new comments, [[architecture-host-changes]] §1 step 1 ([[architecture-rulings-3]] R-131: `dpr` feeds `viewZoomCss(h, dpr)`) | REQUIRED (UI layout and camera use `input.view`) | low | **APPROVAL** |
| | | (2) literal `main.ts:57` gets `view: { w: 0, h: 0, dpr: 1 }`; `resize()` adds `input.view.w = w`, `input.view.h = h`, `input.view.dpr = dpr` after `canvas.height = …` (§1 steps 2–3) | REQUIRED | low | **APPROVAL** |
| | | (3) `pointerdown`: update position for every button, `if (e.button !== 0) return` before capture, down and click push (§1 step 4) | REQUIRED (right click would parry) | low | **APPROVAL** |
| | | (4) `pointerup` (`main.ts:94`) UNCHANGED; `pointermove` adds `input.mouse.down = (e.buttons & 1) !== 0` (§1 step 5, R-135: a chorded release fires `pointermove`, not `pointerup`) | REQUIRED | low | **APPROVAL** |
| | | (5) `on<Event>(canvas, 'contextmenu', (e) => e.preventDefault())` after `main.ts:95` (§1 step 6) | REQUIRED | low | **APPROVAL** |
| | | (6) replace `main.ts:78-81` with `lostFocus()` (clears keys and `mouse.down`, adds `'Blur'` to `pressed`) on `window` `blur` and on `document` `visibilitychange` when `document.hidden` (§3) | REQUIRED (pause on blur) | low | **APPROVAL** |
| | | NOT added: `released` set (C2). Loop, `STEP`, `MAX_FRAME`, DPR transform, save/restore, `KeyR` reset, error overlay, HMR accept/dispose all unchanged. 170 → ~183 lines | – | – | – |
| `src/merge.ts` | UNCHANGED | Nested defaults come from `migrate` in `src/core/state.ts`, re-exported by `game.ts` ([[architecture-host-changes-2]] §5) | – | – | – |
| `src/check.ts` | UNCHANGED | Merge assertions stay. New checks go to `src/checks/all.ts` (§3) | – | – | – |
| `index.html` | EDIT (replace) | Whole file per [[architecture-host-changes-2]] §8: title `Last Ember`, description, `theme-color`, `color-scheme`, inline SVG favicon, `background: #000`, `user-select: none`, `outline: none`, `<noscript>`. PLUS the crosshair rule from [[architecture-ui]] §6 appended to the `canvas { … }` style (C1) | REQUIRED (title, black bg); cursor line REQUIRED (no canvas cursor exists) | low | **APPROVAL** ([[architecture-ui]] §6 says so) |
| `vite.config.ts` | UNCHANGED | `defineConfig({ base: './' })` stays; default `assetsInlineLimit` fine ([[architecture-host-changes-2]] §9) | – | – | – |
| `tsconfig.json` | UNCHANGED | `types: ["vite/client"]`, `include` src + `vite.config.ts`. `scripts/` stays outside `include` on purpose (no `@types/node`). `resolveJsonModule` is NOT needed: TS 5.9 `moduleResolution: "bundler"` implies it (verified with `tsc --showConfig`; R-137 downgrades R-045). Add it only for explicitness | OPTIONAL | low | – |
| `package.json` | EDIT | `check` chain and `pack` script (§2). No dependency added | REQUIRED | low | – |
| `.github/workflows/ci.yml` | UNCHANGED (default) | `npm run check` already runs `check-assets.ts` and `src/checks/all.ts`; job name `ci` stays. OPTIONAL: size-budget step after "Verify dist/index.html…" from [[architecture-host-changes-2]] §9, with the limit corrected to 9 MB (C13) | OPTIONAL | low (wrong limit = red CI on first art PR) | **APPROVAL** (CI change via the user's PR flow) |
| `scripts/pack-atlas.ts` | NEW | Node built-ins only (`node:fs`, `node:path`, `node:zlib`, `node:crypto`): collect `art/frames/**/*.png` sorted, decode PNG-32 (5 filters), validate against `SPRITES`, shelf-pack 1024 wide with 1 px extrusion + 1 px gap, POT height ≤ 1024, overflow to `atlas-1.png`, encode (filter 0, `deflateSync` level 9, `zlib.crc32` else table), write sheets + `atlas.json`, skip when the source hash is unchanged, `--watch` with 300 ms debounce ([[architecture-assets-pipeline-2]] §1). Must write the empty seed `atlas.json` when there are no frames (G3) | REQUIRED by slice B | medium (PNG codec by hand) | – |
| `scripts/check-assets.ts` | NEW | Asserts #1–#10 of [[architecture-assets-pipeline-2]] §2 (atlas keys, rects, source hash, PNG IHDR, ogg+m4a pairs or `PENDING_AUDIO`, orphans, containers, budgets §3, loop points, file-name regex). Reads files with `node:fs`; never decodes images or audio | REQUIRED by slice A (must pass on an empty art set) | low | – |

Both scripts import `../src/assets/sprites.ts` and `sounds.ts` (DOM-free, `.ts` extension, erasable syntax only). They are not type-checked by `npm run build` (outside `include`) – accepted ceiling, G5.

## 2. Proposed `package.json` scripts block

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "check": "node src/check.ts && node src/checks/all.ts && node scripts/check-assets.ts && node scripts/check-guard.ts",
    "pack": "node scripts/pack-atlas.ts",
    "zip": "npm run build && cd dist && zip -r ../game.zip ."
  },
```

- **Binding: [[architecture-rulings]] R-040.** `scripts/check-guard.ts` holds the determinism grep guard (R-039: no `node:` imports under `src/`; [[architecture-determinism]] §7). The earlier three-step chain (C18) is superseded.
- Watch mode: `npm run pack -- --watch`. No extra script.
- `engines.node` stays `>=22.18`. CI uses Node 24 (`ci.yml:41`), where type stripping is on by default.

## 3. `src/check.ts` → `src/checks/all.ts` wiring (no globs)

- `node a.ts b.ts` runs only `a.ts`, so each entry gets its own `node` call joined by `&&` (works in POSIX `sh` and `cmd`).
- `src/checks/all.ts` is a static list of side-effect imports, one per check file, then a log line ([[architecture-host-changes-2]] §10):

```ts
// Runs every pure-logic check. Add one import per new *.check.ts file.
import './state.check.ts'
import './rng.check.ts'
import './cave.check.ts'
console.log('checks ok')
```

- No `readdirSync` discovery: `src/` is type-checked with only `vite/client` types, and `node:fs` would need `@types/node`. Ceiling: a forgotten import silently skips a check.
- Each check file throws on failure (the `ok()` pattern, `check.ts:4-6`), so Node exits non-zero.
- Check files import L0–L3 only (plus `src/assets/sprites.ts`/`sounds.ts`, L1). The exact import list is owned by [[architecture-modules-core]] and the other siblings. This area adds NO `*.check.ts` file under the strict rule (C6).

## 4. Asset folder layout

Copied from [[architecture-assets-pipeline]] §2. `GEN` = written by `npm run pack`, committed, never hand-edited or hand-merged.

```
art/                                         committed, NOT bundled
  palettes/global.png zone1.png … zone4.png
  frames/{player,mon,tile,spec,item,prop,ui,fx}/<SpriteId>_<anim>_<nn>.png   PNG-32 frames
public/
  favicon.png                                only if delivered (C14)
src/assets/
  atlas-0.png [atlas-1.png]                  GEN
  atlas.json                                 GEN – 300-line exception #1 (auto-generated) / #2 (one data blob), ~1070 lines at 1064 frames (R-155)
  art/title-keyart.png logo.png help-parry.png help-goal.png   hand-delivered screens, ≤ 960×540, ≤ 250 KB each
  audio/<id>.ogg  audio/<id>.m4a             hand-delivered, both formats per sample
  resources.ts sprites.ts sounds.ts placeholders-{actors,world,ui}.ts images.ts   code, ≤ 300 lines each
```

- Not committed: raw 1024 px generations, WAV masters, `.psd`/`.aseprite`/`.kra` (shared drive).
- Two PRs touching `atlas.json`/`atlas-*.png` conflict by design: rebase, rerun `npm run pack`, commit the output ([[architecture-assets-pipeline-2]] §4).
- Budgets: art ≤ 2 MB, audio ≤ 3 MB per format, `dist/` ≤ 9 MB, JS gzip ≤ 150 KB ([[architecture-assets-pipeline-2]] §3).
- Each asset PR adds a README `AI process` row and a `CHANGELOG.md` `[Unreleased]` entry (AGENTS.md).

## 5. Conflicts and gaps

"Wins" = the side to implement. "Edit" = the KB fix the owning spec needs (not done here: this task writes only these two files). **Status 2026-10-18:** C1, C3, C4, C8, C10, C12, C13, C15 edits are applied in their owning files; C6, C7, C9, C11 are superseded by [[architecture-rulings]] R-043, R-003, R-019 and R-009 (C7: `src/systems/screens.ts` + `src/ui/platform.ts`, NOT `src/ui/screens.ts`); C18 by R-040; G4 closed by R-137.

| Id | Side A | Side B | Wins | Exact edit |
|---|---|---|---|---|
| C1 | `ui_cursor` sprite in the catalog ([[architecture-assets-sprites-3]] §3) | native CSS crosshair, `ui_cursor` dropped ([[architecture-ui]] §6) | B | remove `ui_cursor` from the catalog and `SPRITES`; append the §6 `cursor:` rule to the `canvas` style of the [[architecture-host-changes-2]] §8 replacement |
| C2 | brief "pressed/released edges" ([[architecture-ui]] §5 rule 2) | no `released` set ([[architecture-host-changes]] §1) | B | none; buttons activate on press. Add `released` (3 host lines, spec'd in host §1) only after a playtest misclick report |
| C3 | `last-ember:audio` with group levels ([[architecture-assets-audio]] §8) | `last-ember:settings` `{ volume, muted }` ([[architecture-scoring-and-save]] §6) | B (decided in [[architecture-resources]] §0) | rewrite assets-audio §8 to point at `last-ember:settings`; `settings.reducedFlash` is persisted in the same key |
| C4 | `audio.ts` closes the context in `import.meta.hot.dispose` ([[architecture-assets-pipeline]] §7) | no dispose anywhere, context per page ([[architecture-host-changes]] §2, [[architecture-resources]] §3.1) | B | strike the dispose sentence in pipeline §7; listeners via the `installAudioListeners` trampoline ([[architecture-resources]] §5) |
| C5 | `readSeed(): number \| null`, `parseInt`, `writeSeed(seed: number)`; first run uses `readSeed() ?? randomSeed()` ([[architecture-host-changes-2]] §6) | text seeds `[a-z0-9-]` ≤ 32, `?seed=` pre-fills `ui.seedInput`, `startRun(s, ui.seedInput)` ([[architecture-ui]] §7, [[architecture-ui-2]] §3) | B | host §6: `readSeed(): string \| null` (lower-cased, filtered to `[a-z0-9-]`, sliced to `SEED_MAX_LEN`), `writeSeed(seed: string): void`; numeric hashing stays in core ([[architecture-determinism]] §5) |
| C6 | checks import `src/ui/layout.ts`, `src/render/noise.ts`, `src/audio/trigger.ts` ([[architecture-resources]] §7) | global rule: checks import L0–L3 only | rule | drop those check imports. `trigger.ts` exhaustiveness and `SoundId` validity are already tsc-enforced (`Record<FxEventKind, SoundId \| null>`). `noise.ts` and `danger()`: move to L0/L3 if they need a check (owner decision, open) |
| C7 | copy-link and `?seed` handling in a systems-level screen machine (brief note) | `src/ui/screens.ts` ([[architecture-ui]] §2, [[architecture-ui-2]] §3, [[architecture-host-changes]] §3) | B | `screens.ts` (L4) owns screens, copy link, `readSeed`/`writeSeed` calls; it calls L3 `startRun`. Any `src/systems/screens.ts` in [[architecture-modules-systems]] is dropped |
| C8 | `resources.ts` imports `createAudio` from `../audio/engine.ts` ([[architecture-host-changes]] §2) | type-only imports of `sprites.ts`/`sounds.ts`, data-only registry ([[architecture-resources]] §2) | B | mark host §2 code block superseded by resources §2–3 (L1 must not import L4) |
| C9 | `images.ts`, `placeholders-*.ts` in `src/assets/` ([[architecture-assets-pipeline]] §2) | L1 = data-only registry and manifests | path A, layer rule | keep the paths (packer, globs, check-assets rely on them) but rank these files L4: importable only from `src/render`, `src/ui`, `game.ts`; never from L0–L3 or checks |
| C10 | `src/assets/audio.ts`, `synth.ts`, `synth-2.ts` (pipeline §2) | `src/audio/{engine,mixer,synth,synth-2,music,sfx}.ts` ([[architecture-resources]] §0) | B | update pipeline §2 tree; owned by [[architecture-modules-render]] |
| C11 | systems write `toast(s, text)` and `ui.denyT` "via `ui` helper" ([[architecture-ui-2]] §1, §8) | L3 may not import L4 | rule | put `toast(s, text)` and the deny setter in an L3 file (proposed `src/systems/toast.ts`, pure); `hud.ts` only draws. Owner: [[architecture-modules-systems]] |
| C12 | "audio is procedural, no `.ogg` files" ([[architecture-host-changes-2]] §9) | `.ogg` + `.m4a` samples with synth fallback ([[architecture-assets-pipeline]] §1, §5) | B | strike the sentence in host §9; no config change follows |
| C13 | CI budget 512 KB ([[architecture-host-changes-2]] §9) | `dist/` ≤ 9 MB ([[architecture-assets-pipeline-2]] §3) | B | if the optional step is adopted, use `if(t>9437184)process.exit(1)` and name it `Bundle size budget (9 MB)` |
| C14 | inline SVG favicon ([[architecture-host-changes-2]] §8) | `public/favicon.png` linked as `./favicon.png` ([[architecture-assets-pipeline]] §2) | A for slices A–B | switch the `<link rel="icon">` href to `./favicon.png` in slice C only if the PNG is delivered |
| C15 | `debug: { on: boolean; frameMs: number[] }` ([[architecture-host-changes]] §2, -2 §7) | `debug: { on: boolean }`, frame times in `perf.frameMs: Float32Array` ([[architecture-resources]] §2) | B | `drawDebug` reads FPS from `res.perf` |
| C16 | lazy load on first `drawSprite`/`preload()` ([[architecture-assets-pipeline]] §7–8) | `startPreload(res)` on the first render ([[architecture-resources]] §6) | B | rename in pipeline §7–8 |
| C17 | `atlas.json` imported statically ([[architecture-assets-pipeline]] §5) | "missing files are a non-error" (same §) | – | covered by G3 |
| C18 | `check` = `… && node scripts/check-assets.ts` (pipeline §2) | `check` = `… && node src/checks/all.ts` (host-2 §10) | both | chain all three (§2 above) |

| Gap | Missing | Proposal |
|---|---|---|
| G1 | signatures of `*Layout`, `text`/`panel`/`button`/`keycap`/`ring`, `STR`/`HELP` shapes, `uiStep` return | implementer defines them in slice A and writes them back into [[architecture-ui]] §2 |
| G2 | audio step name and signature (`audioStep` in [[architecture-resources]] §3.1/§5) | taken from [[architecture-resources-2]] via [[architecture-modules-render]]; facade calls it last in `update` |
| G3 | `atlas.json` must exist for `tsc` and Vite before any art | commit `{"version":1,"hash":"<hash of empty set>","sheets":[],"frames":{}}`; `pack-atlas` writes exactly this for zero frames; check-assets #3 then passes |
| G4 | `resolveJsonModule` in `tsconfig.json` not verified (file not read) | verify; add the flag if missing |
| G5 | `scripts/*.ts` not type-checked | accepted; upgrade path: `@types/node` + `tsconfig.scripts.json` |
| G6 | `src/assets/art/` and `audio/` are empty at first | globs return `{}`; title draws its procedural backdrop ([[architecture-ui]] §7) |
| G7 | `storage.ts` signatures | owned by [[architecture-scoring-and-save]] §6 |
| G8 | itch.io dev caveat: host eats `KeyR`, so `r` cannot be typed into the seed field in dev | accepted ([[architecture-ui]] §7) |

## Related

- [[architecture-modules-ui-assets]]
- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-systems]]
- [[architecture-modules-render]]
- [[architecture-host-changes]]
- [[architecture-host-changes-2]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-pipeline-2]]
- [[architecture-assets-sprites-3]]
- [[architecture-assets-audio]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-ui]]
- [[architecture-ui-2]]
- [[architecture-scoring-and-save]]
- [[architecture-determinism]]
- [[architecture-rulings]]
- [[architecture-rulings-3]]
