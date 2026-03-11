import { listMemos, readMemo, saveMemo } from './memo-file'
import { getWindowByMemoId, createMemoWindow } from './window-manager'
import { stateStore } from './store'
import type { AlarmData, MemoData } from '../../shared/types'

let intervalId: NodeJS.Timeout | null = null
const firedSet = new Set<string>() // "memoId:YYYY-MM-DD:HH:MM"
let lastDateStr = ''

/** Start the alarm scheduler (30s interval) */
export function startAlarmScheduler(): void {
  if (intervalId) return
  lastDateStr = todayStr()
  intervalId = setInterval(() => {
    checkAlarms().catch((e) => console.error('checkAlarms error:', e))
  }, 30_000)
}

/** Stop the alarm scheduler */
export function stopAlarmScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Check all memos for alarms that should fire */
async function checkAlarms(): Promise<void> {
  const today = todayStr()

  // Clear firedSet at midnight
  if (today !== lastDateStr) {
    firedSet.clear()
    lastDateStr = today
  }

  const now = new Date()
  const timeStr = nowHHMM()
  const memos = await listMemos()

  for (const memo of memos) {
    const alarm = memo.frontmatter.alarm
    if (!alarm || !alarm.enabled) continue

    if (!shouldFire(alarm, now, today, timeStr)) continue

    const dedupKey = `${memo.id}:${today}:${timeStr}`
    if (firedSet.has(dedupKey)) continue

    firedSet.add(dedupKey)
    await fireAlarm(memo.id, memo)
    await autoDisableIfExpired(memo.id, alarm, today)
  }
}

/** Determine if an alarm should fire right now */
function shouldFire(alarm: AlarmData, now: Date, today: string, timeStr: string): boolean {
  if (alarm.time !== timeStr) return false

  switch (alarm.type) {
    case 'once':
      return alarm.date === today

    case 'daily':
      return true

    case 'weekdays':
      return alarm.weekdays?.includes(now.getDay()) ?? false

    case 'daterange':
      if (!alarm.startDate || !alarm.endDate) return false
      return alarm.startDate <= today && today <= alarm.endDate

    default:
      return false
  }
}

/** Fire an alarm — bring window to front and notify renderer */
async function fireAlarm(memoId: string, _memo: MemoData): Promise<void> {
  let win = getWindowByMemoId(memoId)

  // If window doesn't exist, create it
  if (!win || win.isDestroyed()) {
    const state = await stateStore.read()
    const result = await createMemoWindow(memoId, state.windows[memoId])
    if (result) win = result.window
    else return
  }

  // Restore if minimized
  if (win.isMinimized()) win.restore()

  // Bring to top temporarily if not already pinned
  const wasPinned = win.isAlwaysOnTop()
  if (!wasPinned) {
    win.setAlwaysOnTop(true, 'floating')
    // Restore after 5 seconds
    const w = win
    setTimeout(() => {
      if (w.isDestroyed()) return
      // Only restore if still on top (user may have pinned/unpinned manually)
      if (w.isAlwaysOnTop()) {
        w.setAlwaysOnTop(false)
      }
    }, 5000)
  }

  win.focus()
  win.flashFrame(true)
  win.webContents.send('memo:alarm-fired')
}

/** Auto-disable expired alarms */
async function autoDisableIfExpired(
  memoId: string,
  alarm: AlarmData,
  today: string
): Promise<void> {
  let shouldDisable = false

  if (alarm.type === 'once') {
    shouldDisable = true
  } else if (alarm.type === 'daterange' && alarm.endDate && alarm.endDate <= today) {
    shouldDisable = true
  }

  if (shouldDisable) {
    const memo = await readMemo(memoId)
    if (memo) {
      await saveMemo(memoId, memo.content, {
        alarm: { ...alarm, enabled: false }
      })
    }
  }
}
