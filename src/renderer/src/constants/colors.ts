export interface ColorPreset {
  name: string
  light: string
}

export const COLOR_PRESETS: ColorPreset[] = [
  { name: '노랑', light: '#FFF9B1' },
  { name: '분홍', light: '#FFB8D1' },
  { name: '파랑', light: '#B8D4FF' },
  { name: '초록', light: '#B8FFD1' },
  { name: '보라', light: '#D1B8FF' },
  { name: '회색', light: '#E0E0E0' },
  { name: '흰색', light: '#FFFFFF' }
]

export const DEFAULT_COLOR = COLOR_PRESETS[0].light

/** Uniform dark background for all notes in dark mode */
export const DARK_NOTE_BG = '#1e1e1e'

/** Check if a hex color is light (luminance > 128) */
export function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

/** Get the effective note color based on theme */
export function getEffectiveColor(storedColor: string, isDark: boolean): string {
  if (!isDark) return storedColor
  return DARK_NOTE_BG
}
