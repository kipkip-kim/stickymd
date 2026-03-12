import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { MemoData, MemoFrontmatter, AppSettings, AlarmData } from '../shared/types'

const api = {
  // Window management
  createWindow: (sourceId?: string): Promise<string | null> =>
    ipcRenderer.invoke('window:create', sourceId),
  closeWindow: (memoId: string): Promise<void> =>
    ipcRenderer.invoke('window:close', memoId),
  getOpenIds: (): Promise<string[]> =>
    ipcRenderer.invoke('window:get-open-ids'),

  // Pin
  togglePin: (memoId: string): Promise<boolean> =>
    ipcRenderer.invoke('window:toggle-pin', memoId),
  getPin: (memoId: string): Promise<boolean> =>
    ipcRenderer.invoke('window:get-pin', memoId),

  // Rollup
  toggleRollup: (memoId: string): Promise<boolean> =>
    ipcRenderer.invoke('window:toggle-rollup', memoId),
  getRollup: (memoId: string): Promise<boolean> =>
    ipcRenderer.invoke('window:get-rollup', memoId),

  // Opacity
  setOpacity: (memoId: string, opacity: number): Promise<void> =>
    ipcRenderer.invoke('window:set-opacity', memoId, opacity),

  // Shell
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:open-external', url),

  // Memo file operations
  readMemo: (memoId: string): Promise<MemoData | null> =>
    ipcRenderer.invoke('memo:read', memoId),
  saveMemo: (memoId: string, content: string, frontmatterUpdates?: Partial<MemoFrontmatter>): Promise<void> =>
    ipcRenderer.invoke('memo:save', memoId, content, frontmatterUpdates),
  deleteEmptyMemo: (memoId: string): Promise<void> =>
    ipcRenderer.invoke('memo:delete-empty', memoId),
  listMemos: (): Promise<MemoData[]> =>
    ipcRenderer.invoke('memo:list'),
  exportMemo: (memoId: string, includeFrontmatter: boolean): Promise<boolean> =>
    ipcRenderer.invoke('memo:export', memoId, includeFrontmatter),
  importMemo: (): Promise<MemoData | null> =>
    ipcRenderer.invoke('memo:import'),
  deleteMemo: (memoId: string): Promise<boolean> =>
    ipcRenderer.invoke('memo:delete', memoId),
  deletePermanent: (memoId: string): Promise<boolean> =>
    ipcRenderer.invoke('memo:delete-permanent', memoId),
  restoreMemo: (memoId: string): Promise<boolean> =>
    ipcRenderer.invoke('memo:restore', memoId),
  listTrash: (): Promise<MemoData[]> =>
    ipcRenderer.invoke('memo:list-trash'),
  readExternalFile: (filePath: string): Promise<{ content: string } | { error: string }> =>
    ipcRenderer.invoke('memo:read-external-file', filePath),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  importMemoFromPath: (filePath: string): Promise<MemoData | { error: string }> =>
    ipcRenderer.invoke('memo:import-from-path', filePath),

  // Manager window
  openManager: (tab?: string): Promise<void> =>
    ipcRenderer.invoke('manager:open', tab),
  openMemo: (memoId: string): Promise<void> =>
    ipcRenderer.invoke('manager:open-memo', memoId),

  // Manager events
  onManagerSwitchTab: (callback: (tab: string) => void): void => {
    ipcRenderer.on('manager:switch-tab', (_event, tab) => callback(tab))
  },

  // Settings
  getAutoSaveMs: (): Promise<number> =>
    ipcRenderer.invoke('settings:get-auto-save-ms'),
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:get'),
  updateSettings: (updates: Partial<AppSettings>): Promise<{ success: boolean; error?: string; settings?: AppSettings }> =>
    ipcRenderer.invoke('settings:update', updates),
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('settings:select-directory'),
  backup: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:backup'),
  restore: (): Promise<boolean> =>
    ipcRenderer.invoke('settings:restore'),

  // Alarm (multi-alarm)
  addAlarm: (memoId: string, alarm: AlarmData): Promise<boolean> =>
    ipcRenderer.invoke('memo:add-alarm', memoId, alarm),
  removeAlarm: (memoId: string, index: number): Promise<boolean> =>
    ipcRenderer.invoke('memo:remove-alarm', memoId, index),
  getAlarms: (memoId: string): Promise<AlarmData[]> =>
    ipcRenderer.invoke('memo:get-alarms', memoId),
  clearAlarms: (memoId: string): Promise<boolean> =>
    ipcRenderer.invoke('memo:clear-alarms', memoId),
  onAlarmFired: (callback: () => void): void => {
    ipcRenderer.on('memo:alarm-fired', () => callback())
  },

  // Settings change event
  onSettingsChanged: (callback: (updates: Partial<AppSettings>) => void): void => {
    ipcRenderer.on('settings:changed', (_event, updates) => callback(updates))
  },

  // Clipboard
  copyToClipboard: (text: string): Promise<void> =>
    ipcRenderer.invoke('clipboard:write', text),

  // Fonts
  listFonts: (): Promise<string[]> =>
    ipcRenderer.invoke('fonts:list'),

  // Theme
  getTheme: (): Promise<'light' | 'dark'> =>
    ipcRenderer.invoke('theme:get'),
  onThemeChanged: (callback: (theme: 'light' | 'dark') => void): void => {
    ipcRenderer.on('theme:changed', (_event, theme) => callback(theme))
  },

  // Events from main
  onMemoInit: (callback: (data: { memoId: string; isRolledUp: boolean }) => void): void => {
    ipcRenderer.on('memo:init', (_event, data) => callback(data))
  },
  onRollupChanged: (callback: (isRolledUp: boolean) => void): void => {
    ipcRenderer.on('memo:rollup-changed', (_event, isRolledUp) => callback(isRolledUp))
  },
  onFlushSave: (callback: () => void): void => {
    ipcRenderer.on('memo:flush-save', () => callback())
  },

  // Cleanup
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel)
  }
}

export type API = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch {
    // Fallback for non-isolated context (tests)
  }
} else {
  // @ts-ignore
  window.api = api
}
