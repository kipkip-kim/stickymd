export interface ColorPreset {
  name: string
  light: string
  dark: string
}

export const COLOR_PRESETS: ColorPreset[] = [
  { name: '노랑', light: '#FFF9B1', dark: '#4A4520' },
  { name: '분홍', light: '#FFB8D1', dark: '#4A2030' },
  { name: '파랑', light: '#B8D4FF', dark: '#1A3050' },
  { name: '초록', light: '#B8FFD1', dark: '#1A3A20' },
  { name: '보라', light: '#D1B8FF', dark: '#3A1A4A' },
  { name: '회색', light: '#E0E0E0', dark: '#3A3A3A' },
  { name: '흰색', light: '#FFFFFF', dark: '#2A2A2A' }
]

export const DEFAULT_COLOR = COLOR_PRESETS[0].light
