# Phase 13b Plan: Alarm System

> **Feature**: Memo Alarm (Reminder) System
> **Author**: planner
> **Created**: 2026-03-12
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Users have no way to set time-based reminders on memos, so important tasks get forgotten even though they're written down as sticky notes. |
| **Solution** | Add per-memo alarm system with one-time, daily, weekday, and date-range repeat modes, using Electron Notification API and a main-process scheduler that checks alarms every 30 seconds. |
| **Function/UX Effect** | Users click an alarm bell icon on the titlebar to set/edit/clear alarms via a compact popover; when an alarm fires, a system notification appears and the memo window flashes/brings to front. |
| **Core Value** | Transforms passive sticky notes into active reminders, bridging the gap between note-taking and task management without external tools. |

---

## 1. Goal

Add a per-memo alarm/reminder system that triggers system notifications at specified times.

## 2. Requirements

### 2.1 Alarm Types (from existing `AlarmData` type)

| Type | Description | Fields |
|------|-------------|--------|
| `once` | Fire once at a specific date+time | `time`, `date` |
| `daily` | Fire every day at a specific time | `time` |
| `weekdays` | Fire on selected weekdays at a specific time | `time`, `weekdays[]` (0=Sun..6=Sat) |
| `daterange` | Fire daily at a specific time within a date range | `time`, `startDate`, `endDate` |

### 2.2 UI Requirements

1. **Alarm button** on titlebar (right-side buttons, before copy button)
   - Bell icon (🔔) — inactive state is muted, active state is highlighted
   - Active indicator when alarm is set (color accent or badge)

2. **Alarm popover** (similar to ColorPalette positioning)
   - Time picker: hour + minute (24h or AM/PM depending on locale)
   - Type selector: 한 번 / 매일 / 요일 선택 / 기간 설정
   - Date picker for `once` type (simple input[type=date])
   - Weekday checkboxes for `weekdays` type (월~일)
   - Start/end date pickers for `daterange` type
   - Save / Delete / Cancel buttons
   - Show current alarm status if already set

3. **Manager window alarm column** — show alarm icon next to memo items that have active alarms

### 2.3 Backend Requirements

4. **Alarm scheduler** in main process
   - `setInterval` every 30 seconds checks all memos with `alarm.enabled = true`
   - Compare current time with alarm time + type logic
   - Trigger Electron `Notification` when alarm fires
   - Track "already fired today" to prevent duplicate notifications within same minute

5. **Alarm persistence** — stored in frontmatter `alarm` field (already defined in `MemoFrontmatter`)

6. **IPC APIs**
   - `memo:set-alarm` — save alarm data to frontmatter
   - `memo:clear-alarm` — remove alarm from frontmatter
   - `memo:get-alarm` — read alarm data for a memo

7. **Notification behavior**
   - Show system notification with memo title and first line of content
   - Click notification → open/focus the memo window
   - If memo window is already open → flash taskbar + bring to front

### 2.4 Edge Cases

8. **App not running at alarm time** — missed alarms are NOT retroactively fired (by design — this is a lightweight reminder, not a calendar)
9. **Memo in trash** — skip alarm check for trashed memos
10. **Past date for `once`** — auto-disable alarm after it fires
11. **`daterange` expired** — auto-disable when `endDate` is past
12. **Time zone** — use local time (no TZ conversion needed for desktop app)

## 3. Files to Change

| # | File | Changes |
|---|------|---------|
| 1 | `src/shared/types.ts` | Already has `AlarmData` — no changes needed |
| 2 | `src/main/lib/alarm-scheduler.ts` | **NEW** — alarm check loop, notification trigger, fired tracking |
| 3 | `src/main/lib/memo-file.ts` | Add `setAlarm`, `clearAlarm`, `getAlarm` functions + IPC handlers |
| 4 | `src/main/index.ts` | Start alarm scheduler on app ready |
| 5 | `src/preload/index.ts` | Add alarm IPC APIs |
| 6 | `src/renderer/src/components/AlarmPopover.tsx` | **NEW** — alarm settings UI |
| 7 | `src/renderer/src/components/AlarmPopover.module.css` | **NEW** — styles |
| 8 | `src/renderer/src/components/Titlebar.tsx` | Add alarm button + popover toggle |
| 9 | `src/renderer/src/App.tsx` | Load alarm data on init, pass to Titlebar |
| 10 | `src/renderer/src/components/ManagerWindow.tsx` | Show alarm indicator in memo list |

## 4. Implementation Order

1. Backend: `alarm-scheduler.ts` + IPC handlers in `memo-file.ts`
2. Preload: alarm APIs
3. UI: `AlarmPopover` component
4. Integration: Titlebar button + App.tsx alarm state
5. Manager: alarm indicator in memo list
6. Testing: manual verification of all 4 alarm types

## 5. Non-Goals

- No sound customization (use system default notification sound)
- No snooze feature (can add later)
- No alarm history/log
- No sync with external calendars
- No recurring weekly/monthly patterns beyond weekdays
