// Session-only developer access. No URL, storage, listeners or module-level mutable state.
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { toast } from '../core/state.ts'
import { getResources } from '../assets/resources.ts'
import { resetDebug } from '../systems/debug.ts'

export const debugAvailable = (): boolean => getResources().debug.available === true
export function lockDebug(s: State): boolean {
  if (!resetDebug(s)) return false
  const ui = getResources().debug
  ui.available = false; ui.on = false; ui.drag = 'none'; ui.tab = 0; ui.quality = undefined
  return true
}
export function debugAccessInput(s: State, input: Input): Input {
  const ui = getResources().debug
  // Old HMR sessions used implicit DEV/query-string access. Upgrade once to the explicit gate.
  if (ui.accessVersion !== 1) {
    if (lockDebug(s)) ui.accessVersion = 1
  }
  const unlock = input.pressed.has('DevUnlock') // host captures Ctrl+Shift+F2 atomically
  if (!unlock) return input
  ui.available = true; ui.accessVersion = 1; ui.on = true; ui.drag = 'none'
  toast(s, 'Developer tools enabled')
  const pressed = new Set(input.pressed); pressed.delete('F2'); pressed.delete('DevUnlock')
  return { ...input, pressed }
}
