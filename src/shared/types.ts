/** Shared types used across main, preload, and renderer */

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
