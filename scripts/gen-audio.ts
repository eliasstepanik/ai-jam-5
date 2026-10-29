// Audio sample generator: renders audition candidates through a ComfyUI server and installs the picked ones into the repo.
// Run from the repo root: `node scripts/gen-audio.ts [--only id,id] [--force] [--dry-run] [--pick] [--help]` (Node >= 22.18, built-ins only).
// Audition flow: (1) generate: `COMFY_URL=http://<host>:8188 node scripts/gen-audio.ts` writes `candidates` takes per sound to tools/audio-raw/<id>_s<seed>.ogg|.mp3;
// (2) listen to tools/audio-raw; (3) set `chosenSeed` of the winning take in tools/audio-manifest.json; (4) `node scripts/gen-audio.ts --pick` copies the picked takes to src/assets/audio/<id>.ogg|.mp3.
// Candidate c (0-based) of sound index i uses seed = baseSeed + 100 * i + c. The server address comes only from the COMFY_URL environment variable and is never stored in the repo.
// Test overrides: GEN_AUDIO_MANIFEST (manifest path) and GEN_AUDIO_OUT (root for tools/audio-raw and src/assets/audio instead of the cwd).
// ponytail: the saved files embed the ComfyUI workflow JSON as metadata (about 4 KB each, no host address) and are not stripped; ceiling about 3.8 KB x 2 x 15 files, fine against the 3.3 MB budget. Strip with ffmpeg -map_metadata -1 if the budget gets tight.
// ponytail: candidates run strictly one after another (the ComfyUI queue is serial anyway); parallel submit only if generation time becomes the bottleneck.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

type Sound = { id: string; kind: 'music' | 'amb' | 'sfx'; tags: string; lyrics: string; bpm: number; keyscale: string; duration: number; trim?: number; loopFade?: number; peakDb?: number; fadeIn: number; fadeOut: number; chosenSeed: number | null }
type Manifest = { version: 1; workflow: string; baseSeed: number; candidates: number; sounds: Sound[] }
type Node = { class_type?: string; inputs: Record<string, unknown>; _meta?: { title?: string } }
type Workflow = Record<string, Node>
type FileRef = { filename: string; subfolder: string; type: string }
type Opts = { help: boolean; dryRun: boolean; pick: boolean; force: boolean; only: string[] | null }

const MANIFEST = process.env.GEN_AUDIO_MANIFEST ?? 'tools/audio-manifest.json'
const OUT = process.env.GEN_AUDIO_OUT ?? '.'
const RAW = join(OUT, 'tools/audio-raw'), INSTALL = join(OUT, 'src/assets/audio')
const POLL_MS = 1500, TIMEOUT_MS = 10 * 60 * 1000
const ID = /^[a-z0-9-]+(_[a-z0-9-]+)*$/
const USAGE = `usage: node scripts/gen-audio.ts [options]
  (no option)      generate candidates for every sound; existing raw .ogg+.mp3 pairs are skipped
  --only a,b       restrict to these sound ids
  --force          regenerate candidates even if the raw files exist
  --dry-run        print the plan, no network, COMFY_URL not needed
  --pick           install the chosenSeed takes from tools/audio-raw into src/assets/audio
  --help           show this text
env: COMFY_URL=http://<host>:8188 (required to generate)`

function die(msg: string, code = 2): never { console.error('gen-audio: ' + msg); process.exit(code) }

export function parseArgs(argv: string[]): Opts {
  const o: Opts = { help: false, dryRun: false, pick: false, force: false, only: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') o.help = true
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--pick') o.pick = true
    else if (a === '--force') o.force = true
    else if (a === '--only') {
      const v = argv[++i]
      if (!v || v.startsWith('--')) die('--only needs a comma separated id list')
      o.only = v.split(',').filter(Boolean)
    } else die('unknown argument ' + a + '\n' + USAGE)
  }
  return o
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000
const seedOf = (m: Manifest, i: number, c: number): number => m.baseSeed + 100 * i + c

function loadManifest(): Manifest {
  let m: Manifest
  try { m = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest } catch (e) { return die(MANIFEST + ' is missing or not valid JSON: ' + (e as Error).message) }
  if (m.version !== 1 || !Number.isInteger(m.baseSeed) || !Number.isInteger(m.candidates) || m.candidates < 1 || typeof m.workflow !== 'string' || !Array.isArray(m.sounds)) die(MANIFEST + ': bad header (need version 1, workflow, integer baseSeed, candidates >= 1, sounds[])')
  const seen = new Set<string>()
  for (const s of m.sounds) {
    const bad = (why: string): never => die(MANIFEST + ': sound ' + JSON.stringify(s.id) + ' ' + why)
    if (typeof s.id !== 'string' || !ID.test(s.id)) bad('id must match ' + ID)
    if (seen.has(s.id)) bad('is duplicated')
    seen.add(s.id)
    if (!['music', 'amb', 'sfx'].includes(s.kind)) bad('kind must be music|amb|sfx')
    if (typeof s.tags !== 'string' || typeof s.lyrics !== 'string' || typeof s.keyscale !== 'string') bad('tags, lyrics and keyscale must be strings')
    for (const k of ['bpm', 'duration', 'fadeIn', 'fadeOut'] as const) if (!Number.isFinite(s[k])) bad(k + ' must be a number')
    for (const k of ['trim', 'peakDb'] as const) if (s[k] !== undefined && !Number.isFinite(s[k])) bad(k + ' must be a number when present')
    if (s.chosenSeed !== null && !Number.isInteger(s.chosenSeed)) bad('chosenSeed must be null or an integer')
  }
  return m
}

// Titles are unique in the workflow; a missing or duplicated title is a workflow bug, so fail loudly.
function nodeByTitle(wf: Workflow, title: string): [string, Node] {
  const hits = Object.entries(wf).filter(([, n]) => n._meta?.title === title)
  if (hits.length !== 1) die('workflow needs exactly one node titled ' + JSON.stringify(title) + ', found ' + hits.length)
  return hits[0]
}

export function buildPrompt(base: Workflow, s: Sound, seed: number): Workflow {
  if (s.duration < 1) die(s.id + ': duration ' + s.duration + ' s is below the ACE minimum of 1 s')
  // ACE cannot render under 1 s, so short SFX render s.duration and are cut to s.trim (default: s.duration).
  const trim = s.trim ?? s.duration
  if (!(trim > 0 && trim <= s.duration)) die(s.id + ': trim ' + trim + ' s must be in (0, duration]')
  // Loops: loopFade > 0 renders loopFade extra seconds and bakes an equal-power crossfade of that tail onto the head, so the file ends where the raw take continues into its start; final length = trim - loopFade.
  const lf = s.loopFade ?? 0
  if (lf < 0 || (lf > 0 && !(lf >= 0.5 && 2 * lf < trim))) die(s.id + ': loopFade ' + lf + ' s must be 0 or in [0.5, trim/2)')
  const len = round3(trim - lf)
  const hold = round3(len - s.fadeIn - s.fadeOut)
  if (s.fadeIn < 0 || s.fadeOut < 0 || hold < 0) die(s.id + ': fadeIn + fadeOut exceed ' + trim + ' s')
  const wf = structuredClone(base)
  const set = (title: string, inputs: Record<string, unknown>): void => { Object.assign(nodeByTitle(wf, title)[1].inputs, inputs) }
  set('Prompt', { tags: s.tags, lyrics: s.lyrics, seed, bpm: s.bpm, duration: s.duration, keyscale: s.keyscale })
  set('Latent Seconds', { seconds: s.duration })
  set('Sampler', { seed })
  set('Trim', { duration: trim })
  if (s.peakDb !== undefined) set('Normalize', { peak_level: round3(10 ** (s.peakDb / 20)) })
  // The three envelopes must sum to the Trim duration; ComfyUI takes them as strings.
  // The fade nodes are fixed-phase sine envelopes (in: phase 270, out: phase 90, amp 0.5, dc 0.5). They are a clean
  // half-cosine 0->1 / 1->0 only when frequency = 1/(2*D) for their duration D, so set it with every duration.
  // ponytail: fade frequency range is 1 Hz (D = 0.5 s) to 100 Hz (D = 0.005 s); outside it we die (also avoids 1/0 for D = 0). Widen only after checking the node's frequency limits.
  for (const [title, d] of [['Fade In Env', s.fadeIn], ['Fade Out Env', s.fadeOut]] as const) {
    if (!(round3(d) >= 0.005 && round3(d) <= 0.5)) die(s.id + ': ' + title + ' duration ' + d + ' s is outside 0.005..0.5 s (envelope frequency 100..1 Hz)')
    set(title, { duration: String(round3(d)), frequency: 1 / (2 * round3(d)) })
  }
  set('Hold Env', { duration: String(hold) })
  if (lf > 0) {
    set('Loop Head', { start_index: 0, duration: lf })
    set('Loop Tail', { start_index: len, duration: lf })
    set('Loop Rest', { start_index: lf, duration: round3(len - lf) })
    // Quarter-period sines: frequency 1/(4*lf); phase 0 rises 0->1 over lf, phase 90 falls 1->0.
    for (const t of ['Loop Env In', 'Loop Env Out']) set(t, { duration: String(lf), frequency: 1 / (4 * lf) })
    // Loops skip the 5 ms edge envelopes (they would notch the seam): Normalize reads the joined loop directly, so the envelope nodes are never executed.
    nodeByTitle(wf, 'Normalize')[1].inputs.audio = [nodeByTitle(wf, 'Loop Join')[0], 0]
  } else for (const [k, n] of Object.entries(wf)) if (n._meta?.title?.startsWith('Loop ')) delete wf[k]
  const prefix = 'audio/lastember_' + s.id + '_s' + seed
  set('Save MP3', { filename_prefix: prefix + '_mp3' })
  set('Save Opus', { filename_prefix: prefix + '_opus' })
  return wf
}

// ---- byte validators (the Opus file has extension .opus but is an Ogg-Opus container) ----
export const isOggOpus = (b: Uint8Array): boolean => b.length > 64 && Buffer.from(b.subarray(0, 4)).toString('latin1') === 'OggS' && Buffer.from(b.subarray(0, 64)).includes('OpusHead')
export const isMp3 = (b: Uint8Array): boolean => b.length > 4 && ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))

export const viewUrl = (base: string, f: FileRef): string => base + '/view?filename=' + encodeURIComponent(f.filename) + '&subfolder=' + encodeURIComponent(f.subfolder) + '&type=' + encodeURIComponent(f.type)

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms))
const clip = (v: unknown, n = 800): string => { const t = typeof v === 'string' ? v : JSON.stringify(v); return t.length > n ? t.slice(0, n) + '...' : t }

async function submit(base: string, prompt: Workflow, clientId: string): Promise<string> {
  const res = await fetch(base + '/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, client_id: clientId }) })
  const body = await res.json().catch(() => ({})) as { prompt_id?: string; error?: { message?: string; details?: string }; node_errors?: unknown }
  if (!res.ok || !body.prompt_id) throw new Error('POST /prompt -> ' + res.status + ': ' + clip(body.error?.message ?? '') + ' ' + clip(body.error?.details ?? '') + ' node_errors=' + clip(body.node_errors ?? {}))
  return body.prompt_id
}

type Done = { outputs?: Record<string, { audio?: FileRef[] }>; status?: { status_str?: string; messages?: unknown } }
async function waitDone(base: string, id: string): Promise<Done> {
  const end = Date.now() + TIMEOUT_MS
  while (Date.now() < end) {
    const res = await fetch(base + '/history/' + encodeURIComponent(id))
    if (!res.ok) throw new Error('GET /history -> ' + res.status)
    const h = await res.json() as Record<string, Done>
    const d = h[id]
    if (d) {
      if (d.status?.status_str === 'error') throw new Error('server reported error: ' + clip(d.status.messages))
      return d
    }
    await sleep(POLL_MS)
  }
  throw new Error('timeout after ' + TIMEOUT_MS / 60000 + ' min')
}

async function download(base: string, f: FileRef): Promise<Buffer> {
  const res = await fetch(viewUrl(base, f))
  if (!res.ok) throw new Error('GET /view ' + f.filename + ' -> ' + res.status)
  return Buffer.from(await res.arrayBuffer())
}

async function generate(base: string, wf: Workflow, s: Sound, seed: number): Promise<void> {
  const done = await waitDone(base, await submit(base, buildPrompt(wf, s, seed), randomUUID()))
  const ref = (title: string): FileRef => {
    const f = done.outputs?.[nodeByTitle(wf, title)[0]]?.audio?.[0]
    if (!f) throw new Error('no audio output from node ' + JSON.stringify(title))
    return f
  }
  const [mp3, ogg] = [await download(base, ref('Save MP3')), await download(base, ref('Save Opus'))]
  if (!isMp3(mp3)) throw new Error('downloaded MP3 failed validation (no ID3 tag or frame sync)')
  if (!isOggOpus(ogg)) throw new Error('downloaded Opus failed validation (no OggS/OpusHead)')
  mkdirSync(RAW, { recursive: true })
  writeFileSync(join(RAW, s.id + '_s' + seed + '.mp3'), mp3)
  writeFileSync(join(RAW, s.id + '_s' + seed + '.ogg'), ogg)
}

async function runGenerate(m: Manifest, sounds: [Sound, number][], o: Opts): Promise<number> {
  const wf = JSON.parse(readFileSync(resolve(m.workflow), 'utf8')) as Workflow
  const jobs: { s: Sound; seed: number; skip: boolean }[] = []
  for (const [s, i] of sounds) for (let c = 0; c < m.candidates; c++) {
    const seed = seedOf(m, i, c), stem = join(RAW, s.id + '_s' + seed)
    buildPrompt(wf, s, seed) // validates workflow titles and durations before any network call
    jobs.push({ s, seed, skip: !o.force && existsSync(stem + '.ogg') && existsSync(stem + '.mp3') })
  }
  if (o.dryRun) {
    for (const j of jobs) console.log((j.skip ? 'skip ' : 'gen  ') + j.s.id + ' seed ' + j.seed + ' ' + j.s.duration + 's -> tools/audio-raw/' + j.s.id + '_s' + j.seed + '.ogg|.mp3')
    console.log('dry run: ' + jobs.filter(j => !j.skip).length + ' request(s) would be sent, ' + jobs.filter(j => j.skip).length + ' skipped')
    return 0
  }
  const url = process.env.COMFY_URL?.replace(/\/+$/, '')
  if (!url || !/^https?:\/\//.test(url)) die('set COMFY_URL to the ComfyUI base address, e.g. http://<host>:8188')
  let ok = 0, skipped = 0
  const failed: string[] = []
  for (const [n, j] of jobs.entries()) {
    const tag = '[' + (n + 1) + '/' + jobs.length + '] ' + j.s.id + ' seed ' + j.seed
    if (j.skip) { skipped++; console.log(tag + ' skipped (raw files exist)'); continue }
    try { await generate(url, wf, j.s, j.seed); ok++; console.log(tag + ' ok') } catch (e) { failed.push(j.s.id + '_s' + j.seed); console.log(tag + ' FAILED: ' + (e as Error).message) }
  }
  console.log('summary: ' + ok + ' generated, ' + skipped + ' skipped, ' + failed.length + ' failed' + (failed.length ? ' (' + failed.join(', ') + ')' : ''))
  return failed.length ? 1 : 0
}

function runPick(sounds: [Sound, number][], dry: boolean): number {
  const picks = sounds.filter(([s]) => s.chosenSeed !== null).map(([s]) => s)
  if (!picks.length) { console.log('nothing to install: no sound has chosenSeed set in ' + MANIFEST); return 0 }
  const missing: string[] = []
  const plan = picks.flatMap(s => ['ogg', 'mp3'].map(ext => ({ s, from: join(RAW, s.id + '_s' + s.chosenSeed + '.' + ext), to: join(INSTALL, s.id + '.' + ext), ext })))
  for (const p of plan) {
    if (!existsSync(p.from)) { missing.push(p.from); continue }
    const b = readFileSync(p.from)
    if (!(p.ext === 'ogg' ? isOggOpus(b) : isMp3(b))) missing.push(p.from + ' (invalid ' + p.ext + ' bytes)')
  }
  if (missing.length) { console.error('gen-audio: cannot install, missing or invalid raw file(s), run generate first:\n  ' + missing.join('\n  ')); return 1 }
  if (!dry) mkdirSync(INSTALL, { recursive: true })
  for (const p of plan) { if (!dry) copyFileSync(p.from, p.to); console.log((dry ? 'would install ' : 'installed ') + p.from + ' -> ' + p.to) }
  console.log((dry ? 'would install ' : 'installed ') + picks.length + ' sound(s): ' + picks.map(s => s.id).join(', '))
  console.log('next: remove these ids from PENDING_AUDIO in src/assets/sounds.ts, then run `npm run check`')
  return 0
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2))
  if (o.help) { console.log(USAGE); return }
  const m = loadManifest()
  const ids = new Set(m.sounds.map(s => s.id))
  for (const id of o.only ?? []) if (!ids.has(id)) die('--only: unknown sound id ' + id)
  const sounds = m.sounds.map((s, i): [Sound, number] => [s, i]).filter(([s]) => !o.only || o.only.includes(s.id))
  process.exitCode = o.pick ? runPick(sounds, o.dryRun) : await runGenerate(m, sounds, o)
}

// Import guard keeps the validators testable without running the CLI.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
