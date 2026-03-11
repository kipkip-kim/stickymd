import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { createMemoWindow, getWindowByMemoId } from './window-manager'
import { readMemo } from './memo-file'
import { stateStore } from './store'
import { getEffectiveTheme } from './theme'

let managerWindow: BrowserWindow | null = null

/** Toggle the manager window — open if closed, close if open */
export async function toggleManagerWindow(tab?: string): Promise<void> {
  if (managerWindow && !managerWindow.isDestroyed()) {
    if (tab) {
      // If requesting a specific tab, switch to it and focus
      managerWindow.webContents.send('manager:switch-tab', tab)
      managerWindow.focus()
    } else {
      // Toggle: close if already open
      managerWindow.close()
    }
    return
  }

  const theme = await getEffectiveTheme()
  const isDark = theme === 'dark'

  managerWindow = new BrowserWindow({
    width: 600,
    height: 500,
    minWidth: 400,
    minHeight: 350,
    title: 'Sticky Memo — 관리자',
    backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
    titleBarStyle: 'hidden',
    titleBarOverlay: isDark
      ? { color: '#1e1e1e', symbolColor: '#e0e0e0', height: 32 }
      : { color: '#ffffff', symbolColor: '#333333', height: 32 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Remove menu bar (not needed for manager window)
  managerWindow.setMenu(null)


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

/** Open the manager window (or focus if already open) — used by tray */
export async function openManagerWindow(tab?: string): Promise<void> {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.focus()
    if (tab) {
      managerWindow.webContents.send('manager:switch-tab', tab)
    }
    return
  }
  // Delegate to toggle which handles creation
  await toggleManagerWindow(tab)
}

/** Get the manager window instance */
export function getManagerWindow(): BrowserWindow | null {
  return managerWindow && !managerWindow.isDestroyed() ? managerWindow : null
}

/** Register IPC handlers for manager window */
export function registerManagerIPC(): void {
  ipcMain.handle('manager:open', (_event, tab?: string) => {
    toggleManagerWindow(tab)
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
