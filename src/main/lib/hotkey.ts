import { globalShortcut, BrowserWindow, app } from 'electron'
import { createMemoWindow } from './window-manager'
import { getSettings } from './store'

let currentAccelerator: string | null = null
const isDev = !app.isPackaged

/** The hotkey callback — focus memo or create new */
function hotkeyCallback(): void {
  try {
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
  } catch (e) {
    console.error('[hotkey] callback error:', e)
  }
}

/** Register the global hotkey from settings */
export async function registerGlobalHotkey(): Promise<void> {
  const settings = await getSettings()
  const accelerator = settings.globalHotkey
  if (!accelerator) return

  const success = registerAccelerator(accelerator)
  if (isDev) console.log(`[hotkey] startup register "${accelerator}": ${success}`)
}

function registerAccelerator(accelerator: string): boolean {
  try {
    const success = globalShortcut.register(accelerator, hotkeyCallback)
    if (success) {
      currentAccelerator = accelerator
      if (isDev) console.log(`[hotkey] registered: ${accelerator}`)
      return true
    }
    if (isDev) console.warn(`[hotkey] register returned false: ${accelerator}`)
    return false
  } catch (e) {
    if (isDev) console.warn(`[hotkey] register error: ${accelerator}`, e)
    return false
  }
}

/** Update the global hotkey (called when settings change) */
export function updateGlobalHotkey(newAccelerator: string): boolean {
  if (isDev) console.log(`[hotkey] updateGlobalHotkey: "${newAccelerator}" (current: "${currentAccelerator}")`)
  unregisterGlobalHotkey()
  if (!newAccelerator) return true
  return registerAccelerator(newAccelerator)
}

/** Unregister the current global hotkey */
export function unregisterGlobalHotkey(): void {
  if (currentAccelerator) {
    try {
      globalShortcut.unregister(currentAccelerator)
      if (isDev) console.log(`[hotkey] unregistered: ${currentAccelerator}`)
    } catch { /* already unregistered */ }
    currentAccelerator = null
  }
}
