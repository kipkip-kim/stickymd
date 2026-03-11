import { readFile, writeFile, rename, readdir, unlink, stat } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import matter from 'gray-matter'
import { getSaveDir, getTrashDir, getSettings } from './store'
import { closeMemoWindow } from './window-manager'
import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { MemoFrontmatter, MemoData } from '../../shared/types'

export type { MemoFrontmatter, MemoData }

/** Track last saved content per memoId to avoid unnecessary writes (B6) */
const lastSavedContent = new Map<string, string>()

/** IDs currently being deleted — skip auto-save for these (B8) */
export const pendingDeleteIds = new Set<string>()

/** Extract title from markdown content */
function extractTitle(content: string): string {
  if (!content || !content.trim()) return '새 메모'

  // Get first text line, strip markdown symbols
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Strip markdown heading markers, bold, italic, code, etc.
    const cleaned = trimmed
      .replace(/^#{1,6}\s+/, '')
      .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .trim()
    if (cleaned) return cleaned
  }
  return '새 메모'
}

/** Read a memo .md file */
export async function readMemo(memoId: string): Promise<MemoData | null> {
  const saveDir = await getSaveDir()
  const filePath = join(saveDir, `${memoId}.md`)

  try {
    const raw = await readFile(filePath, 'utf-8')
    // B5: excerpt: false to prevent --- confusion
    const parsed = matter(raw, { excerpt: false })

    const fm = parsed.data as Partial<MemoFrontmatter>
    const frontmatter: MemoFrontmatter = {
      title: fm.title || extractTitle(parsed.content),
      created: fm.created || new Date().toISOString(),
      modified: fm.modified || new Date().toISOString(),
      color: fm.color || '#FFF9B1',
      pinned: fm.pinned ?? false,
      opacity: fm.opacity ?? 1,
      fontSize: fm.fontSize ?? 16,
      ...(fm.alarm ? { alarm: fm.alarm } : {})
    }

    // Cache content for B6 comparison
    lastSavedContent.set(memoId, parsed.content)

    return { id: memoId, frontmatter, content: parsed.content }
  } catch {
    return null
  }
}

/** Save a memo to .md file */
export async function saveMemo(
  memoId: string,
  content: string,
  frontmatterUpdates?: Partial<MemoFrontmatter>
): Promise<void> {
  // B8: Skip save if memo is being deleted
  if (pendingDeleteIds.has(memoId)) return

  // B6: Skip if content hasn't changed and no frontmatter updates
  const lastContent = lastSavedContent.get(memoId)
  if (lastContent === content && !frontmatterUpdates) return

  const saveDir = await getSaveDir()
  const filePath = join(saveDir, `${memoId}.md`)

  // Read existing frontmatter
  let existingFm: MemoFrontmatter
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = matter(raw, { excerpt: false })
    existingFm = parsed.data as MemoFrontmatter
  } catch {
    // New file
    existingFm = {
      title: extractTitle(content),
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      color: '#FFF9B1',
      pinned: false,
      opacity: 1,
      fontSize: 16
    }
  }

  // Merge updates
  const fm: MemoFrontmatter = {
    ...existingFm,
    ...frontmatterUpdates,
    title: extractTitle(content) || existingFm.title,
    modified: new Date().toISOString()
  }

  // Handle explicit alarm deletion (clearAlarm passes alarm: undefined)
  if (frontmatterUpdates && 'alarm' in frontmatterUpdates && frontmatterUpdates.alarm === undefined) {
    delete fm.alarm
  }

  // Compose file with frontmatter
  const fileContent = matter.stringify(content, fm)

  // Write with temp-file + rename pattern (crash safety)
  const tmpPath = filePath + '.tmp'
  await writeFile(tmpPath, fileContent, 'utf-8')

  // B25: Windows file lock — retry rename
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await rename(tmpPath, filePath)
      lastSavedContent.set(memoId, content)
      return
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 100))
      }
    }
  }

  // Fallback: direct write
  await writeFile(filePath, fileContent, 'utf-8')
  lastSavedContent.set(memoId, content)
}

/** Delete empty memo file (B20) */
export async function deleteEmptyMemo(memoId: string): Promise<void> {
  const saveDir = await getSaveDir()
  const filePath = join(saveDir, `${memoId}.md`)
  try {
    await unlink(filePath)
  } catch {
    // File may not exist yet
  }
  lastSavedContent.delete(memoId)
}

/** List all memo files */
export async function listMemos(): Promise<MemoData[]> {
  const saveDir = await getSaveDir()
  try {
    const files = await readdir(saveDir)
    const memoFiles = files.filter((f) => f.endsWith('.md'))

    const memos: MemoData[] = []
    for (const file of memoFiles) {
      const id = file.replace('.md', '')
      const memo = await readMemo(id)
      if (memo) memos.push(memo)
    }
    return memos
  } catch {
    return []
  }
}

/** Get a suitable parent window for dialogs */
function getDialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined
}

/** Export a memo to user-chosen location */
export async function exportMemo(memoId: string, includeFrontmatter: boolean): Promise<boolean> {
  const memo = await readMemo(memoId)
  if (!memo) return false

  const parent = getDialogParent()
  if (!parent) return false

  const defaultName = `${memo.frontmatter.title.replace(/[<>:"/\\|?*]/g, '_')}.md`
  const result = await dialog.showSaveDialog(parent, {
    defaultPath: defaultName,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })

  if (result.canceled || !result.filePath) return false

  try {
    let content: string
    if (includeFrontmatter) {
      content = await readFile(join(await getSaveDir(), `${memoId}.md`), 'utf-8')
    } else {
      content = memo.content
    }
    await writeFile(result.filePath, content, 'utf-8')
    return true
  } catch (e) {
    console.error('exportMemo write failed:', e)
    return false
  }
}

/** Import a memo from user-chosen file */
export async function importMemo(): Promise<MemoData | null> {
  const parent = getDialogParent()
  if (!parent) return null

  const result = await dialog.showOpenDialog(parent, {
    filters: [
      { name: 'Markdown / Text', extensions: ['md', 'txt'] }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) return null

  try {
    const filePath = result.filePaths[0]
    const ext = extname(filePath).toLowerCase()
    const raw = await readFile(filePath, 'utf-8')

    let content: string
    let fm: Partial<MemoFrontmatter> = {}

    if (ext === '.txt') {
      content = raw
    } else {
      const parsed = matter(raw, { excerpt: false })
      content = parsed.content
      fm = parsed.data as Partial<MemoFrontmatter>
    }

    const newId = randomUUID()
    const saveDir = await getSaveDir()

    const frontmatter: MemoFrontmatter = {
      title: fm.title || extractTitle(content),
      created: fm.created || new Date().toISOString(),
      modified: new Date().toISOString(),
      color: fm.color || '#FFF9B1',
      pinned: fm.pinned ?? false,
      opacity: fm.opacity ?? 1,
      fontSize: fm.fontSize ?? 16,
      ...(fm.alarm ? { alarm: fm.alarm } : {})
    }

    const fileContent = matter.stringify(content, frontmatter)
    await writeFile(join(saveDir, `${newId}.md`), fileContent, 'utf-8')

    return { id: newId, frontmatter, content }
  } catch (e) {
    console.error('importMemo failed:', e)
    return null
  }
}

/** Import a memo from a file path (drag-and-drop) */
export async function importMemoFromPath(filePath: string): Promise<MemoData | { error: string }> {
  const ext = extname(filePath).toLowerCase()
  if (ext !== '.md' && ext !== '.txt') {
    return { error: 'unsupported' }
  }

  try {
    const fileStat = await stat(filePath)
    if (fileStat.size > 500 * 1024) {
      return { error: 'too-large' }
    }

    const raw = await readFile(filePath, 'utf-8')
    let content: string
    let fm: Partial<MemoFrontmatter> = {}

    if (ext === '.md') {
      const parsed = matter(raw, { excerpt: false })
      content = parsed.content
      fm = parsed.data as Partial<MemoFrontmatter>
    } else {
      content = raw
    }

    const newId = randomUUID()
    const saveDir = await getSaveDir()
    const frontmatter: MemoFrontmatter = {
      title: fm.title || extractTitle(content),
      created: fm.created || new Date().toISOString(),
      modified: new Date().toISOString(),
      color: fm.color || '#FFF9B1',
      pinned: fm.pinned ?? false,
      opacity: fm.opacity ?? 1,
      fontSize: fm.fontSize ?? 16,
      ...(fm.alarm ? { alarm: fm.alarm } : {})
    }

    const fileContent = matter.stringify(content, frontmatter)
    await writeFile(join(saveDir, `${newId}.md`), fileContent, 'utf-8')

    return { id: newId, frontmatter, content }
  } catch {
    return { error: 'read-failed' }
  }
}

/** Move memo to trash (B8: mark as pending delete to skip auto-save) */
export async function deleteMemo(memoId: string): Promise<boolean> {
  pendingDeleteIds.add(memoId)
  try {
    const saveDir = await getSaveDir()
    const trashDir = await getTrashDir()
    const src = join(saveDir, `${memoId}.md`)
    const dest = join(trashDir, `${memoId}.md`)
    await rename(src, dest)
    lastSavedContent.delete(memoId)
    return true
  } catch (e) {
    console.error('deleteMemo failed:', e)
    return false
  } finally {
    pendingDeleteIds.delete(memoId)
  }
}

/** Permanently delete a memo from trash */
export async function deletePermanent(memoId: string): Promise<boolean> {
  try {
    const trashDir = await getTrashDir()
    await unlink(join(trashDir, `${memoId}.md`))
    return true
  } catch (e) {
    console.error('deletePermanent failed:', e)
    return false
  }
}

/** Restore a memo from trash */
export async function restoreMemo(memoId: string): Promise<boolean> {
  try {
    const saveDir = await getSaveDir()
    const trashDir = await getTrashDir()
    const src = join(trashDir, `${memoId}.md`)
    const dest = join(saveDir, `${memoId}.md`)
    await rename(src, dest)
    return true
  } catch (e) {
    console.error('restoreMemo failed:', e)
    return false
  }
}

/** List memos in trash */
export async function listTrash(): Promise<MemoData[]> {
  const trashDir = await getTrashDir()
  try {
    const files = await readdir(trashDir)
    const memoFiles = files.filter((f) => f.endsWith('.md'))

    const memos: MemoData[] = []
    for (const file of memoFiles) {
      const id = file.replace('.md', '')
      const filePath = join(trashDir, file)
      try {
        const raw = await readFile(filePath, 'utf-8')
        const parsed = matter(raw, { excerpt: false })
        const fm = parsed.data as Partial<MemoFrontmatter>
        const frontmatter: MemoFrontmatter = {
          title: fm.title || extractTitle(parsed.content),
          created: fm.created || new Date().toISOString(),
          modified: fm.modified || new Date().toISOString(),
          color: fm.color || '#FFF9B1',
          pinned: fm.pinned ?? false,
          opacity: fm.opacity ?? 1,
          fontSize: fm.fontSize ?? 16,
          ...(fm.alarm ? { alarm: fm.alarm } : {})
        }
        memos.push({ id, frontmatter, content: parsed.content })
      } catch {
        // Skip unreadable files
      }
    }
    return memos
  } catch {
    return []
  }
}

/** Auto-purge old trash files (called on app start) */
export async function purgeOldTrash(): Promise<number> {
  const settings = await getSettings()
  const trashDir = await getTrashDir()
  const maxAge = settings.trashDays * 24 * 60 * 60 * 1000
  const now = Date.now()
  let purged = 0

  try {
    const files = await readdir(trashDir)
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      try {
        const filePath = join(trashDir, file)
        const fileStat = await stat(filePath)
        if (now - fileStat.mtimeMs > maxAge) {
          await unlink(filePath)
          purged++
        }
      } catch {
        // Skip files that can't be stat'd or deleted
      }
    }
  } catch {
    // Trash dir may not exist
  }
  return purged
}

/** Read an external .md or .txt file — returns body content only */
export async function readExternalFile(
  filePath: string
): Promise<{ content: string } | { error: string }> {
  const ext = extname(filePath).toLowerCase()
  if (ext !== '.md' && ext !== '.txt') {
    return { error: 'unsupported' }
  }

  try {
    const fileStat = await stat(filePath)
    if (fileStat.size > 500 * 1024) {
      return { error: 'too-large' }
    }

    const raw = await readFile(filePath, 'utf-8')

    if (ext === '.md') {
      const parsed = matter(raw, { excerpt: false })
      return { content: parsed.content }
    }
    // .txt
    return { content: raw }
  } catch {
    return { error: 'read-failed' }
  }
}

/** Register IPC handlers for memo file operations */
export function registerMemoFileIPC(): void {
  ipcMain.handle('memo:read', async (_event, memoId: string) => {
    return readMemo(memoId)
  })

  ipcMain.handle(
    'memo:save',
    async (_event, memoId: string, content: string, frontmatterUpdates?: Partial<MemoFrontmatter>) => {
      await saveMemo(memoId, content, frontmatterUpdates)
    }
  )

  ipcMain.handle('memo:delete-empty', async (_event, memoId: string) => {
    await deleteEmptyMemo(memoId)
  })

  ipcMain.handle('memo:list', async () => {
    return listMemos()
  })

  ipcMain.handle('settings:get-auto-save-ms', async () => {
    const settings = await getSettings()
    return settings.autoSaveSeconds * 1000
  })

  ipcMain.handle('memo:export', async (_event, memoId: string, includeFrontmatter: boolean) => {
    return exportMemo(memoId, includeFrontmatter)
  })

  ipcMain.handle('memo:import', async () => {
    return importMemo()
  })

  // Trash operations
  ipcMain.handle('memo:delete', async (_event, memoId: string) => {
    closeMemoWindow(memoId)
    return deleteMemo(memoId)
  })

  ipcMain.handle('memo:delete-permanent', async (_event, memoId: string) => {
    return deletePermanent(memoId)
  })

  ipcMain.handle('memo:restore', async (_event, memoId: string) => {
    return restoreMemo(memoId)
  })

  ipcMain.handle('memo:list-trash', async () => {
    return listTrash()
  })

  ipcMain.handle('memo:read-external-file', async (_event, filePath: string) => {
    return readExternalFile(filePath)
  })

  ipcMain.handle('memo:import-from-path', async (_event, filePath: string) => {
    return importMemoFromPath(filePath)
  })

  // Alarm operations
  ipcMain.handle('memo:set-alarm', async (_event, memoId: string, alarm: MemoFrontmatter['alarm']) => {
    const memo = await readMemo(memoId)
    if (!memo) return false
    await saveMemo(memoId, memo.content, { alarm })
    return true
  })

  ipcMain.handle('memo:clear-alarm', async (_event, memoId: string) => {
    const memo = await readMemo(memoId)
    if (!memo) return false
    await saveMemo(memoId, memo.content, { alarm: undefined })
    return true
  })

  ipcMain.handle('memo:get-alarm', async (_event, memoId: string) => {
    const memo = await readMemo(memoId)
    return memo?.frontmatter.alarm ?? null
  })
}
