export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isRolledUp: boolean
}

export interface AppState {
  windows: Record<string, WindowState>
  openMemoIds: string[]
}

import type { AppSettings } from '../../shared/types'
export type { AppSettings }

export const DEFAULT_SETTINGS: AppSettings = {
  fontPreset: '기본',
  autoSaveSeconds: 2,
  trashDays: 30,
  savePath: '',  // Set at runtime to DEFAULT_SAVE_DIR
  autoStart: false,
  darkMode: 'system',
  maxOpenWindows: 10,
  globalHotkey: 'Ctrl+Shift+N',
  deleteConfirm: true,
  immediateDelete: false,
  sortBy: 'modified',
  sortOrder: 'desc'
}

export const DEFAULT_STATE: AppState = {
  windows: {},
  openMemoIds: []
}
