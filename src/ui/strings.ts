// All player-facing English text (architecture-ui §4). Data plus tiny pure formatters; no Intl, no DOM.
// ponytail: English only, no i18n table. Upgrade: key this object by locale if a second language is ever wanted.
// ponytail: only the mining time is imported from tuning; other help numbers (plant heals one heart, half light) are prose and
// can drift if tuning changes. Upgrade: template them from T too.
import { T } from '../core/tuning.ts'

export const STR = {
  tagline: 'Carry the last flame down. Light the Beacon. Get out.',
  loading: 'Carving the cave…',
  loadingBtn: 'Loading', // Play button while assets load; caller appends pct(progress) (architecture-ui §7)
  logoFallback: 'LAST EMBER', // text logo when art_logo is missing (architecture-ui §7)
  best: 'Best', // personal-best line prefix; the 'escaped' tag is spec'd, the death tag is not
  bestEscaped: 'escaped',
  play: 'Play',
  help: 'Help',
  resume: 'Resume',
  quit: 'Quit to title',
  quitConfirm: 'Really quit? Enter',
  seedLabel: 'Seed',
  seedPlaceholder: 'random',
  seedHint: 'Type letters/digits · Backspace · empty = random seed',
  noBest: 'No best yet',
  soundHint: 'Click to enable sound',
  soundMuted: 'Sound muted [M]',
  soundFailed: 'Audio unavailable',
  version: 'v0.1 · jam build',
  storageOff: 'Saving disabled in this browser',
  paused: 'PAUSED',
  // settings buttons: label text only, caller adds the value
  soundOn: 'Sound: On',
  soundOff: 'Sound: Off',
  flashFull: 'Flashing: Full',
  flashReduced: 'Flashing: Reduced',
  // help chrome
  helpTabs: ['Goal', 'Parry', 'Minerals'],
  helpFooter: '← → / A D page · Esc back',
  helpArt: { entrance: 'ENTRANCE', zones: 'ZONES 1–4', beacon: 'BEACON', eyes: 'EYES GLOW', click: 'CLICK NOW', perfect: 'PERFECT', ringClick: 'CLICK' },
  helpCols: { mineral: 'MINERAL', flame: 'FLAME', effect: 'EFFECT', key: 'KEY' },
  // shared words and templates (rendered text must not change)
  depthWord: 'depth',
  zoneWord: 'Zone',
  breakdown: { depth: 'depth', win: 'escape', time: 'time', minerals: 'minerals', hp: 'hearts' },
  parries: 'Parries',
  perfectWord: 'perfect',
  kills: 'Kills',
  shareText: 'Last Ember seed', // clipboard text when SHARE_BASE is empty
  copyFailed: 'Copy failed – seed',
  // end screen
  died: 'THE EMBER DIED',
  escaped: 'YOU ESCAPED',
  newBest: 'NEW BEST!',
  rowDepth: 'Depth',
  rowTime: 'Time',
  rowMinerals: 'Minerals used',
  rowHearts: 'Hearts left',
  score: 'Score',
  newRun: 'New run',
  retrySeed: 'Retry seed',
  title: 'Title',
  copyLink: 'Copy link',
  copied: 'Copied!',
  endHint: '← → select · Enter confirm · T retry · C copy · Esc title',
  // hud
  depth: 'DEPTH',
  zone: 'ZONE',
  flameOut: 'FLAME OUT',
  flame: { plain: 'PLAIN', sodium: 'SODIUM', copper: 'COPPER', strontium: 'STRONTIUM' },
  hotbarHint: 'F toss · G shake off',
  full: 'Full',
  mine: 'Mine',
  beacon: 'Light the Beacon (costs flame)',
  run: 'RUN!',
  runSub: 'Reach the entrance',
  exit: 'EXIT',
  parry: { perfect: 'PERFECT', good: 'GOOD', poor: 'POOR' },
  // depth class selector (R-164); `depth` above is the HUD word, so the settings title row gets its own key
  depthLabel: 'Depth',
  depthRow: 'Class', // end-screen row label
} as const

// Depth class names and the class tag live in L0 so checks can import them (issue #119); re-exported for the UI.
export { DEPTH_NAMES, depthName, depthTag } from '../core/depth-label.ts'

export const HELP = [
  {
    goal: [
      'Your flame is your light, your shield and your clock.',
      'Go deep, light the Beacon at the bottom, then run back up.',
      'Deeper is worth more. Dying still scores.',
    ],
    controls: [
      ['WASD', 'Move / face (arrows also)'], ['Mouse', 'Face while standing'], ['Click', 'Swing / parry'], ['E (hold)', 'Mine / light Beacon'],
      ['1 2 3', 'Pick mineral'], ['F', 'Toss mineral into the flame'], ['G', 'Shake off (plain flame)'],
      ['Space', 'Roll (escape only)'], ['Esc / P', 'Pause'], ['M', 'Mute'], ['Enter', 'Confirm selected button'],
    ],
  },
  {
    rules: [
      'When a shade\'s eyes flare, it is about to lunge. Swing into it.',
      'The closer to the moment of impact, the less flame you lose.',
      'No flame, no parry: then every hit costs a heart.',
    ],
    legend: [
      ['eyes glow (telegraph)', '#6b4fb8'], ['parry window', '#e8dcc8'],
      ['PERFECT – no flame lost', '#ffd27a'], ['too early / late – flame lost', '#8a7f70'],
    ],
  },
  {
    // flame colours mirror render/flame.ts FLAME_COL core/mantle for the help swatch
    minerals: [
      { name: 'None', core: '#fff4d6', mantle: '#ff8a1e', effect: 'Plain orange flame. G shakes any mineral off.', key: 'G' },
      { name: 'Sodium', core: '#ffffff', mantle: '#ffe14a', effect: 'Bigger light, burns faster, LURES more shades.', key: '1' },
      { name: 'Copper', core: '#e8fff9', mantle: '#1fd6b8', effect: 'Normal light. Parries are more forgiving.', key: '2' },
      { name: 'Strontium', core: '#ffe0e0', mantle: '#e0182d', effect: 'Small dim light. FEWER shades notice you.', key: '3' },
    ],
    tips: [
      'Resin relights a dead flame instantly.',
      'Plants heal one heart. They grow in side rooms.',
      `Mining takes ${T.mining.holdS} s of standing still – that costs light.`,
      'After the Beacon, the cave is lit – but it is collapsing. Roll through lunges.',
    ],
  },
] as const

// m:ss, whole seconds, minutes unbounded (no hour roll-over; a run is capped well below 100 min)
export const clock = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const pct = (v: number): string => `${Math.round(v * 100)} %`
