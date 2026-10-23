// L0 core: localStorage persistence of the personal best and the settings. Spec: docs/architecture-scoring-and-save.md §6,
// R-168 (storage calls arrive with B7), architecture-modules-core.md §3.8.
// Every access is in try/catch: a missing, blocked or full store sets ui.storageOk = false and toasts once; the game never depends on storage.
// `store` is injectable for checks; the default `globalThis.localStorage` is resolved inside the try so a missing global cannot throw.
// Time exception: Best.at = new Date().toISOString() is the one clock read in src/core (display only, never read by the simulation);
// scripts/check-guard.ts does not ban the Date constructor, so no allow-list entry is needed (its grep flags banned names in comments too).
import type { Best, Settings, SettingsRecord, State } from './types.ts'
import { toast } from './state.ts'
import { DEFAULT_BEST } from './score.ts'
import { fill } from './migrate.ts'

export type Store = Pick<Storage, 'getItem' | 'setItem'>

const BEST_KEY = 'last-ember:best'
const SETTINGS_KEY = 'last-ember:settings'
const QUALITY: readonly Settings['quality'][] = ['auto', 'q0', 'q1', 'q2', 'q3']

// First failure only: later failures are silent (rule 1 of scoring-and-save §6).
function fail(s: State): void {
  if (!s.ui.storageOk) return
  s.ui.storageOk = false
  toast(s, 'Saving disabled in this browser')
}

function read(s: State, key: string, store?: Store): string | null {
  try {
    const st = store ?? globalThis.localStorage
    return st.getItem(key)
  } catch {
    fail(s)
    return null
  }
}

function write(s: State, key: string, value: unknown, store?: Store): void {
  if (!s.ui.storageOk) return // ponytail: no retry after a failure; the page session stays unsaved
  try {
    const st = store ?? globalThis.localStorage
    st.setItem(key, JSON.stringify(value))
  } catch {
    fail(s)
  }
}

// Parsed record when it is an object with v === 1 and every named field a finite number; else null (corrupt JSON, v:2, wrong shape).
// The key is never deleted: a newer build may own it.
function parse(raw: string | null, nums: readonly string[]): Record<string, unknown> | null {
  if (raw === null) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const r = v as Record<string, unknown>
  if (r.v !== 1) return null
  for (const k of nums) if (typeof r[k] !== 'number' || !Number.isFinite(r[k])) return null
  return r
}

export function loadBest(s: State, store?: Store): void {
  const r = parse(read(s, BEST_KEY, store), ['score', 'depth', 'seconds', 'mineralsUsed', 'hpLeft'])
  if (r) s.best = fill(DEFAULT_BEST, r) as Best
}

// Sets settings.loaded even when nothing was stored or storage failed: the once-per-session guard of screens.ts.
export function loadSettings(s: State, store?: Store): void {
  const set = s.settings
  s.settings.loaded = true
  const r = parse(read(s, SETTINGS_KEY, store), ['volume'])
  if (!r) return
  const d: SettingsRecord = { v: 1, volume: set.volume, muted: set.muted, lastSeed: set.lastSeed, reducedFlash: set.reducedFlash, quality: set.quality }
  const f = fill(d, r) as SettingsRecord
  set.volume = Math.min(1, Math.max(0, f.volume))
  set.muted = f.muted
  set.lastSeed = f.lastSeed
  set.reducedFlash = f.reducedFlash
  set.quality = QUALITY.includes(f.quality) ? f.quality : 'auto'
}

export function saveSettings(s: State, store?: Store): void {
  const set = s.settings
  const rec: SettingsRecord = { v: 1, volume: set.volume, muted: set.muted, lastSeed: set.lastSeed, reducedFlash: set.reducedFlash, quality: set.quality }
  write(s, SETTINGS_KEY, rec, store)
}

// scoring-and-save §6 rule 4: better = higher score, or equal score in fewer seconds. Always fills result.prevBest/isNewBest;
// the in-memory best updates even when the write fails.
export function commitBest(s: State, store?: Store): void {
  const r = s.result
  if (!r) return
  const prev = s.best
  const score = r.parts.total
  r.prevBest = prev ? prev.score : 0
  r.isNewBest = !prev || score > prev.score || (score === prev.score && r.seconds < prev.seconds)
  if (!r.isNewBest) return
  const best: Best = {
    v: 1, score, depth: r.depth, seconds: r.seconds, won: r.won, mineralsUsed: r.mineralsUsed, hpLeft: r.hpLeft,
    seedText: r.seedText, at: new Date().toISOString(),
  }
  s.best = best
  write(s, BEST_KEY, best, store)
}
