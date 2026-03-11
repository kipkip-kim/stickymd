import { app, BrowserWindow, dialog } from 'electron'
import { ensureDirectories, stateStore, getSettings } from './lib/store'
import {
  createMemoWindow,
  registerWindowIPC
} from './lib/window-manager'
import { createTray, destroyTray } from './lib/tray'
import { registerMemoFileIPC, readMemo } from './lib/memo-file'
import { registerManagerIPC } from './lib/manager-window'

// B22: Single instance lock — second launch focuses the first instance
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const win = windows[0]
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    // Ensure directories exist before anything else
    await ensureDirectories()

    // Register IPC handlers
    registerWindowIPC()
    registerMemoFileIPC()
    registerManagerIPC()

    // Create system tray
    createTray()

    // Restore state or create new memo
    await restoreOrCreateMemo()
  })

  // Keep app running when all windows closed — tray keeps app alive
  app.on('window-all-closed', () => {
    // Don't quit
  })

  app.on('before-quit', () => {
    destroyTray()
  })
}

/** Restore previously open memos, or create a new one */
async function restoreOrCreateMemo(): Promise<void> {
  const state = await stateStore.read()
  const settings = await getSettings()

  if (state.openMemoIds.length === 0) {
    await createMemoWindow()
    return
  }

  // B14: Limit restoration to maxOpenWindows
  const idsToRestore = state.openMemoIds.slice(0, settings.maxOpenWindows)
  const skipped = state.openMemoIds.length - idsToRestore.length

  let restoredCount = 0
  for (const id of idsToRestore) {
    // Verify memo file still exists
    const memo = await readMemo(id)
    if (!memo) continue // Skip deleted/missing memo IDs

    const windowState = state.windows[id]
    await createMemoWindow(id, windowState)
    restoredCount++
  }

  // B14: Notify if some memos were skipped
  if (skipped > 0) {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      dialog.showMessageBox(wins[0], {
        type: 'info',
        title: 'Sticky Memo',
        message: `동시 오픈 제한(${settings.maxOpenWindows}개)으로 ${skipped}개 메모가 복원되지 않았습니다.`,
        buttons: ['확인']
      })
    }
  }

  // If nothing was restored (all files missing), create a new memo
  if (restoredCount === 0) {
    await createMemoWindow()
  }
}
