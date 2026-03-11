/** Shared types used across main, preload, and renderer */

export interface AppSettings {
  fontPreset: string
  autoSaveSeconds: number
  trashDays: number
  savePath: string
  autoStart: boolean
  darkMode: 'system' | 'light' | 'dark'
  maxOpenWindows: number
  globalHotkey: string
  deleteConfirm: boolean
  immediateDelete: boolean
  sortBy: 'modified' | 'created' | 'title'
  sortOrder: 'asc' | 'desc'
}

export interface MemoFrontmatter {
  title: string
  created: string
  modified: string
  color: string
  pinned: boolean
  opacity: number
  fontSize: number
  alarm?: AlarmData
}

export interface AlarmData {
  enabled: boolean
  time: string
  type: 'once' | 'daily' | 'weekdays' | 'daterange'
  date?: string
  weekdays?: number[]
  startDate?: string
  endDate?: string
}

export interface MemoData {
  id: string
  frontmatter: MemoFrontmatter
  content: string
}
