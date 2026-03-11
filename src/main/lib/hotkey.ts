import { globalShortcut, BrowserWindow } from 'electron'
import { createMemoWindow } from './window-manager'
import { getSettings } from './store'

let currentAccelerator: string | null = null

/** Register the global hotkey from settings */
export async function registerGlobalHotkey(): Promise<void> {
  const settings = await getSettings()
  const accelerator = settings.globalHotkey
  if (!accelerator) return

  registerAccelerator(accelerator)
}

function registerAccelerator(accelerator: string): void {
  try {
    const success = globalShortcut.register(accelerator, () => {
      const windows = BrowserWindow.getAllWindows()
        .filter((w) => !w.isDestroyed() && w.webContents.getURL().indexOf('#manager') === -1)

      if (windows.length > 0) {
        // Focus the most recently focused memo window
        const win = windows[0]
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      } else {
        // No memo windows open → create new
        createMemoWindow()
      }
    })

    if (success) {
      currentAccelerator = accelerator
    } else {
      console.warn(`Global hotkey registration failed: ${accelerator}`)
    }
  } catch (e) {
    console.warn(`Global hotkey error: ${accelerator}`, e)
  }
}

/** Update the global hotkey (called when settings change) */
export function updateGlobalHotkey(newAccelerator: string): boolean {
  unregisterGlobalHotkey()
  if (!newAccelerator) return true

  try {
    const success = globalShortcut.register(newAccelerator, () => {
      const windows = BrowserWindow.getAllWindows()
        .filter((w) => !w.isDestroyed() && w.webContents.getURL().indexOf('#manager') === -1)

      if (windows.length > 0) {
        const win = windows[0]
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      } else {
        createMemoWindow()
      }
    })

    if (success) {
      currentAccelerator = newAccelerator
      return true
    }
    return false
  } catch {
    return false
  }
}

/** Unregister the current global hotkey */
export function unregisterGlobalHotkey(): void {
  if (currentAccelerator) {
    try {
      globalShortcut.unregister(currentAccelerator)
    } catch { /* already unregistered */ }
    currentAccelerator = null
  }
}
