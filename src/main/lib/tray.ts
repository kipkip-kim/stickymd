import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createMemoWindow, getOpenMemoIds } from './window-manager'
import { openManagerWindow } from './manager-window'
import { stateStore } from './store'

let tray: Tray | null = null

/** Create and initialize system tray */
export function createTray(): void {
  // Use icon from resources, fallback to a generated icon
  const iconPath = join(__dirname, '../../resources/icon.png')
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) throw new Error('Empty icon')
    // Resize for tray (16x16 on Windows, will auto-scale from 256x256)
    icon = icon.resize({ width: 16, height: 16 })
  } catch {
    // Fallback: create a simple yellow square icon
    icon = createFallbackIcon()
  }

  tray = new Tray(icon)
  tray.setToolTip('Sticky MD')

  // Build context menu
  updateTrayMenu()

  // Double-click: restore last state (show all previously open memos)
  tray.on('double-click', async () => {
    await restoreWindows()
  })
}

/** Update tray context menu */
function updateTrayMenu(): void {
  if (!tray) return

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '새 메모',
      click: async () => {
        await createMemoWindow()
      }
    },
    {
      label: '관리자 창',
      click: () => {
        openManagerWindow()
      }
    },
    { type: 'separator' },
    {
      label: '설정',
      click: () => {
        openManagerWindow('settings')
      }
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

/** Restore windows from saved state */
async function restoreWindows(): Promise<void> {
  const openIds = getOpenMemoIds()
  if (openIds.length > 0) {
    // If windows are already open, just show/focus the first one
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (win.isMinimized()) win.restore()
      win.show()
    }
    if (windows.length > 0) windows[0].focus()
    return
  }

  // No windows open — restore from state
  const state = await stateStore.read()
  if (state.openMemoIds.length === 0) {
    // Nothing to restore, create a new memo
    await createMemoWindow()
    return
  }

  for (const id of state.openMemoIds) {
    const windowState = state.windows[id]
    await createMemoWindow(id, windowState)
  }
}

/** Create a simple fallback tray icon (yellow square) */
function createFallbackIcon(): Electron.NativeImage {
  // L1: Use 32x32 instead of 256x256 (tray only needs 16x16, 32x32 is sufficient for HiDPI)
  const size = 32
  const canvas = Buffer.alloc(size * size * 4)
  // Fill with yellow (#FFF9B1)
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4] = 0xff     // R
    canvas[i * 4 + 1] = 0xf9 // G
    canvas[i * 4 + 2] = 0xb1 // B
    canvas[i * 4 + 3] = 0xff // A
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

/** Destroy tray on app quit */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
