import { contextBridge, ipcRenderer } from 'electron'

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
  readMemo: (memoId: string): Promise<unknown> =>
    ipcRenderer.invoke('memo:read', memoId),
  saveMemo: (memoId: string, content: string, frontmatterUpdates?: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('memo:save', memoId, content, frontmatterUpdates),
  deleteEmptyMemo: (memoId: string): Promise<void> =>
    ipcRenderer.invoke('memo:delete-empty', memoId),
  listMemos: (): Promise<unknown[]> =>
    ipcRenderer.invoke('memo:list'),

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
