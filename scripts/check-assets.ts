import { CAVE_DRESSING } from '../src/core/cave-props.ts'
// Asset gate: the two external atlases, atlas.json, screens, audio and budgets. Spec: docs/architecture-assets-pipeline-2.md §2-§3 (checks #1-#11), architecture-assets-pipeline §4, ai-jam-5-asset-formats-25d, R-183, R-184.
// Run from the repo root: `node scripts/check-assets.ts`. Node built-ins only; no image or audio decoding (PNG header bytes, sizes and one sha256).
// Every failure prints one `check failed: ...` line; any failure exits 1. Missing folders (src/assets/art, src/assets/audio) are skipped.
// Wired into `npm run check` (the `check` script in package.json runs this file).
import { GROUND_DETAILS, WALL_DETAILS } from '../src/core/cave-detail.ts'
import { MATERIAL_CHANGE_S } from '../src/core/player-actions.ts'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { verifyTileAssembly } from './check-tileset.ts'
import { SPRITES } from '../src/assets/sprites.ts'
import type { SpriteId } from '../src/assets/sprites.ts'
import { PENDING_AUDIO, SOUNDS } from '../src/assets/sounds.ts'
import type { SoundDef } from '../src/assets/sounds.ts'

const ASSETS = 'src/assets', SCREENS_DIR = ASSETS + '/art', AUDIO = ASSETS + '/audio'
const MB = 1024 * 1024, KB = 1024
const NAME = /^[a-z0-9-]+(_[a-z0-9-]+)*\.(png|ogg|mp3)$/
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const failures: string[] = []
const fail = (msg: string): void => { failures.push('check failed: ' + msg) }

function files(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).sort().flatMap(f => {
    const p = dir + '/' + f
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}
const base = (p: string): string => p.slice(p.lastIndexOf('/') + 1)
const sizeOf = (p: string): number => statSync(p).size

// PNG header: signature, IHDR chunk, then width/height/depth/colour type. Returns null (and records why) when invalid.
type Png = { w: number; h: number; depth: number; colour: number }
function png(path: string, bytes: Buffer): Png | null {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIG) || bytes.toString('latin1', 12, 16) !== 'IHDR') {
    fail(path + ' is not a PNG (bad signature or IHDR)')
    return null
  }
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20), depth: bytes[24], colour: bytes[25] }
}
function rgba(path: string, p: Png | null): void {
  if (p && (p.depth !== 8 || p.colour !== 6)) fail(path + ' must be RGBA 8-bit (colour type 6, depth 8), got type ' + p.colour + ' depth ' + p.depth)
}
function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T } catch (e) { fail(path + ' is missing or not valid JSON: ' + (e as Error).message); return null }
}
type Rect = { x: number; y: number; w: number; h: number }
const isRect = (r: unknown): r is Rect => !!r && ['x', 'y', 'w', 'h'].every(k => Number.isInteger((r as Record<string, number>)[k]))
const inside = (r: Rect, w: number, h: number): boolean => r.x >= 0 && r.y >= 0 && r.w >= 1 && r.h >= 1 && r.x + r.w <= w && r.y + r.h <= h
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// ---- names (#10) ----
const audioFiles = files(AUDIO)
const topPngs = existsSync(ASSETS) ? readdirSync(ASSETS).filter(f => f.endsWith('.png')).sort().map(f => ASSETS + '/' + f) : []
const screenFiles = existsSync(SCREENS_DIR) ? readdirSync(SCREENS_DIR).filter(f => f.endsWith('.png')).sort().map(f => SCREENS_DIR + '/' + f) : []
for (const p of [...topPngs, ...screenFiles, ...audioFiles]) if (!NAME.test(base(p))) fail(p + ' name must match ' + NAME)

// ---- atlas.json (#1, #2): legacy hand-packed frames (none exist at the pivot) plus the `external` list ----
// ponytail: atlas.json version 1 or 2 is accepted while the legacy actor eye sheets and UI art still use atlas.json (OD-D7); tighten to `=== 2` once those sheets are replaced.
type Atlas = { version: number; sheets: { image: string; w: number; h: number }[]; frames: Record<string, number[]>; external?: { image: string; json: string; kind: string }[] }
const IDS = (Object.keys(SPRITES) as SpriteId[]).sort((a, b) => b.length - a.length)
// Frame key '<SpriteId>_<anim>_<nn>': longest known SpriteId prefix (ids contain '-', anims may contain '_').
function parseKey(key: string): { id: SpriteId; anim: string; i: number } | null {
  for (const id of IDS) {
    if (!key.startsWith(id + '_')) continue
    const m = /^(.+)_(\d\d)$/.exec(key.slice(id.length + 1))
    if (m) return { id, anim: m[1], i: Number(m[2]) }
  }
  return null
}
const atlas = readJson<Atlas>(ASSETS + '/atlas.json')
const sheetPaths: string[] = []
const atlasMissing = !atlas ? [] : [
  typeof atlas.version === 'number' ? '' : 'version', Array.isArray(atlas.sheets) ? '' : 'sheets', atlas.frames && typeof atlas.frames === 'object' ? '' : 'frames',
  atlas.external === undefined || Array.isArray(atlas.external) ? '' : 'external (must be an array)',
].filter(Boolean)
if (atlas && atlasMissing.length > 0) fail('atlas.json lacks required key(s): ' + atlasMissing.join(', '))
else if (atlas) {
  if (atlas.version !== 1 && atlas.version !== 2) fail('atlas.json version must be 1 or 2, got ' + atlas.version)
  atlas.sheets.forEach((s, i) => {
    const p = ASSETS + '/' + s.image
    if (!existsSync(p)) fail('atlas.json sheet ' + i + ' ' + s.image + ' is missing on disk')
    else sheetPaths.push(p)
    if (s.w > 1024 || s.h > 1024) fail('atlas.json sheet ' + s.image + ' is ' + s.w + 'x' + s.h + ', max 1024x1024')
  })
  for (const [key, r] of Object.entries(atlas.frames)) {
    const k = parseKey(key)
    if (!k) { fail('atlas.json frame ' + key + ' does not parse to a known SpriteId_anim_nn'); continue }
    const n = SPRITES[k.id].anims[k.anim]?.n
    if (n === undefined || k.i >= n) fail('atlas.json frame ' + key + ' is not a frame of ' + k.id + ' ' + k.anim)
    const s = atlas.sheets[r[0]]
    if (!s) { fail('atlas.json frame ' + key + ' uses missing sheet ' + r[0]); continue }
    if (r.length !== 5 || r.some(v => !Number.isInteger(v) || v < 0) || r[3] < 1 || r[4] < 1 || r[1] + r[3] > s.w || r[2] + r[4] > s.h) {
      fail('atlas.json frame ' + key + ' rect [' + r.join(',') + '] is outside sheet ' + s.image)
    }
  }
  for (const e of atlas.external ?? []) {
    if (e.kind !== 'tileset' && e.kind !== 'characters') fail('atlas.json external ' + e.image + ' has unknown kind ' + e.kind)
    for (const f of [e.image, e.json]) if (!existsSync(ASSETS + '/' + f)) fail('atlas.json external file ' + f + ' is missing in ' + ASSETS)
  }
}
for (const p of sheetPaths) {
  const bytes = readFileSync(p), h = png(p, bytes)
  rgba(p, h)
  if (h && (h.w > 1024 || h.h > 1024)) fail(p + ' is ' + h.w + 'x' + h.h + ', max 1024x1024')
}

// ---- external PNG + JSON pairs: header, JSON size match (#4), file budgets (#8) ----
// Sheet sizes are fixed by the spec (R-183/R-184), never taken from the JSON itself: both the PNG header and the JSON `size` must equal them.
type Size = { w: number; h: number }
const isSize = (s: unknown): s is Size => !!s && Number.isInteger((s as Size).w) && Number.isInteger((s as Size).h)
const TS_SIZE: Size = { w: 1024, h: 1536 }, CH_SIZE: Size = { w: 4096, h: 2048 }
function sheet(pngPath: string, want: Size, maxBytes: number): void {
  if (!existsSync(pngPath)) { fail(pngPath + ' is missing'); return }
  const bytes = readFileSync(pngPath), h = png(pngPath, bytes)
  rgba(pngPath, h)
  if (h && (h.w !== want.w || h.h !== want.h)) fail(pngPath + ' is ' + h.w + 'x' + h.h + ', must be ' + want.w + 'x' + want.h)
  if (bytes.length > maxBytes) fail(pngPath + ' is ' + bytes.length + ' bytes, max ' + maxBytes)
}
const jsonSize = (p: string, max: number): void => { if (existsSync(p) && sizeOf(p) > max) fail(p + ' is ' + sizeOf(p) + ' bytes, max ' + max) }

// ---- tileset (#3) ----
// Names produced by src/render/tileset.ts (capName, faceName, oreName, floorName) and src/render/cracks.ts; duplicated here because render code is not importable (DOM-free L1 rule for checks).
// ponytail: this list mirrors tileset.ts by hand; upgrade by exporting the name table from a DOM-free module if the helpers grow.
const pad2 = (n: number): string => String(n).padStart(2, '0')
const range = (n: number, f: (i: number) => string): string[] => Array.from({ length: n }, (_, i) => f(i))
const TILESET_NAMES = [
  ...GROUND_DETAILS, ...WALL_DETAILS,
  ...range(16, i => 'cap_' + pad2(i)), 'face_pillar', 'face_left', 'face_right', ...range(4, i => 'face_fill_' + i),
  ...['copper', 'sodium', 'strontium', 'resin'].flatMap(m => range(3, i => 'wall_' + m + '_' + pad2(i + 1))), ...range(10, i => 'floor_' + i),
  ...range(4, i => 'ground_crack_' + pad2(i + 1)), ...range(6, i => 'ground_crack_large_' + pad2(i + 1)), ...range(3, i => 'wall_crack_' + pad2(i + 1)), // src/render/cracks.ts
]
const TILESET_CATEGORIES: Record<string, number> = { floor: 10, wall_cap: 19, wall_face: 7, wall_corner_composite: 93, wall_composite: 4, overlay_ground: 94, overlay_wall: 73, ui_resource: 4 }
type Tileset = { frames: Record<string, { frame: Rect; category: string }>; meta: { size: { w: number; h: number }; frame_count: number; png_sha256?: string } }
const TS_PNG = ASSETS + '/cave_tileset.png', TS_JSON = ASSETS + '/cave_tileset.json'
const ts = readJson<Tileset>(TS_JSON)
let tileFrames = 0
if (ts) {
  const missing = [ts.frames && typeof ts.frames === 'object' ? '' : 'frames', isSize(ts.meta?.size) ? '' : 'meta.size'].filter(Boolean)
  if (missing.length > 0) fail('cave_tileset.json lacks required key(s): ' + missing.join(', '))
  else {
    const names = Object.keys(ts.frames)
    tileFrames = names.length
    if (ts.meta.size.w !== TS_SIZE.w || ts.meta.size.h !== TS_SIZE.h) fail('cave_tileset.json meta.size is ' + ts.meta.size.w + 'x' + ts.meta.size.h + ', must be ' + TS_SIZE.w + 'x' + TS_SIZE.h)
    if (ts.meta.frame_count !== 304 || names.length !== 304) fail('cave_tileset.json must hold 304 frames (meta.frame_count ' + ts.meta.frame_count + ', actual ' + names.length + ')')
    const counts: Record<string, number> = {}
    for (const [name, f] of Object.entries(ts.frames)) {
      counts[f.category] = (counts[f.category] ?? 0) + 1
      if (!isRect(f.frame) || !inside(f.frame, TS_SIZE.w, TS_SIZE.h)) fail('cave_tileset.json frame ' + name + ' rect is outside ' + TS_SIZE.w + 'x' + TS_SIZE.h)
    }
    for (const [c, n] of Object.entries(TILESET_CATEGORIES)) if (counts[c] !== n) fail('cave_tileset.json category ' + c + ' must have ' + n + ' frames, has ' + (counts[c] ?? 0))
    for (const c of Object.keys(counts)) if (!(c in TILESET_CATEGORIES)) fail('cave_tileset.json has unknown category ' + c)
    for (const d of CAVE_DRESSING) {
      const f = ts.frames[d.name] as { frame?: Rect; anchor?: number[]; category?: string; collision?: boolean; water?: boolean; draw_layer?: string } | undefined
      const r = f?.frame, layer = f?.category === 'overlay_wall' ? 'wall' : f?.draw_layer?.includes('sorted') ? 'actor' : 'surface'
      if (!r || r.w !== d.w || r.h !== d.h || f?.anchor?.[0] !== d.ax || f?.anchor?.[1] !== d.ay || layer !== d.layer)
        fail('cave dressing metadata mismatch: ' + d.name)
      if (f?.collision !== false || Boolean(f?.water) !== d.water) fail('cave dressing collision/water flags: ' + d.name)
    }
    for (const n of TILESET_NAMES) if (!(n in ts.frames)) fail('cave_tileset.json lacks frame ' + n + ' (needed by src/render/tileset.ts)')
    if (!ts.meta.png_sha256) fail('cave_tileset.json meta.png_sha256 is missing')
    else if (existsSync(TS_PNG) && createHash('sha256').update(readFileSync(TS_PNG)).digest('hex') !== ts.meta.png_sha256) {
      fail('cave_tileset.png sha256 does not match cave_tileset.json meta.png_sha256')
    }
  }
  verifyTileAssembly(ts, fail)
  sheet(TS_PNG, TS_SIZE, 128 * KB)
  jsonSize(TS_JSON, 250 * KB)
}

// ---- characters (#11, R-184) ----
const DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
// Animation mapping table of the game: player set per torch state (entities-player.ts SETS + roll) and monster bodies (entities.ts monsterFrame).
// ponytail: mirrors the render code by hand; upgrade by exporting the table from a DOM-free module if the mapping grows.
const MAPPED = [
  ...['death_with_unlit_torch', 'death_without_torch', 'dodge_roll_no_torch', 'hurt_lit_torch_base', 'hurt_no_torch', 'hurt_unlit_torch', 'idle_lit_torch_base',
    'idle_no_torch', 'idle_unlit_torch', 'material_change_lit_torch_base', 'pickup_lit_torch_base', 'run_lit_torch_base', 'run_without_torch', 'swing_lit_torch_base', 'walk_lit_torch_base'].map(a => 'player/' + a),
  ...['idle', 'walk_forward', 'sprint', 'death'].map(a => 'lurker/' + a),
  ...['idle', 'walk_forward', 'leap', 'death', 'hit'].map(a => 'stalker/' + a),
  ...['idle', 'walk_forward', 'attack', 'death', 'hurt'].map(a => 'devourer/' + a),
  'wisp/fire_loop',
]
type CharFrame = { duration_ms: number; rect: Rect; anchor: { x: number; y: number } }
type Chars = {
  png_sha256: string; format: string; size: { w: number; h: number }; frame_size: { w: number; h: number }; direction_order: string[]; counts: { frames: number }
  palette_panel_rect: Rect; animations: { id: string; frame_count_per_direction: number; directions: Record<string, CharFrame[]> }[]
}
const CH_PNG = ASSETS + '/characters.png', CH_JSON = ASSETS + '/characters.json'
const ch = readJson<Chars>(CH_JSON)
let charFrames = 0
const chMissing = !ch ? [] : [
  isSize(ch.size) ? '' : 'size', isRect(ch.palette_panel_rect) ? '' : 'palette_panel_rect', Array.isArray(ch.animations) ? '' : 'animations',
  ch.counts && typeof ch.counts === 'object' ? '' : 'counts', isSize(ch.frame_size) ? '' : 'frame_size', Array.isArray(ch.direction_order) ? '' : 'direction_order',
].filter(Boolean)
if (ch && chMissing.length > 0) fail('characters.json lacks required key(s): ' + chMissing.join(', '))
else if (ch) {
  if (ch.size.w !== CH_SIZE.w || ch.size.h !== CH_SIZE.h) fail('characters.json size is ' + ch.size.w + 'x' + ch.size.h + ', must be ' + CH_SIZE.w + 'x' + CH_SIZE.h)
  if (ch.format !== 'gamejam-character-atlas-v1') fail('characters.json format must be gamejam-character-atlas-v1, got ' + ch.format)
  if (ch.direction_order.join() !== DIRECTIONS.join()) fail('characters.json direction_order must be ' + DIRECTIONS.join(','))
  const ids = new Set<string>()
  for (const a of ch.animations) {
    ids.add(a.id)
    const directions = a.id === 'wisp/fire_loop' ? ['center', 'left', 'right'] : DIRECTIONS
    const size = a.id === 'wisp/fire_loop' ? 32 : 64
    if (Object.keys(a.directions).join() !== directions.join()) fail('characters.json ' + a.id + ' must have directions ' + DIRECTIONS.join(',') + ' in order')
    for (const [dir, list] of Object.entries(a.directions)) {
      if (list.length !== a.frame_count_per_direction) fail('characters.json ' + a.id + '/' + dir + ' has ' + list.length + ' frames, expected ' + a.frame_count_per_direction)
      for (const f of list) {
        charFrames++
        const where = 'characters.json ' + a.id + '/' + dir
        if (!isRect(f.rect) || !inside(f.rect, CH_SIZE.w, CH_SIZE.h)) fail(where + ' rect is outside ' + CH_SIZE.w + 'x' + CH_SIZE.h)
        else if (f.rect.w !== size || f.rect.h !== size) fail(where + ' frame must be ' + size + 'x' + size)
        else if (overlaps(f.rect, ch.palette_panel_rect)) fail(where + ' rect overlaps palette_panel_rect')
        if (f.anchor?.x !== size / 2 || f.anchor?.y !== size / 2) fail(where + ' pivot must be centred at ' + size / 2)
      }
    }
  }
  for (const [id, ms] of [['walk_lit_torch_base', 1000 / 12], ['run_lit_torch_base', 50], ['run_without_torch', 50]] as const) {
    const clip = ch.animations.find(a => a.id === 'player/' + id)
    if (clip?.frame_count_per_direction !== 8 || Object.values(clip.directions).some(fs => fs.some(f => Math.abs(f.duration_ms - ms) > 1e-6))) fail('v2 locomotion frame count/timing: ' + id)
  }
  const materialFrames = ch.animations.find(a => a.id === 'player/material_change_lit_torch_base')?.directions.south
  if (!materialFrames || Math.abs(materialFrames.reduce((ms, f) => ms + f.duration_ms, 0) / 1000 - MATERIAL_CHANGE_S) > 1e-6) fail('material-change gameplay duration differs from atlas playback')
  if (charFrames !== 1364 || ch.counts.frames !== 1364) fail('characters.json must hold 1364 frames (counts.frames ' + ch.counts.frames + ', actual ' + charFrames + ')')
  for (const id of MAPPED) if (!ids.has(id)) fail('characters.json lacks animation ' + id + ' (used by the animation mapping)')
}
if (ch) {
  if (existsSync(CH_PNG) && createHash('sha256').update(readFileSync(CH_PNG)).digest('hex') !== ch.png_sha256) fail('characters.png hash differs from runtime JSON')
  sheet(CH_PNG, CH_SIZE, 600 * KB)
  jsonSize(CH_JSON, 400 * KB)
}

// ---- screens (#4), art total (#8) ----
let screenBytes = 0
for (const p of screenFiles) {
  const bytes = readFileSync(p), h = png(p, bytes) // palette PNG allowed: signature and size only
  screenBytes += bytes.length
  if (h && (h.w > 960 || h.h > 540)) fail(p + ' is ' + h.w + 'x' + h.h + ', max 960x540')
  if (bytes.length > 250 * KB) fail(p + ' is ' + bytes.length + ' bytes, max 250 KB')
}
if (screenBytes > 0.6 * MB) fail('screens total ' + screenBytes + ' bytes, max 0.6 MB')
const artBytes = [...topPngs, ...screenFiles].reduce((n, p) => n + sizeOf(p), 0)
if (artBytes > 2 * MB) fail('art total ' + artBytes + ' bytes, max 2 MB')

// ---- sounds (#5-#7, #9) ----
const pending = new Set<string>(PENDING_AUDIO)
const used = new Set<string>()
for (const [id, def] of Object.entries(SOUNDS) as [string, SoundDef][]) {
  if (!/^(mus|amb|sfx|ui)_[a-z0-9-]+$/.test(id)) fail('SOUNDS id ' + id + ' must match ^(mus|amb|sfx|ui)_[a-z0-9-]+$')
  if (def.loop && !(def.loop[0] >= 0 && def.loop[0] < def.loop[1])) fail('SOUNDS ' + id + ' loop must satisfy 0 <= start < end')
  for (const f of [...def.file ? [def.file] : [], ...def.layers ?? []]) {
    used.add(f + '.ogg'); used.add(f + '.mp3')
    if (pending.has(id)) continue
    for (const ext of ['ogg', 'mp3']) if (!existsSync(AUDIO + '/' + f + '.' + ext)) fail('SOUNDS ' + id + ' needs ' + AUDIO + '/' + f + '.' + ext + ' (or list it in PENDING_AUDIO)')
  }
}
// Spec deviation (user decision): the pair is Ogg Opus + MP3, not ogg + m4a as in the docs/ snapshot.
// .ogg must be Opus-in-Ogg (an `OpusHead` identification header in the first page, not Vorbis); .mp3 starts with an ID3 tag or an MPEG frame sync.
const audioBytes: Record<string, number> = { ogg: 0, mp3: 0 }
for (const p of audioFiles) {
  const name = base(p), ext = name.slice(name.lastIndexOf('.') + 1)
  if (!used.has(name)) fail(p + ' is not referenced by any SOUNDS entry (orphan audio)')
  if (ext !== 'ogg' && ext !== 'mp3') { fail(p + ' must be .ogg or .mp3'); continue }
  const head = readFileSync(p).subarray(0, 64), size = sizeOf(p)
  if (ext === 'ogg' && head.toString('latin1', 0, 4) !== 'OggS') fail(p + ' does not start with OggS')
  else if (ext === 'ogg' && !head.includes('OpusHead', 0, 'latin1')) fail(p + ' is not Ogg Opus (no OpusHead in the first 64 bytes)')
  if (ext === 'mp3' && head.toString('latin1', 0, 3) !== 'ID3' && !(head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) fail(p + ' has no ID3 tag or MPEG frame sync at byte 0')
  const limit = name.startsWith('mus_beacon-run.') ? 3.1 * MB : 900 * KB
  if (size > limit) fail(p + ' is ' + size + ' bytes, max ' + limit)
  audioBytes[ext] += size
}
// ponytail: raised 3.3 -> 4.6 MB (owner-decision in merge of #161): all 30 audio files (Beacon Run stream + owner-supplied + 11 generated sounds) need ogg 4,091,024 / mp3 4,360,305 B. Upgrade path: re-encode at a lower bitrate or drop generated tracks to restore the old 3.3 MB budget.
for (const [ext, n] of Object.entries(audioBytes)) if (n > 4.6 * MB) fail('audio .' + ext + ' total ' + n + ' bytes, max 4.6 MB')
for (const f of pending) if (!(f in SOUNDS)) fail('PENDING_AUDIO lists unknown sound ' + f)

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('check-assets ok (' + tileFrames + ' tileset frames, ' + charFrames + ' character frames, ' + audioFiles.length + ' audio files)')
