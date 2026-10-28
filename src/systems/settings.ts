// Settings writers are shared by pointer controls (L5) and keyboard navigation (L3).
import type { State } from '../core/types.ts'
import { audioLevel } from '../core/settings.ts'
import { saveSettings } from '../core/storage.ts'

export function setAudioLevel(s: State, row: number, value: number): void {
  const key = row === 0 ? 'musicVolume' : 'sfxVolume', next = Math.round(audioLevel(value, 0) * 100) / 100
  if (s.settings[key] === next && !s.settings.muted) return
  s.settings[key] = next
  s.settings.muted = false
  saveSettings(s)
}
