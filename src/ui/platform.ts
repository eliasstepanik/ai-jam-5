// DOM effects of the UI layer (R-003): ?seed read and write, clipboard write for the copyLink event.
// Nothing runs at import time; every function touches location, history or navigator only when called, and guards for their absence.
// The promise result of the clipboard write goes to getResources().ui.copyResult and is copied into State on the next step.
import { getResources } from '../assets/resources.ts'
import { SEED_MAX_LEN } from '../core/seed.ts'
import type { State } from '../core/types.ts'
import { paramsOf } from '../world/gen/params.ts'
import { STR } from './strings.ts'

// DEFAULT (OD-5b, public share URL not decided): empty = build the link from the page's own origin + pathname.
// Set the game's public URL (e.g. the itch.io page) here to pin it, because an itch iframe has a different origin than the page.
const SHARE_BASE = ''

// <origin+pathname>?seed=<encoded seedText>[&depth=N] (architecture-determinism §5, architecture-ui-2 §3, R-164). Pure, so it is checkable.
// The depth parameter is added only for a class other than 3, so class-3 links stay exactly as they were.
export const shareUrl = (origin: string, path: string, seedText: string, depthClass?: number): string => {
  const d = paramsOf(depthClass).depthClass
  return origin + path + '?seed=' + encodeURIComponent(seedText) + (d === 3 ? '' : '&depth=' + d)
}

// A ?depth= value as a class 1..4 (rounded, clamped by paramsOf), or null when absent or not a number. Pure.
export function parseDepth(v: string | null): number | null {
  if (v === null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? paramsOf(n).depthClass : null
}

// Seeds in the URL are lower-case [a-z0-9-], at most SEED_MAX_LEN characters (R-029).
const norm = (v: string): string => v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, SEED_MAX_LEN)

// The ?seed= value of the page URL, or null when absent, empty after cleaning, or when there is no location (tests, workers).
export function readSeed(): string | null {
  if (typeof location === 'undefined') return null
  const v = norm(new URLSearchParams(location.search).get('seed') ?? '')
  return v === '' ? null : v
}

// Puts ?seed= into the address bar without a reload or history entry. An empty seed removes the parameter.
// Sandboxed iframes can refuse replaceState (SecurityError): the failure is swallowed, the game does not depend on the URL.
export function writeSeed(seed: string): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return
  try {
    const url = new URL(location.href), v = norm(seed)
    if (v === '') url.searchParams.delete('seed')
    else url.searchParams.set('seed', v)
    if (url.href !== location.href) history.replaceState(history.state, '', url)
  } catch {
    // ponytail: no retry or fallback. Upgrade: remember the failure in res.ui and stop calling once it failed.
  }
}

const seedOf = (s: State): string => s.result?.seedText || s.meta.seedText

// The text that goes on the clipboard. Plain 'Last Ember seed <seed>' when there is no usable http(s) location (Node, file://, workers).
// ponytail: an itch iframe may not forward ?seed= from the page URL; the end screen shows the seed and the title screen has a seed field.
function shareText(seed: string, depthClass?: number): string {
  if (SHARE_BASE) return shareUrl(SHARE_BASE, '', seed, depthClass)
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) return shareUrl(location.origin, location.pathname, seed, depthClass)
  return STR.shareText + ' ' + seed
}

// Starts the clipboard write. Result is reported through res.ui.copyResult only, never into State from a callback.
function copy(s: State): void {
  const res = getResources(), text = shareText(seedOf(s), s.world.depthClass ?? 3)
  const clip = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (!clip) { res.ui.copyResult = 'failed'; return }
  try {
    clip.writeText(text).then(() => { res.ui.copyResult = 'ok' }, () => { res.ui.copyResult = 'failed' })
  } catch {
    res.ui.copyResult = 'failed'
  }
}

// Called by game.ts once per update, after step (R-096).
export function platformStep(s: State): void {
  const res = getResources()
  if (!res.ui.urlRead) { // ?seed once per page (R-077); the flag survives hot swaps
    res.ui.urlRead = true
    const v = readSeed()
    if (v !== null) s.ui.seedInput = v
    // ?depth= sets the class for the next run start (screens.ts resolves it via depthOf). Runs after step, so loadSettings has already run.
    const d = typeof location === 'undefined' ? null : parseDepth(new URLSearchParams(location.search).get('depth'))
    if (d !== null) s.settings.depthClass = d
  }
  // R-030: the address bar follows the current run. Stateless: write only when it differs, so a run start costs one replaceState.
  // ponytail: reads location every step (cheap). Upgrade: remember the last runId in the registry if profiling ever shows it.
  if (s.meta.runId > 0 && readSeed() !== (norm(s.meta.seedText) || null)) writeSeed(s.meta.seedText)
  const ev = s.fx.events
  let asked = false
  for (let i = ev.length - 1; i >= 0; i--) {
    if (ev[i].kind !== 'copyLink') continue
    ev.splice(i, 1) // consume: events live 30 steps, the click must copy exactly once
    asked = true
  }
  if (asked) copy(s)
  if (res.ui.copyResult === 'none') return
  if (res.ui.copyResult === 'ok') { s.ui.copied = 1.5; s.ui.copyMsg = STR.copied }
  else { s.ui.copied = 2; s.ui.copyMsg = STR.copyFailed + ' ' + seedOf(s) }
  res.ui.copyResult = 'none'
}
