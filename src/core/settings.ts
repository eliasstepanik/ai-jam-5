// Shared compatibility and pause semantics for the Settings screen.
import type { State } from './types.ts'
export const audioLevel = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback
export const pausedMenu = (s: State): boolean => s.meta.screen === 'paused' ||
  (s.meta.screen === 'settings' && s.ui.settingsFrom === 'paused')
