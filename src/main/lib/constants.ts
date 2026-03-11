import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'

// Paths
export const APP_DATA_DIR = join(app.getPath('appData'), 'StickyMemo')
export const STATE_PATH = join(APP_DATA_DIR, 'state.json')
export const SETTINGS_PATH = join(APP_DATA_DIR, 'settings.json')
export const DEFAULT_SAVE_DIR = join(homedir(), 'Documents', 'StickyMemo')
export const TRASH_DIR_NAME = '.trash'

// Window defaults
export const DEFAULT_WIDTH = 300
export const DEFAULT_HEIGHT = 350
export const MIN_WIDTH = 200
export const MIN_HEIGHT = 150
export const TITLEBAR_HEIGHT = 32
export const CASCADE_OFFSET = 30

// Limits
export const DEFAULT_MAX_OPEN_WINDOWS = 10
