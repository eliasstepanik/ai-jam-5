// Supplied audio semantics: full score, real movement and exactly doubled escape cadence.
import { init } from '../core/state.ts'
import { footstepMode } from '../core/footsteps.ts'
import { SOUNDS, PENDING_AUDIO } from '../assets/sounds.ts'
const ok = (c: boolean, msg: string): void => { if (!c) throw Error('audio delivery: ' + msg) }
export function run(): void {
  const s = init(); s.meta.screen = 'playing'; s.player.gaitSpeed = 120
  ok(footstepMode(s) === 'walk', 'descent walking uses supplied normal cadence')
  s.player.gaitSpeed = 240
  ok(footstepMode(s) === 'walk', 'fast developer movement before Beacon does not trigger escape sprint')
  s.meta.phase = 'escape'; s.world.beaconLit = true
  ok(footstepMode(s) === 'run', 'Beacon sprint uses doubled cadence')
  s.player.gaitSpeed = 80
  ok(footstepMode(s) === 'walk', 'slower escape movement keeps walking cadence')
  s.player.gaitSpeed = 0
  ok(footstepMode(s) === null, 'idle or blocked movement has no footsteps')
  s.player.gaitSpeed = 240; s.player.roll.t = .2
  ok(footstepMode(s) === null, 'roll does not play walking audio')
  s.player.roll.t = 0; s.fx.hitstop = .1
  ok(footstepMode(s) === null, 'hitstop silences footsteps')
  s.fx.hitstop = 0
  for (const screen of ['title', 'settings', 'help', 'paused', 'dead', 'won'] as const) {
    s.meta.screen = screen; ok(footstepMode(s) === null, screen + ' has no footsteps')
  }
  ok(SOUNDS['sfx_player-walk'].loop[1] === SOUNDS['sfx_player-run'].loop[1] * 2, 'run loop is half the walking duration')
  for (const id of ['mus_title', 'mus_descent', 'mus_escape'] as const) {
    ok(SOUNDS[id].file === 'mus_beacon-run' && SOUNDS[id].stream && SOUNDS[id].loop[1] === 480, id + ' streams the same full score')
    ok(!(PENDING_AUDIO as readonly string[]).includes(id), id + ' no longer pending')
  }
}
