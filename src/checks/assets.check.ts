// L1 manifests only: no image loader, Vite glob, render or audio-engine imports.
import { SPRITES, SCREENS, SHEET_DIRECTIONS, sheetFrameCount, sheetFrameRect, sheetAnimations } from '../assets/sprites.ts'
import type { ActorId } from '../assets/sprites.ts'
import { SOUNDS, PENDING_AUDIO } from '../assets/sounds.ts'
import type { SoundDef } from '../assets/sounds.ts'

function ok(cond: boolean, msg: string): void { if (!cond) throw new Error('assets check: ' + msg) }
function rejects(f: () => unknown, msg: string): void {
  let threw = false
  try { f() } catch { threw = true }
  ok(threw, msg)
}

// No node: import in src/checks (R-039, no @types/node under tsc): fetch node:fs via process.getBuiltinModule (Node >= 22.3), local type.
type Fs = { process: { getBuiltinModule(id: 'node:fs'): { existsSync(p: URL): boolean, readdirSync(p: URL): string[] } } }
const AUDIO_EXT = ['ogg', 'mp3']
// File names in src/assets/audio (same dir the engine globs and scripts/check-assets.ts scans); an absent dir means no files.
function audioDir(): string[] {
  const fs = (globalThis as unknown as Fs).process.getBuiltinModule('node:fs'), dir = new URL('../assets/audio/', import.meta.url)
  return fs.existsSync(dir) ? fs.readdirSync(dir) : []
}

export function run(): void {
  ok(Object.keys(SPRITES).length === 45, '45 catalog sprite ids after orphan removals')
  let frames = 0
  for (const [id, def] of Object.entries(SPRITES)) {
    ok(/^[a-z0-9-]+(_[a-z0-9-]+)*$/.test(id), 'sprite id spelling ' + id)
    ok(def.w > 0 && def.h > 0 && def.px >= 0 && def.px <= def.w && def.py >= 0 && def.py <= def.h, 'canvas and pivot ' + id)
    const actor = id.startsWith('player_') || id.startsWith('mon_')
    if (actor) ok(def.w === 64 && def.h === 64 && def.px === 32 && def.py === 32, 'actor canvas ' + id)
    for (const [key, a] of Object.entries(def.anims)) {
      frames += a.n
      ok(Number.isInteger(a.n) && a.n > 0 && a.fps >= 0, 'valid animation ' + id + ' ' + key)
      if (id === 'player_body-torch') ok(a.torchTips?.length === a.n, 'reference tip per fallback frame')
      else ok(!a.torchTips, 'no tips on other ids')
      if (!actor) continue
      const action = key.slice(0, key.lastIndexOf('-'))
      for (const d of SHEET_DIRECTIONS) ok(!!def.anims[action + '-' + d], 'all directions for ' + id + ' ' + action)
    }
  }
  ok(frames === 1064, 'catalog fallback frame count; delivered sheets can have different counts')
  ok(!('player_torch' in SPRITES) && !('ui_cursor' in SPRITES) && !SPRITES.prop_stalagmite.r, 'retired sprites and non-solid decor')
  ok(SCREENS.keyart === 'title-keyart', 'screen file naming')
  ok(SHEET_DIRECTIONS.join(',') === 'n,ne,e,se,s,sw,w,nw', 'user sheet row order')
  for (const n of [1, 2, 4, 6, 9, 16]) {
    ok(sheetFrameCount(64 * n, 512) === n, 'infer width, including added/removed frames')
    for (const [row, d] of SHEET_DIRECTIONS.entries()) {
      ok(JSON.stringify(sheetFrameRect(64 * n, 512, d, n - 1)) === JSON.stringify([(n - 1) * 64, row * 64, 64, 64]), 'source rect ' + d)
    }
    for (const id of ['player_body', 'player_body-torch', 'mon_lurker', 'mon_stalker', 'mon_devourer'] as const) {
      const action = id.startsWith('player_') ? 'walk' : 'lunge', resolved = sheetAnimations(id, action, 64 * n, 512)
      for (const d of SHEET_DIRECTIONS) {
        const key = action + '-' + d, a = resolved[key], base = SPRITES[id].anims[key]
        ok(a.n === n && a.fps === base.fps && a.loop === base.loop, 'count changes preserve timing')
        if (id === 'player_body-torch') ok(a.torchTips?.length === n, 'reference tips adapt to frame count')
        ok(base.n === (id.startsWith('player_') ? 4 : 3), 'source resolution does not mutate manifest')
      }
    }
  }
  for (const [w, h] of [[0, 512], [65, 512], [128, 511], [128, 1024], [-64, 512], [Infinity, 512], [64.5, 512]]) {
    rejects(() => sheetFrameCount(w, h), 'malformed sheet dimensions')
  }
  rejects(() => sheetFrameRect(128, 512, 'n', 2), 'out-of-range frame')
  rejects(() => sheetFrameRect(128, 512, 'n', -1), 'negative frame')
  rejects(() => sheetAnimations('mon_lurker', 'unknown', 64, 512), 'unknown action')
  rejects(() => sheetAnimations('tile_z1_floor' as ActorId, 'v', 64, 512), 'non-actor sheet')
  rejects(() => sheetAnimations('player_body-torch', 'walk', 128, 512, { n: [[10, 20]] }), 'wrong tip count')
  rejects(() => sheetAnimations('player_body-torch', 'walk', 64, 512, { n: [[64, 20]] }), 'out-of-canvas tip')
  rejects(() => sheetAnimations('player_body', 'walk', 64, 512, { n: [[10, 20]] }), 'tips forbidden on no-torch set')
  ok(sheetAnimations('player_body-torch', 'walk', 64, 512, { n: [[10, 20]] })['walk-n'].torchTips?.[0][0] === 10, 'measured tip override')

  ok(Object.keys(SOUNDS).length === 45, '45 sound ids')
  const pending = new Set<string>(PENDING_AUDIO), files = new Set<string>()
  ok(pending.size === PENDING_AUDIO.length, 'duplicate PENDING_AUDIO id')
  const onDisk = new Set(audioDir())
  const owned = new Set<string>()
  for (const [id, raw] of Object.entries(SOUNDS)) {
    const s: SoundDef = raw
    ok(/^(mus|amb|sfx|ui)_[a-z0-9-]+$/.test(id), 'sound id spelling ' + id)
    ok(s.gain >= 0 && s.gain <= 1 && Number.isInteger(s.cap) && s.cap > 0, 'gain and voice cap ' + id)
    if (s.loop) ok(s.loop[0] >= 0 && s.loop[1] > s.loop[0], 'sample loop points ' + id)
    const own = [...s.file ? [s.file] : [], ...s.layers ?? []]
    // Pending iff at least one of its .ogg/.mp3 files is missing: delivery must shrink PENDING_AUDIO, a missing file must be listed.
    const missing = own.flatMap((f) => AUDIO_EXT.map((e) => f + '.' + e)).filter((n) => !onDisk.has(n))
    if (own.length > 0) ok(pending.has(id) === missing.length > 0, pending.has(id)
      ? 'sample ' + id + ' is in PENDING_AUDIO but all its files exist; remove it from PENDING_AUDIO'
      : 'sample ' + id + ' is missing ' + missing.join(', ') + '; add it to PENDING_AUDIO')
    for (const f of own) { files.add(f); for (const e of AUDIO_EXT) owned.add(f + '.' + e) }
  }
  for (const id of pending) {
    const s = (SOUNDS as Record<string, SoundDef>)[id]
    ok(!!s && !!(s.file || s.layers), 'PENDING_AUDIO id is not a known sample sound ' + id)
  }
  // A file is allowed only if some id references it via file/layers (no reserved-slot allowance: the
  // generated mus_title/mus_descent/mus_escape files were removed when master #161 repointed those ids to mus_beacon-run).
  for (const n of onDisk) {
    ok(owned.has(n), 'orphan audio file ' + n + ' (no SOUNDS id owns it)')
  }
  ok(files.size === 15 && !('sfx_parry-perfect-ring' in SOUNDS), 'internal ring layer is a file, not a SoundId')
  ok(!('sfx_step' in SOUNDS) && !('sfx_roll-ready' in SOUNDS) && !('ui_hover' in SOUNDS), 'orphan sounds removed')
  ok(SOUNDS.mus_descent.stream && SOUNDS.mus_descent.loop[1] === 480, 'full eight-minute owner score streams')
}
