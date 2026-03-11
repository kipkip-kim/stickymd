import { readFile, writeFile, rename, mkdir, access } from 'fs/promises'
import { dirname } from 'path'

/**
 * Serialized JSON file store with write queue (B1).
 * All writes are queued and executed sequentially to prevent
 * concurrent write corruption.
 */
export class JsonStore<T> {
  private writeQueue: Promise<void> = Promise.resolve()
  private cachedData: T | null = null

  constructor(
    private filePath: string,
    private defaultValue: T
  ) {}

  async read(): Promise<T> {
    if (this.cachedData !== null) return this.cachedData
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as T
      // Merge with defaults so new fields are always present
      this.cachedData = { ...this.defaultValue, ...parsed }
      return this.cachedData
    } catch {
      // B13/state corruption: return default on any read error
      this.cachedData = { ...this.defaultValue }
      return this.cachedData
    }
  }

  /**
   * Enqueue a write. The updater receives current data and returns modified data.
   * Writes are serialized — only one write at a time (B1).
   */
  async update(updater: (data: T) => T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.writeQueue = this.writeQueue.then(async () => {
        try {
          const current = await this.read()
          const updated = updater(current)
          this.cachedData = updated
          await this.writeToDisk(updated)
          resolve(updated)
        } catch (err) {
          reject(err)
        }
      })
    })
  }

  /** Write with temp-file + rename pattern (crash safety) */
  private async writeToDisk(data: T): Promise<void> {
    const dir = dirname(this.filePath)
    await mkdir(dir, { recursive: true })

    const tmpPath = this.filePath + '.tmp'
    const json = JSON.stringify(data, null, 2)
    await writeFile(tmpPath, json, 'utf-8')

    // B25: Windows file lock — retry rename up to 3 times
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await rename(tmpPath, this.filePath)
        return
      } catch {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 100))
        }
      }
    }
    // Fallback: direct write if rename keeps failing
    await writeFile(this.filePath, json, 'utf-8')
  }

  /** Invalidate cache (e.g., after external restore) */
  invalidateCache(): void {
    this.cachedData = null
  }
}

/** Check if a directory path is accessible */
export async function isPathAccessible(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath)
    return true
  } catch {
    return false
  }
}
