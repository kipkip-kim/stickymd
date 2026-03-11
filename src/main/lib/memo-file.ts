import { readFile, writeFile, rename, readdir, unlink } from 'fs/promises'
import { join } from 'path'
import matter from 'gray-matter'
import { getSaveDir, getSettings } from './store'
import { ipcMain } from 'electron'
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
}
