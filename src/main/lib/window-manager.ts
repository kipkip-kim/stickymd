import { BrowserWindow, screen, ipcMain, shell, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { randomUUID } from 'crypto'
import {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  MIN_WIDTH,
  MIN_HEIGHT,
  TITLEBAR_HEIGHT,
  CASCADE_OFFSET
} from './constants'
import type { WindowState } from './types'
import { stateStore, getSettings } from './store'

/** Map of memoId → BrowserWindow */
const windows = new Map<string, BrowserWindow>()

/** Debounce timers for position/size saves */
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Track rollup state per window */
const rollupState = new Map<string, { isRolledUp: boolean; prevHeight: number }>()

/** B2: Prevent rapid rollup toggle */
const transitioning = new Set<string>()

/** Get all open memo IDs */
export function getOpenMemoIds(): string[] {
  return Array.from(windows.keys())
}

/** Get window by memo ID */
export function getWindowByMemoId(memoId: string): BrowserWindow | undefined {
  return windows.get(memoId)
}

/** Get number of open windows */
export function getOpenWindowCount(): number {
  return windows.size
}

/** Create a new memo window */
export async function createMemoWindow(
  memoId?: string,
  savedState?: WindowState,
  sourceWindow?: BrowserWindow
): Promise<{ memoId: string; window: BrowserWindow } | null> {
  const settings = await getSettings()
  if (windows.size >= settings.maxOpenWindows) {
    // NFR-5: show warning if limit reached
    const existing = BrowserWindow.getAllWindows()[0]
    if (existing) {
      dialog.showMessageBoxSync(existing, {
        type: 'warning',
        title: 'Sticky Memo',
        message: `동시에 열 수 있는 메모는 최대 ${settings.maxOpenWindows}개입니다.`,
        buttons: ['확인']
      })
    }
    return null
  }

  const id = memoId || randomUUID()

  // Determine position
  let x: number | undefined
  let y: number | undefined
  let width = DEFAULT_WIDTH
  let height = DEFAULT_HEIGHT
  let isRolledUp = false

  if (savedState) {
    x = savedState.x
    y = savedState.y
    width = savedState.width
    height = savedState.height
    isRolledUp = savedState.isRolledUp
  } else if (sourceWindow) {
    // Cascade from source window
    const bounds = sourceWindow.getBounds()
    x = bounds.x + CASCADE_OFFSET
    y = bounds.y + CASCADE_OFFSET
  } else {
    // Center on primary display (tray/hotkey creation)
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
    x = Math.round((screenW - width) / 2)
    y = Math.round((screenH - height) / 2)
  }

  const win = new BrowserWindow({
    x,
    y,
    width,
    height: isRolledUp ? 32 : height,
    minWidth: MIN_WIDTH,
    minHeight: isRolledUp ? 32 : MIN_HEIGHT,
    frame: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  windows.set(id, win)
  rollupState.set(id, { isRolledUp, prevHeight: height })

  // Block navigation inside app (links open in external browser)
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    shell.openExternal(url).catch((e) => console.error('openExternal failed:', e))
  })

  // Send memoId to renderer once loaded
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('memo:init', { memoId: id, isRolledUp })
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Save position/size on move/resize with debounce (1 second)
  const debounceSave = (): void => {
    if (saveTimers.has(id)) clearTimeout(saveTimers.get(id)!)
    saveTimers.set(
      id,
      setTimeout(() => {
        saveTimers.delete(id)
        saveWindowState(id)
      }, 1000)
    )
  }
  win.on('move', debounceSave)
  win.on('resize', debounceSave)

  // B11: Clean up on close — prevent memory leaks
  win.on('closed', () => {
    // Flush pending save timer
    if (saveTimers.has(id)) {
      clearTimeout(saveTimers.get(id)!)
      saveTimers.delete(id)
    }
    win.removeAllListeners()
    windows.delete(id)
    rollupState.delete(id)
    transitioning.delete(id)
    // Update openMemoIds in state
    saveOpenMemoIds()
  })

  // B21: Save window state on close + notify renderer to flush pending save
  win.on('close', () => {
    saveWindowState(id)
    // Tell renderer to flush any pending debounced save
    if (!win.isDestroyed()) {
      win.webContents.send('memo:flush-save')
    }
  })

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Save to state
  await saveWindowState(id)
  await saveOpenMemoIds()

  return { memoId: id, window: win }
}

/** Close a memo window */
export function closeMemoWindow(memoId: string): void {
  const win = windows.get(memoId)
  if (win && !win.isDestroyed()) {
    win.close()
  }
}

/** Save a single window's position/size to state.json */
async function saveWindowState(memoId: string): Promise<void> {
  const win = windows.get(memoId)
  if (!win || win.isDestroyed()) return

  const bounds = win.getBounds()
  const rs = rollupState.get(memoId)
  const isRolledUp = rs?.isRolledUp ?? false

  const windowState: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    // Save the real height (not the rolled-up 32px)
    height: isRolledUp ? (rs?.prevHeight ?? bounds.height) : bounds.height,
    isRolledUp
  }

  await stateStore.update((state) => {
    state.windows[memoId] = windowState
    return state
  })
}

/** Save the list of currently open memo IDs */
async function saveOpenMemoIds(): Promise<void> {
  const ids = getOpenMemoIds()
  await stateStore.update((state) => {
    state.openMemoIds = ids
    return state
  })
}

/** Close all memo windows */
export function closeAllMemoWindows(): void {
  for (const [, win] of windows) {
    if (!win.isDestroyed()) {
      win.close()
    }
  }
}

/** Register IPC handlers for window management */
export function registerWindowIPC(): void {
  ipcMain.handle('window:create', async (_event, sourceId?: string) => {
    const sourceWin = sourceId ? windows.get(sourceId) : undefined
    const result = await createMemoWindow(undefined, undefined, sourceWin)
    return result ? result.memoId : null
  })

  ipcMain.handle('window:close', (_event, memoId: string) => {
    closeMemoWindow(memoId)
  })

  ipcMain.handle('window:get-open-ids', () => {
    return getOpenMemoIds()
  })

  // Pin (always on top)
  ipcMain.handle('window:toggle-pin', (_event, memoId: string) => {
    const win = windows.get(memoId)
    if (!win || win.isDestroyed()) return false
    const newState = !win.isAlwaysOnTop()
    win.setAlwaysOnTop(newState, 'floating')
    return newState
  })

  ipcMain.handle('window:get-pin', (_event, memoId: string) => {
    const win = windows.get(memoId)
    if (!win || win.isDestroyed()) return false
    return win.isAlwaysOnTop()
  })

  // Rollup (collapse to titlebar)
  ipcMain.handle('window:toggle-rollup', (_event, memoId: string) => {
    const win = windows.get(memoId)
    if (!win || win.isDestroyed()) return false

    // B2: Prevent rapid toggle
    if (transitioning.has(memoId)) return rollupState.get(memoId)?.isRolledUp ?? false
    transitioning.add(memoId)

    const rs = rollupState.get(memoId)
    if (!rs) return false

    if (rs.isRolledUp) {
      // Expand: restore previous height
      win.setMinimumSize(MIN_WIDTH, MIN_HEIGHT)
      win.setSize(win.getBounds().width, rs.prevHeight)
      rs.isRolledUp = false
    } else {
      // Collapse: save current height, shrink to titlebar
      rs.prevHeight = win.getBounds().height
      win.setMinimumSize(MIN_WIDTH, TITLEBAR_HEIGHT)
      win.setSize(win.getBounds().width, TITLEBAR_HEIGHT)
      rs.isRolledUp = true
    }

    // Notify renderer of rollup state change
    win.webContents.send('memo:rollup-changed', rs.isRolledUp)

    // Save state
    saveWindowState(memoId)

    // Release transition lock after brief delay
    setTimeout(() => transitioning.delete(memoId), 300)

    return rs.isRolledUp
  })

  ipcMain.handle('window:get-rollup', (_event, memoId: string) => {
    return rollupState.get(memoId)?.isRolledUp ?? false
  })

  // Set opacity
  ipcMain.handle('window:set-opacity', (_event, memoId: string, opacity: number) => {
    const win = windows.get(memoId)
    if (!win || win.isDestroyed()) return
    // Clamp to 30-100%
    const clamped = Math.max(0.3, Math.min(1, opacity))
    win.setOpacity(clamped)
  })

  // Open external URL in default browser
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    await shell.openExternal(url)
  })
}
