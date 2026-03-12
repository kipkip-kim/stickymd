# Phase 13b Design: Alarm System

> **Feature**: Memo Alarm (Reminder) System
> **Author**: designer
> **Created**: 2026-03-12
> **Status**: Draft
> **Plan Reference**: docs/01-plan/features/phase13b.plan.md

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Main Process                                            │
│                                                         │
│  alarm-scheduler.ts                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │ AlarmScheduler                                   │   │
│  │  - start() → setInterval(check, 30s)            │   │
│  │  - stop() → clearInterval                       │   │
│  │  - checkAlarms() → iterate memos, match time    │   │
│  │  - fireAlarm(memoId, title) → Notification      │   │
│  │  - firedSet: Set<string> → "memoId:HH:MM" keys │   │
│  │  - resetFiredAtMidnight()                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  memo-file.ts (IPC handlers)                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ memo:set-alarm   → saveMemo(id, content, {alarm})│   │
│  │ memo:clear-alarm → saveMemo(id, content, {alarm})│   │
│  │ memo:get-alarm   → readMemo(id).frontmatter.alarm│   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
├─────────────── IPC Bridge (preload) ────────────────────┤
│                                                         │
│  preload/index.ts                                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │ setAlarm(memoId, alarm) → invoke memo:set-alarm  │   │
│  │ clearAlarm(memoId)      → invoke memo:clear-alarm│   │
│  │ getAlarm(memoId)        → invoke memo:get-alarm  │   │
│  │ onAlarmFired(cb)        → on memo:alarm-fired    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│ Renderer Process                                        │
│                                                         │
│  App.tsx → loads alarm, passes to Titlebar              │
│  Titlebar.tsx → alarm button + AlarmPopover toggle      │
│  AlarmPopover.tsx → time/type/date form                 │
│  ManagerWindow.tsx → alarm indicator in memo list       │
└─────────────────────────────────────────────────────────┘
```

## 2. Data Model

### 2.1 AlarmData (existing — no changes)

```typescript
// src/shared/types.ts (already defined)
export interface AlarmData {
  enabled: boolean
  time: string          // "HH:MM" (24h format)
  type: 'once' | 'daily' | 'weekdays' | 'daterange'
  date?: string         // "YYYY-MM-DD" for 'once'
  weekdays?: number[]   // [0..6] for 'weekdays' (0=Sun)
  startDate?: string    // "YYYY-MM-DD" for 'daterange'
  endDate?: string      // "YYYY-MM-DD" for 'daterange'
}
```

### 2.2 Frontmatter storage

```yaml
---
title: 할 일 목록
created: 2026-03-12T10:00:00.000Z
modified: 2026-03-12T10:30:00.000Z
color: '#FFF9B1'
pinned: false
opacity: 1
fontSize: 16
alarm:
  enabled: true
  time: '14:30'
  type: daily
---
```

## 3. Component Design

### 3.1 AlarmScheduler (NEW: `src/main/lib/alarm-scheduler.ts`)

```typescript
// Module-level state
let intervalId: NodeJS.Timeout | null = null
const firedSet = new Set<string>()  // "memoId:YYYY-MM-DD:HH:MM"

export function startAlarmScheduler(): void
export function stopAlarmScheduler(): void

// Internal
function checkAlarms(): Promise<void>
function shouldFire(alarm: AlarmData, now: Date): boolean
function fireAlarm(memoId: string, memo: MemoData): void
function autoDisableIfExpired(memoId: string, alarm: AlarmData, now: Date): Promise<void>
```

**shouldFire logic:**

| Type | Condition |
|------|-----------|
| `once` | `alarm.date === today && alarm.time === nowHHMM` |
| `daily` | `alarm.time === nowHHMM` |
| `weekdays` | `alarm.weekdays.includes(now.getDay()) && alarm.time === nowHHMM` |
| `daterange` | `startDate <= today <= endDate && alarm.time === nowHHMM` |

**Dedup key**: `${memoId}:${YYYY-MM-DD}:${HH:MM}` → stored in `firedSet`
- On each `checkAlarms()`, skip if key already in firedSet
- Clear firedSet at midnight (via date check in checkAlarms)

**Auto-disable logic** (called after firing):
- `once`: set `alarm.enabled = false` via `saveMemo`
- `daterange`: if `endDate < today`, set `alarm.enabled = false`

### 3.2 IPC Handlers (in `memo-file.ts`)

```typescript
// New IPC handlers to register
ipcMain.handle('memo:set-alarm', async (_event, memoId: string, alarm: AlarmData) => {
  // Read current memo, save with alarm in frontmatter
  const memo = await readMemo(memoId)
  if (!memo) return false
  await saveMemo(memoId, memo.content, { alarm })
  return true
})

ipcMain.handle('memo:clear-alarm', async (_event, memoId: string) => {
  const memo = await readMemo(memoId)
  if (!memo) return false
  // Save with alarm: undefined to remove from frontmatter
  await saveMemo(memoId, memo.content, { alarm: undefined })
  return true
})

ipcMain.handle('memo:get-alarm', async (_event, memoId: string) => {
  const memo = await readMemo(memoId)
  return memo?.frontmatter.alarm ?? null
})
```

### 3.3 Notification Behavior

```typescript
function fireAlarm(memoId: string, memo: MemoData): void {
  const notification = new Notification({
    title: `🔔 ${memo.frontmatter.title}`,
    body: memo.content.split('\n').find(l => l.trim())?.slice(0, 100) || '',
    silent: false  // Use system sound
  })

  notification.on('click', () => {
    // Open or focus memo window
    const existing = getWindowByMemoId(memoId)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    } else {
      // Open new window
      createMemoWindow(memoId, stateStore.readSync()?.windows[memoId])
    }
  })

  notification.show()

  // Flash taskbar if window exists
  const win = getWindowByMemoId(memoId)
  if (win && !win.isDestroyed()) {
    win.flashFrame(true)
    // Also send event to renderer for visual feedback
    win.webContents.send('memo:alarm-fired')
  }
}
```

### 3.4 Preload API Additions

```typescript
// Alarm
setAlarm: (memoId: string, alarm: AlarmData): Promise<boolean> =>
  ipcRenderer.invoke('memo:set-alarm', memoId, alarm),
clearAlarm: (memoId: string): Promise<boolean> =>
  ipcRenderer.invoke('memo:clear-alarm', memoId),
getAlarm: (memoId: string): Promise<AlarmData | null> =>
  ipcRenderer.invoke('memo:get-alarm', memoId),
onAlarmFired: (callback: () => void): void => {
  ipcRenderer.on('memo:alarm-fired', () => callback())
},
```

### 3.5 AlarmPopover Component (NEW)

**File**: `src/renderer/src/components/AlarmPopover.tsx`

**Props**:
```typescript
interface AlarmPopoverProps {
  memoId: string
  alarm: AlarmData | null    // current alarm (null = no alarm set)
  onSave: (alarm: AlarmData) => void
  onClear: () => void
  onClose: () => void
}
```

**Layout** (compact popover, ~280px wide):
```
┌──────────────────────────────┐
│  ⏰ 알람 설정                │
├──────────────────────────────┤
│  시간  [14]:[30]             │
│                              │
│  유형  [한 번     ▼]         │
│                              │
│  ── type-specific fields ──  │
│  (once)  날짜 [2026-03-15]   │
│  (wday)  ☐월☐화☑수☐목☑금☐토☐일│
│  (range) 시작 [____] 종료 [____]│
│                              │
│  [삭제]        [취소] [저장]  │
└──────────────────────────────┘
```

**State**:
```typescript
const [time, setTime] = useState('09:00')       // HH:MM
const [type, setType] = useState<AlarmData['type']>('once')
const [date, setDate] = useState('')             // YYYY-MM-DD
const [weekdays, setWeekdays] = useState<number[]>([])
const [startDate, setStartDate] = useState('')
const [endDate, setEndDate] = useState('')
```

**Time input**: Two `<select>` dropdowns (hour 0-23, minute 0-59 in 5-minute steps)

**Type selector**: `<select>` with 4 options:
- 한 번 (once)
- 매일 (daily)
- 요일 선택 (weekdays)
- 기간 설정 (daterange)

**Weekday buttons**: 7 toggle buttons (일/월/화/수/목/금/토), highlighted when selected

**Validation before save**:
- `once`: date must be set and not in the past
- `weekdays`: at least one day selected
- `daterange`: both dates set, endDate >= startDate, endDate not in the past
- `daily`: no extra validation (time is always required)

### 3.6 AlarmPopover.module.css (NEW)

```css
.popover {
  position: absolute;
  top: 36px;        /* below titlebar */
  right: 60px;      /* align with alarm button */
  width: 280px;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-secondary);
  border-radius: 8px;
  box-shadow: var(--shadow-dropdown);
  z-index: 200;
  padding: 12px;
}
/* Uses CSS variables for dark mode compatibility */
```

### 3.7 Titlebar Changes

```typescript
// New props
interface TitlebarProps {
  // ... existing props
  alarm: AlarmData | null
  onAlarmSave: (alarm: AlarmData) => void
  onAlarmClear: () => void
}

// New state
const [showAlarm, setShowAlarm] = useState(false)

// New button (before copy button in right .buttons group)
<button
  className={`${styles.btn} ${alarm?.enabled ? styles.btnAlarmActive : ''}`}
  onClick={() => setShowAlarm(!showAlarm)}
  title={alarm?.enabled ? `알람: ${alarm.time}` : '알람 설정'}
>
  🔔
</button>

// Popover
{showAlarm && (
  <AlarmPopover
    memoId={memoId}
    alarm={alarm}
    onSave={(a) => { onAlarmSave(a); setShowAlarm(false) }}
    onClear={() => { onAlarmClear(); setShowAlarm(false) }}
    onClose={() => setShowAlarm(false)}
  />
)}
```

**CSS additions to Titlebar.module.css**:
```css
.btnAlarmActive {
  opacity: 1;
  color: #e6a817;
}
[data-theme="dark"] .btnAlarmActive,
[data-note-dark] .btnAlarmActive {
  color: #ffd54f;
}
```

### 3.8 App.tsx Changes

```typescript
// New state
const [alarm, setAlarm] = useState<AlarmData | null>(null)

// Load alarm in loadMemo
const data = await window.api.readMemo(memoId)
if (data) {
  setAlarm(data.frontmatter.alarm ?? null)
  // ... existing
}

// Alarm handlers
const handleAlarmSave = useCallback(async (newAlarm: AlarmData) => {
  setAlarm(newAlarm)
  if (memoIdRef.current) {
    await window.api.setAlarm(memoIdRef.current, newAlarm)
  }
}, [])

const handleAlarmClear = useCallback(async () => {
  setAlarm(null)
  if (memoIdRef.current) {
    await window.api.clearAlarm(memoIdRef.current)
  }
}, [])

// Listen for alarm-fired event (visual feedback)
useEffect(() => {
  window.api.onAlarmFired(() => {
    // Brief flash effect — could flash titlebar or show indicator
  })
  return () => {
    window.api.removeAllListeners('memo:alarm-fired')
  }
}, [])

// Pass to Titlebar
<Titlebar
  // ... existing props
  alarm={alarm}
  onAlarmSave={handleAlarmSave}
  onAlarmClear={handleAlarmClear}
/>
```

### 3.9 ManagerWindow Changes

In MemoList, add alarm indicator after colorDot:

```tsx
{memo.frontmatter.alarm?.enabled && (
  <span className={styles.alarmBadge} title={`알람: ${memo.frontmatter.alarm.time}`}>
    🔔
  </span>
)}
```

**CSS**:
```css
.alarmBadge {
  font-size: 11px;
  flex-shrink: 0;
  opacity: 0.7;
}
```

### 3.10 main/index.ts Changes

```typescript
import { startAlarmScheduler, stopAlarmScheduler } from './lib/alarm-scheduler'

// In app.whenReady():
startAlarmScheduler()

// In app.on('before-quit'):
stopAlarmScheduler()
```

## 4. Frontmatter Handling

### 4.1 saveMemo alarm support

The existing `saveMemo` already supports `frontmatterUpdates: Partial<MemoFrontmatter>`. Since `MemoFrontmatter.alarm` is optional (`alarm?: AlarmData`), passing `{ alarm: alarmData }` will add it and `{ alarm: undefined }` will need special handling.

**Required change in memo-file.ts `saveMemo`**:

When merging frontmatter, if `frontmatterUpdates.alarm === undefined` and the key is explicitly present, remove the alarm field:

```typescript
// In saveMemo, after merge:
if (frontmatterUpdates && 'alarm' in frontmatterUpdates && frontmatterUpdates.alarm === undefined) {
  delete fm.alarm
}
```

This ensures `clearAlarm` actually removes the field from frontmatter rather than writing `alarm: null`.

## 5. Implementation Order

| Step | File | Description |
|------|------|-------------|
| 1 | `src/main/lib/alarm-scheduler.ts` | NEW — AlarmScheduler with check loop, shouldFire, fireAlarm, autoDisable |
| 2 | `src/main/lib/memo-file.ts` | Add 3 IPC handlers (set-alarm, clear-alarm, get-alarm) + alarm deletion in saveMemo |
| 3 | `src/main/index.ts` | Import + start/stop scheduler |
| 4 | `src/preload/index.ts` | Add 4 alarm APIs (setAlarm, clearAlarm, getAlarm, onAlarmFired) |
| 5 | `src/renderer/src/components/AlarmPopover.tsx` | NEW — alarm settings form |
| 6 | `src/renderer/src/components/AlarmPopover.module.css` | NEW — popover styles |
| 7 | `src/renderer/src/components/Titlebar.tsx` | Add alarm button + popover + new props |
| 8 | `src/renderer/src/components/Titlebar.module.css` | Add `.btnAlarmActive` style |
| 9 | `src/renderer/src/App.tsx` | Alarm state, handlers, pass props, listen alarm-fired |
| 10 | `src/renderer/src/components/ManagerWindow.tsx` | Alarm badge in memo list |
| 11 | `src/renderer/src/components/ManagerWindow.module.css` | `.alarmBadge` style |

## 6. Edge Cases

| Case | Handling |
|------|----------|
| App not running at alarm time | Missed — no retroactive fire |
| Memo in trash | `checkAlarms` only reads from `listMemos()` (active memos only) |
| `once` alarm after firing | `autoDisableIfExpired` sets `enabled: false` |
| `daterange` past endDate | `autoDisableIfExpired` sets `enabled: false` |
| Memo deleted while alarm active | Next `checkAlarms` won't find it — no error |
| Multiple memos alarm at same time | All fire independently (30s check window) |
| Time picker minute precision | 5-minute steps (00, 05, 10, ..., 55) for usability |
| firedSet memory growth | Cleared at midnight via date comparison in checkAlarms |

## 7. Testing Checklist

- [ ] Set `once` alarm 1 minute ahead → notification fires
- [ ] Set `daily` alarm → fires every day at time
- [ ] Set `weekdays` alarm on today → fires; on other day → doesn't fire
- [ ] Set `daterange` alarm within range → fires; outside → doesn't fire
- [ ] Click notification → opens/focuses memo window
- [ ] Clear alarm → no more notifications
- [ ] `once` alarm fires → auto-disables (check frontmatter)
- [ ] `daterange` expires → auto-disables
- [ ] Alarm popover shows current alarm data when editing
- [ ] Manager memo list shows 🔔 for alarmed memos
- [ ] Dark mode: popover and alarm button render correctly
- [ ] Close/reopen app → alarm still works (persisted in frontmatter)
