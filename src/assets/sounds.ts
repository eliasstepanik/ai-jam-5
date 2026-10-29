// L1, DOM-free. Sample files are optional deliveries; playback/synthesis belongs to B12-B13.
export type Group = 'music' | 'amb' | 'sfx' | 'ui'
export type SoundDef = {
  readonly group: Group; readonly gain: number; readonly pri: 0 | 1 | 2 | 3; readonly cap: number
  readonly file?: string
  readonly variants?: readonly string[] // alternatives, one sample per event (not layers)
  readonly stream?: boolean // long music stays in a media element, never fully decoded into buffers
  readonly loop?: readonly [start: number, end: number]
  readonly layers?: readonly string[]
}

export const SOUNDS = {
  mus_title: { group: 'music', gain: 0.8, pri: 3, cap: 1, file: 'mus_beacon-run', stream: true, loop: [0, 480] },
  mus_descent: { group: 'music', gain: 0.7, pri: 3, cap: 1, file: 'mus_beacon-run', stream: true, loop: [0, 480] },
  'mus_descent-danger': { group: 'music', gain: 0.7, pri: 3, cap: 1, file: 'mus_descent-danger', loop: [0, 30] },
  mus_escape: { group: 'music', gain: 0.7, pri: 3, cap: 1, file: 'mus_blackout-escape', stream: true, loop: [0, 480] },
  'mus_sting-win': { group: 'music', gain: 0.8, pri: 3, cap: 1, file: 'mus_sting-win' },
  'mus_sting-death': { group: 'music', gain: 0.8, pri: 3, cap: 1, file: 'mus_sting-death' },
  amb_cave: { group: 'amb', gain: 0.8, pri: 1, cap: 1, file: 'amb_cave', loop: [0, 40] },
  'sfx_flame-loop': { group: 'sfx', gain: 0.35, pri: 3, cap: 1, file: 'sfx_flame-loop', loop: [0, 3.2] },
  'sfx_flame-toss-sodium': { group: 'sfx', gain: 0.8, pri: 2, cap: 1 },
  'sfx_flame-toss-copper': { group: 'sfx', gain: 0.8, pri: 2, cap: 1 },
  'sfx_flame-toss-strontium': { group: 'sfx', gain: 0.8, pri: 2, cap: 1 },
  'sfx_flame-shakeoff': { group: 'sfx', gain: 0.8, pri: 2, cap: 1 },
  'sfx_flame-out': { group: 'sfx', gain: 0.9, pri: 3, cap: 1 },
  sfx_relight: { group: 'sfx', gain: 0.9, pri: 3, cap: 1 },
  sfx_swing: { group: 'sfx', gain: 0.5, pri: 1, cap: 2 },
  sfx_parry: { group: 'sfx', gain: 0.8, pri: 3, cap: 2 },
  'sfx_parry-perfect': { group: 'sfx', gain: 1, pri: 3, cap: 1, layers: ['sfx_parry-perfect-ring'] },
  'sfx_parry-bad': { group: 'sfx', gain: 0.7, pri: 3, cap: 1 },
  'sfx_player-walk': { group: 'sfx', gain: 0.4, pri: 1, cap: 1, file: 'sfx_player-walk', loop: [0, 1.48] },
  'sfx_player-run': { group: 'sfx', gain: 0.4, pri: 1, cap: 1, file: 'sfx_player-run', loop: [0, 0.74] },
  sfx_roll: { group: 'sfx', gain: 0.6, pri: 1, cap: 1 },
  'sfx_mine-hit': { group: 'sfx', gain: 0.7, pri: 1, cap: 2 },
  'sfx_mineral-collect': { group: 'sfx', gain: 0.6, pri: 1, cap: 2 },
  sfx_resin: { group: 'sfx', gain: 0.7, pri: 1, cap: 2 },
  'sfx_plant-heal': { group: 'sfx', gain: 0.7, pri: 2, cap: 1 },
  'sfx_mine-empty': { group: 'sfx', gain: 0.5, pri: 1, cap: 1 },
  'sfx_eye-open': { group: 'sfx', gain: 0.5, pri: 2, cap: 3, file: 'sfx_eye-open' },
  'sfx_mon-growl': { group: 'sfx', gain: 0.8, pri: 1, cap: 3, file: 'sfx_mon-growl' },
  'sfx_mon-lunge': { group: 'sfx', gain: 0.7, pri: 2, cap: 3, file: 'sfx_mon-lunge' },
  'sfx_mon-hit': { group: 'sfx', gain: 0.8, pri: 3, cap: 2 },
  'sfx_mon-death': { group: 'sfx', gain: 0.6, pri: 1, cap: 4, file: 'sfx_mon-death' },
  'sfx_devourer-beat': { group: 'sfx', gain: 1, pri: 2, cap: 1 },
  sfx_hurt: { group: 'sfx', gain: 0.9, pri: 3, cap: 1 },
  sfx_heartbeat: { group: 'sfx', gain: 0.7, pri: 3, cap: 2 },
  'sfx_player-death': { group: 'sfx', gain: 0.8, pri: 3, cap: 1 },
  'sfx_beacon-charge': { group: 'sfx', gain: 0.8, pri: 3, cap: 1 },
  'sfx_beacon-ignite': { group: 'sfx', gain: 1, pri: 3, cap: 1 },
  'sfx_beacon-horn': { group: 'sfx', gain: 1, pri: 3, cap: 1, file: 'sfx_beacon-horn' },
  'sfx_cave-rumble': { group: 'sfx', gain: 0.6, pri: 1, cap: 1 },
  'sfx_rock-warn': { group: 'sfx', gain: 0.7, pri: 2, cap: 4 },
  'sfx_rock-impact': { group: 'sfx', gain: 0.9, pri: 2, cap: 4, file: 'sfx_rock-impact', variants: ['sfx_rock-impact', 'sfx_rock-impact-2', 'sfx_rock-impact-3'] },
  sfx_drip: { group: 'sfx', gain: 0.4, pri: 0, cap: 2 },
  ui_click: { group: 'ui', gain: 0.6, pri: 0, cap: 2 },
  ui_confirm: { group: 'ui', gain: 0.7, pri: 0, cap: 1 },
  ui_denied: { group: 'ui', gain: 0.5, pri: 0, cap: 1 },
} as const satisfies Record<string, SoundDef>
export type SoundId = keyof typeof SOUNDS

// Ids whose sample files are undelivered (empty: every sample is delivered). Keep this explicit so a future undelivered id is listed here.
export const PENDING_AUDIO = [] as const satisfies readonly SoundId[]
