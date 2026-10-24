// L0 core: pure helpers for the dev-only running-commit label (fetched from the Vite dev middleware GET /__commit, see vite.config.ts).
// The value and the poll countdown live in State.debug (hot-swap contract); nothing here holds module state.
import type { Debug } from './types.ts'

export const COMMIT_POLL_S = 30 // re-fetch period, so the label follows a `git reset --hard` of the checkout while Vite keeps running

// Short sha exactly as GitHub shows it: 7 lowercase hex chars. Anything else (error text, html, empty) becomes 'unknown'.
export function normalizeCommit(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return /^[0-9a-f]{7}$/.test(v) ? v : 'unknown'
}

// Counts the countdown down by dt; true when a fetch is due (and the countdown is re-armed). commitT starts at 0: first call fetches.
// The re-arm happens at fetch START, so a slow or failed fetch can never overlap the next one and no in-flight flag is needed.
export function commitTick(d: Pick<Debug, 'commitT'>, dt: number): boolean {
  d.commitT -= dt
  if (d.commitT > 0) return false
  d.commitT = COMMIT_POLL_S
  return true
}
