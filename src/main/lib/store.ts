import { mkdir } from 'fs/promises'
import { JsonStore, isPathAccessible } from './json-store'
import {
  APP_DATA_DIR,
  STATE_PATH,
  SETTINGS_PATH,
  DEFAULT_SAVE_DIR,
  TRASH_DIR_NAME
} from './constants'
import {
  DEFAULT_STATE,
  DEFAULT_SETTINGS,
  type AppState,
  type AppSettings
} from './types'
import { join } from 'path'

// Initialize stores
export const stateStore = new JsonStore<AppState>(STATE_PATH, { ...DEFAULT_STATE })
export const settingsStore = new JsonStore<AppSettings>(SETTINGS_PATH, {
  ...DEFAULT_SETTINGS,
  savePath: DEFAULT_SAVE_DIR
})

/** Get current settings (cached read) */
export async function getSettings(): Promise<AppSettings> {
  return settingsStore.read()
}

/** Get the memo save directory, with fallback (B13) */
export async function getSaveDir(): Promise<string> {
  const settings = await getSettings()
  const configuredPath = settings.savePath || DEFAULT_SAVE_DIR

  if (await isPathAccessible(configuredPath)) {
    return configuredPath
  }

  // B13: Fallback to default if configured path is inaccessible
  if (configuredPath !== DEFAULT_SAVE_DIR) {
    console.error(`Save path inaccessible: ${configuredPath}. Falling back to ${DEFAULT_SAVE_DIR}`)
    // Don't update settings — just use default for this session
    // User will be notified via renderer
  }
  return DEFAULT_SAVE_DIR
}

/** Get trash directory path */
export async function getTrashDir(): Promise<string> {
  const saveDir = await getSaveDir()
  return join(saveDir, TRASH_DIR_NAME)
}

/** Ensure all required directories exist */
export async function ensureDirectories(): Promise<void> {
  await mkdir(APP_DATA_DIR, { recursive: true })

  const saveDir = await getSaveDir()
  await mkdir(saveDir, { recursive: true })
  await mkdir(join(saveDir, TRASH_DIR_NAME), { recursive: true })
}
