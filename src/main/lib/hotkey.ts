import { globalShortcut, BrowserWindow } from 'electron'
import { createMemoWindow } from './window-manager'
import { getSettings } from './store'

let currentAccelerator: string | null = null

/** The hotkey callback — focus memo or create new */
function hotkeyCallback(): void {
  console.log('[hotkey] callback fired')
  try {
    const windows = BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed() && w.webContents.getURL().indexOf('#manager') === -1)

    console.log(`[hotkey] memo windows: ${windows.length}`)

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
  console.log(`[hotkey] startup register "${accelerator}": ${success}`)
}

function registerAccelerator(accelerator: string): boolean {
  try {
    const success = globalShortcut.register(accelerator, hotkeyCallback)
    if (success) {
      currentAccelerator = accelerator
      console.log(`[hotkey] registered: ${accelerator}, isRegistered=${globalShortcut.isRegistered(accelerator)}`)
      return true
    }
    console.warn(`[hotkey] register returned false: ${accelerator}`)
    return false
  } catch (e) {
    console.warn(`[hotkey] register error: ${accelerator}`, e)
    return false
  }
}

/** Update the global hotkey (called when settings change) */
export function updateGlobalHotkey(newAccelerator: string): boolean {
  console.log(`[hotkey] updateGlobalHotkey: "${newAccelerator}" (current: "${currentAccelerator}")`)
  unregisterGlobalHotkey()
  if (!newAccelerator) return true
  return registerAccelerator(newAccelerator)
}

/** Unregister the current global hotkey */
export function unregisterGlobalHotkey(): void {
  if (currentAccelerator) {
    try {
      globalShortcut.unregister(currentAccelerator)
      console.log(`[hotkey] unregistered: ${currentAccelerator}`)
    } catch { /* already unregistered */ }
    currentAccelerator = null
  }
}
