import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { settingsStore, stateStore, getSaveDir } from './store'
import { isPathAccessible } from './json-store'
import { closeAllMemoWindows } from './window-manager'
import { TRASH_DIR_NAME } from './constants'
import type { AppSettings } from '../../shared/types'
import type { AppState } from './types'
import { onDarkModeSettingChanged } from './theme'

interface BackupBundle {
  version: 1
  settings: AppSettings
  state: unknown
  memos: { filename: string; content: string }[]
}

/** Get a suitable parent window for dialogs */
function getDialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
}

/** Validate a directory path is accessible or can be created */
async function validateSavePath(dirPath: string): Promise<{ valid: boolean; error?: string }> {
  if (!dirPath || !dirPath.trim()) {
    return { valid: false, error: '경로를 입력해주세요.' }
  }

  try {
    await mkdir(dirPath, { recursive: true })
    if (await isPathAccessible(dirPath)) {
      return { valid: true }
    }
    return { valid: false, error: '경로에 접근할 수 없습니다.' }
  } catch {
    return { valid: false, error: '유효하지 않은 경로입니다.' }
  }
}

/** Create a backup bundle (B29: snapshot file list first) */
async function createBackup(): Promise<boolean> {
  const parent = getDialogParent()
  if (!parent) return false

  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
  const defaultName = `backup_${dateStr}.json`

  const result = await dialog.showSaveDialog(parent, {
    defaultPath: defaultName,
    filters: [{ name: 'Sticky Memo Backup', extensions: ['json'] }]
  })

  if (result.canceled || !result.filePath) return false

  try {
    const saveDir = await getSaveDir()
    const settings = await settingsStore.read()
    const state = await stateStore.read()

    // B29: Snapshot file list before reading
    const files = await readdir(saveDir)
    const mdFiles = files.filter((f) => f.endsWith('.md'))

    const memos: BackupBundle['memos'] = []
    for (const file of mdFiles) {
      try {
        const content = await readFile(join(saveDir, file), 'utf-8')
        memos.push({ filename: file, content })
      } catch {
        // Skip unreadable files
      }
    }

    // Also include trash
    const trashDir = join(saveDir, TRASH_DIR_NAME)
    try {
      const trashFiles = await readdir(trashDir)
      for (const file of trashFiles.filter((f) => f.endsWith('.md'))) {
        try {
          const content = await readFile(join(trashDir, file), 'utf-8')
          memos.push({ filename: `.trash/${file}`, content })
        } catch {
          // Skip
        }
      }
    } catch {
      // Trash dir may not exist
    }

    const bundle: BackupBundle = {
      version: 1,
      settings,
      state,
      memos
    }

    await writeFile(result.filePath, JSON.stringify(bundle, null, 2), 'utf-8')
    return true
  } catch (e) {
    console.error('createBackup failed:', e)
    return false
  }
}

/** Restore from a backup bundle (B24: close all windows first) */
async function restoreBackup(): Promise<boolean> {
  const parent = getDialogParent()
  if (!parent) return false

  const openResult = await dialog.showOpenDialog(parent, {
    filters: [{ name: 'Sticky Memo Backup', extensions: ['json'] }],
    properties: ['openFile']
  })

  if (openResult.canceled || openResult.filePaths.length === 0) return false

  // Confirm
  const confirm = await dialog.showMessageBox(parent, {
    type: 'warning',
    title: '백업 복원',
    message: '현재 모든 메모와 설정이 백업 데이터로 교체됩니다. 계속하시겠습니까?',
    buttons: ['취소', '복원'],
    defaultId: 0,
    cancelId: 0
  })

  if (confirm.response !== 1) return false

  try {
    const raw = await readFile(openResult.filePaths[0], 'utf-8')
    const bundle = JSON.parse(raw) as BackupBundle

    if (bundle.version !== 1 || !bundle.memos || !bundle.settings) {
      await dialog.showMessageBox(parent, {
        type: 'error',
        title: '복원 실패',
        message: '유효하지 않은 백업 파일입니다.',
        buttons: ['확인']
      })
      return false
    }

    // B24: Close all windows before restoring (no save)
    closeAllMemoWindows()

    // Restore settings
    await settingsStore.update(() => bundle.settings)

    // Restore state
    await stateStore.update(() => bundle.state as AppState)

    // Restore memo files
    const saveDir = await getSaveDir()
    await mkdir(saveDir, { recursive: true })
    await mkdir(join(saveDir, TRASH_DIR_NAME), { recursive: true })

    for (const memo of bundle.memos) {
      try {
        const targetPath = join(saveDir, memo.filename)
        // Ensure subdirectory exists (for .trash/)
        await mkdir(join(targetPath, '..'), { recursive: true })
        await writeFile(targetPath, memo.content, 'utf-8')
      } catch {
        // Skip unwritable files
      }
    }

    // Invalidate caches
    settingsStore.invalidateCache()
    stateStore.invalidateCache()

    await dialog.showMessageBox(parent, {
      type: 'info',
      title: '복원 완료',
      message: '백업이 복원되었습니다. 앱을 재시작합니다.',
      buttons: ['확인']
    })

    // Restart app
    app.relaunch()
    app.exit(0)

    return true
  } catch (e) {
    console.error('restoreBackup failed:', e)
    try {
      const p = getDialogParent()
      if (p) {
        await dialog.showMessageBox(p, {
          type: 'error',
          title: '복원 실패',
          message: '백업 파일을 읽는 중 오류가 발생했습니다.',
          buttons: ['확인']
        })
      }
    } catch {
      // Dialog may fail if no window
    }
    return false
  }
}

/** Select directory via dialog */
async function selectDirectory(): Promise<string | null> {
  const parent = getDialogParent()
  if (!parent) return null

  const result = await dialog.showOpenDialog(parent, {
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

/** Register settings IPC handlers */
export function registerSettingsIPC(): void {
  // Get full settings
  ipcMain.handle('settings:get', async () => {
    return settingsStore.read()
  })

  // Update settings (partial, B27: immediate save)
  ipcMain.handle('settings:update', async (_event, updates: Partial<AppSettings>) => {
    // Validate save path if changed
    if (updates.savePath !== undefined) {
      const validation = await validateSavePath(updates.savePath)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }
      // Ensure directories exist at new path
      await mkdir(updates.savePath, { recursive: true })
      await mkdir(join(updates.savePath, TRASH_DIR_NAME), { recursive: true })
    }

    // Apply auto-start setting
    if (updates.autoStart !== undefined) {
      app.setLoginItemSettings({ openAtLogin: updates.autoStart })
    }

    const updated = await settingsStore.update((current) => ({
      ...current,
      ...updates
    }))

    // Broadcast theme change if darkMode was updated
    if (updates.darkMode !== undefined) {
      onDarkModeSettingChanged().catch((e) => console.error('theme broadcast failed:', e))
    }

    return { success: true, settings: updated }
  })

  // Select directory dialog
  ipcMain.handle('settings:select-directory', async () => {
    return selectDirectory()
  })

  // Backup
  ipcMain.handle('settings:backup', async () => {
    return createBackup()
  })

  // Restore
  ipcMain.handle('settings:restore', async () => {
    return restoreBackup()
  })
}
