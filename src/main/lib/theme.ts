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
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('theme:changed', theme)
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
