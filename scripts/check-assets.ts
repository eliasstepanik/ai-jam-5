// Asset gate: manifest vs files on disk. Spec: docs/architecture-assets-pipeline-2.md §2, architecture-modules-ui-assets-2 (check-assets), R-043.
// Run from the repo root: `node scripts/check-assets.ts`. Node built-ins only; no image or audio decoding (headers and sizes only).
// Every failure prints one `check failed: ...` line; any failure exits 1. Missing folders (art/, audio/) are skipped: an empty art set passes.
// Not wired into `npm run check` until C8 (docs/tasks.md).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { SHEET_DIRECTIONS, SPRITES } from '../src/assets/sprites.ts'
import type { SpriteId } from '../src/assets/sprites.ts'
import { PENDING_AUDIO, SOUNDS } from '../src/assets/sounds.ts'
import type { SoundDef } from '../src/assets/sounds.ts'

const ASSETS = 'src/assets', FRAMES = ASSETS + '/art/frames', SCREENS_DIR = ASSETS + '/art', AUDIO = ASSETS + '/audio'
const MB = 1024 * 1024, KB = 1024
const NAME = /^[a-z0-9-]+(_[a-z0-9-]+)*\.(png|ogg|m4a)$/
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

// Frame key '<SpriteId>_<anim>_<nn>': match the longest known SpriteId prefix (ids contain '-', anims may contain '_').
const IDS = (Object.keys(SPRITES) as SpriteId[]).sort((a, b) => b.length - a.length)
function parseKey(key: string): { id: SpriteId; anim: string; i: number } | null {
  for (const id of IDS) {
    if (!key.startsWith(id + '_')) continue
    const m = /^(.+)_(\d\d)$/.exec(key.slice(id.length + 1))
    if (m) return { id, anim: m[1], i: Number(m[2]) }
  }
  return null
}
const sizeOf = (p: string): number => statSync(p).size

// ---- names ----
const frameFiles = files(FRAMES), audioFiles = files(AUDIO)
const sheetFiles = existsSync(ASSETS) ? readdirSync(ASSETS).filter(f => /^atlas-.*\.png$/.test(f)).sort().map(f => ASSETS + '/' + f) : []
const screenFiles = existsSync(SCREENS_DIR) ? readdirSync(SCREENS_DIR).filter(f => f.endsWith('.png')).sort().map(f => SCREENS_DIR + '/' + f) : []
for (const p of [...frameFiles, ...screenFiles, ...audioFiles]) if (!NAME.test(base(p))) fail(p + ' name must match ' + NAME)

// ---- atlas.json ----
type Atlas = { version: number; hash: string; sheets: { image: string; w: number; h: number }[]; frames: Record<string, number[]> }
const atlas = JSON.parse(readFileSync(ASSETS + '/atlas.json', 'utf8')) as Atlas
if (atlas.sheets.length > 4) fail('atlas.json lists ' + atlas.sheets.length + ' sheets, max 4')
atlas.sheets.forEach((s, i) => {
  if (!existsSync(ASSETS + '/' + s.image)) fail('atlas.json sheet ' + i + ' ' + s.image + ' is missing on disk')
  if (s.w > 1024 || s.h > 1024) fail('atlas.json sheet ' + s.image + ' is ' + s.w + 'x' + s.h + ', max 1024x1024')
})
const bySet = new Map<string, Set<string>>() // SpriteId -> frame keys present
for (const [key, r] of Object.entries(atlas.frames)) {
  const k = parseKey(key)
  if (!k) { fail('atlas.json frame ' + key + ' does not parse to a known SpriteId_anim_nn'); continue }
  const n = SPRITES[k.id].anims[k.anim]?.n
  if (n === undefined) fail('atlas.json frame ' + key + ' names unknown anim ' + k.anim)
  // ponytail: index bound is the catalog n; delivered actor sheets with more frames need sheetAnimations to widen it. Upgrade with C-slice art.
  else if (k.i >= n) fail('atlas.json frame ' + key + ' index ' + k.i + ' >= catalog n ' + n)
  const s = atlas.sheets[r[0]]
  if (!s) { fail('atlas.json frame ' + key + ' uses missing sheet ' + r[0]); continue }
  if (r.length !== 5 || r.some(v => !Number.isInteger(v) || v < 0) || r[3] < 1 || r[4] < 1 || r[1] + r[3] > s.w || r[2] + r[4] > s.h) {
    fail('atlas.json frame ' + key + ' rect [' + r.join(',') + '] is outside sheet ' + s.image)
  }
  bySet.set(k.id, (bySet.get(k.id) ?? new Set()).add(key))
}

// ---- art/frames ----
const hash = createHash('sha1')
let artBytes = 0
for (const p of [...frameFiles].sort((a, b) => (base(a) < base(b) ? -1 : 1))) {
  const bytes = readFileSync(p), name = base(p)
  hash.update(name).update(bytes)
  artBytes += bytes.length
  const h = png(p, bytes)
  rgba(p, h)
  const k = parseKey(name.replace(/\.png$/, ''))
  if (!k) { fail(p + ' does not parse to a known SpriteId_anim_nn (orphan frame)'); continue }
  const d = SPRITES[k.id], n = d.anims[k.anim]?.n
  if (n === undefined || k.i >= n) fail(p + ' is not a frame of ' + k.id + ' ' + k.anim + ' (orphan frame)')
  if (h && (h.w !== d.w || h.h !== d.h)) fail(p + ' is ' + h.w + 'x' + h.h + ', manifest says ' + d.w + 'x' + d.h)
  if (!p.startsWith(FRAMES + '/' + k.id.split('_')[0] + '/')) fail(p + ' must live in ' + FRAMES + '/' + k.id.split('_')[0] + '/')
}
if (atlas.hash !== hash.digest('hex')) fail('atlas.json hash is stale: rerun the packer (art/frames changed)')

// ---- sheets, screens ----
let sheetBytes = 0
for (const p of sheetFiles) {
  const bytes = readFileSync(p), h = png(p, bytes)
  rgba(p, h)
  sheetBytes += bytes.length
  if (h && (h.w > 1024 || h.h > 1024)) fail(p + ' is ' + h.w + 'x' + h.h + ', max 1024x1024')
}
let screenBytes = 0
for (const p of screenFiles) {
  const bytes = readFileSync(p), h = png(p, bytes) // palette PNG allowed: signature and size only
  screenBytes += bytes.length
  if (h && (h.w > 960 || h.h > 540)) fail(p + ' is ' + h.w + 'x' + h.h + ', max 960x540')
  if (bytes.length > 250 * KB) fail(p + ' is ' + bytes.length + ' bytes, max 250 KB')
}
if (sheetBytes > 1.2 * MB) fail('atlas sheets total ' + sheetBytes + ' bytes, max 1.2 MB')
if (screenBytes > 0.6 * MB) fail('screens total ' + screenBytes + ' bytes, max 0.6 MB')
if (artBytes + sheetBytes + screenBytes > 2 * MB) fail('art total ' + (artBytes + sheetBytes + screenBytes) + ' bytes, max 2 MB')

// ---- sounds ----
const pending = new Set<string>(PENDING_AUDIO)
const used = new Set<string>()
for (const [id, def] of Object.entries(SOUNDS) as [string, SoundDef][]) {
  if (!/^(mus|amb|sfx|ui)_[a-z0-9-]+$/.test(id)) fail('SOUNDS id ' + id + ' must match ^(mus|amb|sfx|ui)_[a-z0-9-]+$')
  if (def.loop && !(def.loop[0] >= 0 && def.loop[0] < def.loop[1])) fail('SOUNDS ' + id + ' loop must satisfy 0 <= start < end')
  for (const f of [...def.file ? [def.file] : [], ...def.layers ?? []]) {
    used.add(f + '.ogg'); used.add(f + '.m4a')
    if (pending.has(id)) continue
    for (const ext of ['ogg', 'm4a']) if (!existsSync(AUDIO + '/' + f + '.' + ext)) fail('SOUNDS ' + id + ' needs ' + AUDIO + '/' + f + '.' + ext + ' (or list it in PENDING_AUDIO)')
  }
}
const audioBytes: Record<string, number> = { ogg: 0, m4a: 0 }
for (const p of audioFiles) {
  const name = base(p), ext = name.slice(name.lastIndexOf('.') + 1)
  if (!used.has(name)) fail(p + ' is not referenced by any SOUNDS entry (orphan audio)')
  if (ext !== 'ogg' && ext !== 'm4a') { fail(p + ' must be .ogg or .m4a'); continue }
  const head = readFileSync(p).subarray(0, 12), size = sizeOf(p)
  if (ext === 'ogg' && head.toString('latin1', 0, 4) !== 'OggS') fail(p + ' does not start with OggS')
  if (ext === 'm4a' && head.toString('latin1', 4, 8) !== 'ftyp') fail(p + ' has no ftyp box at byte 4')
  if (size > 900 * KB) fail(p + ' is ' + size + ' bytes, max 900 KB')
  audioBytes[ext] += size
}
for (const [ext, n] of Object.entries(audioBytes)) if (n > 3.3 * MB) fail('audio .' + ext + ' total ' + n + ' bytes, max 3.3 MB')
for (const f of pending) if (!(f in SOUNDS)) fail('PENDING_AUDIO lists unknown sound ' + f)

// ---- player sets ----
for (const id of ['player_body', 'player_body-torch'] as const) {
  const d = SPRITES[id], actions = new Set(Object.keys(d.anims).map(a => a.slice(0, a.lastIndexOf('-'))))
  if (d.w !== 64 || d.h !== 64 || d.px !== 32 || d.py !== 32) fail(id + ' must be 64x64 with pivot (32,32)')
  for (const action of actions) for (const dir of SHEET_DIRECTIONS) {
    const a = d.anims[action + '-' + dir]
    if (!a) { fail(id + ' lacks anim ' + action + '-' + dir); continue }
    if (action === 'walk' && a.n !== 4) fail(id + ' walk-' + dir + ' must have 4 frames, has ' + a.n)
    if (id === 'player_body-torch') {
      const tips = a.torchTips
      if (!tips || tips.length !== a.n) fail(id + ' ' + action + '-' + dir + ' needs ' + a.n + ' torch tips, has ' + (tips?.length ?? 0))
      else if (tips.some(([x, y]) => !(x >= 0 && x < 64 && y >= 0 && y < 64))) fail(id + ' ' + action + '-' + dir + ' has a torch tip outside the 64x64 canvas')
    }
  }
  const present = bySet.get(id)
  if (present) for (const action of actions) for (const dir of SHEET_DIRECTIONS) {
    if (![...present].some(k => k.startsWith(id + '_' + action + '-' + dir + '_'))) fail('atlas.json ' + id + ' lacks frames for ' + action + '-' + dir)
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('check-assets ok (' + Object.keys(atlas.frames).length + ' atlas frames, ' + frameFiles.length + ' source frames, ' + audioFiles.length + ' audio files)')
