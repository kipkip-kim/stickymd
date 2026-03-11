import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { createMemoWindow, getWindowByMemoId } from './window-manager'
import { readMemo } from './memo-file'
import { stateStore } from './store'

let managerWindow: BrowserWindow | null = null

/** Open the manager window (or focus if already open) */
export function openManagerWindow(tab?: string): void {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.focus()
    if (tab) {
      managerWindow.webContents.send('manager:switch-tab', tab)
    }
    return
  }

  managerWindow = new BrowserWindow({
    width: 600,
    height: 500,
    minWidth: 400,
    minHeight: 350,
    title: 'Sticky Memo — 관리자',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Load renderer with #manager hash
  const hash = tab ? `manager?tab=${tab}` : 'manager'
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    managerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${hash}`)
  } else {
    managerWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash })
  }

  managerWindow.on('closed', () => {
    managerWindow = null
  })
}

/** Get the manager window instance */
export function getManagerWindow(): BrowserWindow | null {
  return managerWindow && !managerWindow.isDestroyed() ? managerWindow : null
}

/** Register IPC handlers for manager window */
export function registerManagerIPC(): void {
  ipcMain.handle('manager:open', (_event, tab?: string) => {
    openManagerWindow(tab)
  })

  ipcMain.handle('manager:open-memo', async (_event, memoId: string) => {
    // Check if window already open → focus it
    const existing = getWindowByMemoId(memoId)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
      return
    }

    // Verify memo exists
    const memo = await readMemo(memoId)
    if (!memo) return

    // Open memo window with saved state
    const state = await stateStore.read()
    await createMemoWindow(memoId, state.windows[memoId])
  })
}
