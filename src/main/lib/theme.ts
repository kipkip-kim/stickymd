import { nativeTheme, ipcMain, BrowserWindow } from 'electron'
import { getSettings } from './store'

export type EffectiveTheme = 'light' | 'dark'

/** Resolve the effective theme based on user setting + system preference */
export async function getEffectiveTheme(): Promise<EffectiveTheme> {
  const settings = await getSettings()
  if (settings.darkMode === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
  return settings.darkMode === 'dark' ? 'dark' : 'light'
}

/** Broadcast theme change to all renderer windows */
function broadcastTheme(theme: EffectiveTheme): void {
  const isDark = theme === 'dark'
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('theme:changed', theme)
      // Update titleBarOverlay for windows that use it (e.g. manager)
      if (win.setTitleBarOverlay) {
        try {
          win.setTitleBarOverlay(isDark
            ? { color: '#1e1e1e', symbolColor: '#e0e0e0' }
            : { color: '#ffffff', symbolColor: '#333333' }
          )
        } catch { /* not all windows have overlay */ }
      }
    }
  }
}

/** Register theme IPC + listen for system theme changes */
export function registerThemeIPC(): void {
  ipcMain.handle('theme:get', async () => {
    return getEffectiveTheme()
  })

  // When system theme changes, broadcast to all windows if setting is 'system'
  nativeTheme.on('updated', async () => {
    const theme = await getEffectiveTheme()
    broadcastTheme(theme)
  })
}

/** Called when settings.darkMode changes — broadcast new effective theme */
export async function onDarkModeSettingChanged(): Promise<void> {
  const theme = await getEffectiveTheme()
  broadcastTheme(theme)
}
