// Delivered UI metadata. The first two sheets remain cave/characters; UI follows them.
import meta from './ui/ui.json'
export const UI_THEMES = ['stone', 'ember', 'spectral', 'normal', 'copper', 'sodium', 'strontium', 'menu'] as const
export type UiTheme = typeof UI_THEMES[number]
export type UiSprite = keyof typeof meta.sprites
export const UI_SPRITES = meta.sprites
export const UI_SLICE = meta.sprites.panel_9slice.slice_margins
export const UI_FPS = meta.torch_animation.suggested_fps
export const UI_TORCH_FRAMES = ['torch_0', 'torch_1', 'torch_2'] as const
