# StickyMD Changelog

## [2026-03-12] - Phase 13b Alarm System

### Added
- Per-memo alarm system with 4 trigger types (once, daily, weekdays, daterange)
- 30-second interval scheduler in main process with dedup logic (firedSet)
- Titlebar bell icon button (SVG) with active state indicator
- AlarmPopover component with time + type + date/weekday selectors (enlarged 30%)
- Alarm summary bar below titlebar showing active alarm info
- Visual feedback on alarm fire: border glow animation + window flash + temporary top placement
- Alarm badge (🔔) in manager memo list for alarmed memos
- IPC APIs: setAlarm, clearAlarm, getAlarm, onAlarmFired
- Auto-disable for expired alarms (once after fire, daterange after endDate)
- Frontmatter persistence for alarm data (YAML)
- Dark mode support for AlarmPopover

### Fixed
- Toolbar slider drag causing editor blur (toolbarInteractingRef pattern)
- Window not being restored from minimized state when alarm fires

### Changed
- System Notification API replaced with in-app visual feedback (border glow + alarm bar)
  - Reason: better UX, avoids Windows permission issues, more control over appearance
- Popover width increased from 280px to 364px for better usability
- Alarm button uses SVG bell icon instead of emoji (better styling)
- Time input split into hour/minute dropdowns instead of single HH:MM string

### Technical Details
- **Match Rate**: 93% (Design: 91%, Architecture: 100%, Convention: 97%)
- **Files Added**: 2 (AlarmPopover.tsx, alarm-scheduler.ts)
- **Files Modified**: 11 (main, preload, renderer, theme)
- **Lines Added**: ~600
- **Issues Found**: 0 blocking, 3 optional enhancements
- **Duration**: 3 days (2026-03-10 to 2026-03-12)
- **Commits**: Analysis + Report

### Edge Cases Handled
- App not running at alarm time → missed alarms (by design)
- Memo in trash → skip from alarm checks
- Memo deleted → no error on next scheduler check
- Multiple alarms at same time → all fire independently
- Dedup prevents same alarm firing twice in same minute
- Auto-disable works correctly for once + daterange types

### Known Limitations (Tech Debt)
- Optional validation for past dates in `once` type (low priority)
- Optional validation for `daterange` endDate >= startDate
- `btnAlarmActive` color styling optional (currently opacity only, design suggested gold #e6a817)
- No snooze feature (can add in Phase 13c)
- No custom alarm sounds (uses system default notification sound)

---

## [2026-03-12] - Renderer Feature: Drag-and-Drop, Scrollbar, Multi-Select

### Added
- Drag-and-drop file import to memo editor (.md/.txt with gray-matter parsing)
- Drag-and-drop file import to manager memo list (preserves frontmatter)
- Blue drag overlay UI with visual feedback (dragenter/dragleave counter pattern)
- Custom scrollbar styling (6px width, rounded thumb, theme-aware CSS variables)
- Memo editor scrollbar fix (flex chain CSS for Milkdown layout)
- Memo list multi-select with checkboxes (Ctrl+click toggle, Shift+click range)
- Select-all checkbox with memo count display
- "New Memo" button in manager window with optimistic UI
- Periodic polling (10-second interval) with optimistic entry preservation
- .txt file support in import dialog (raw content without frontmatter)
- IPC APIs: readExternalFile, importMemoFromPath, getPathForFile (Electron 40)
- Document-level drag prevention (App.tsx, ManagerWindow.tsx)

### Fixed
- Memo editor scrollbar clipped/misaligned (flex chain fix)
- No visual feedback on file drag-over (blue overlay added)
- Manager window memo list lacked batch operations (multi-select added)
- New memos removed by polling (optimisticIdsRef tracking)

### Changed
- MemoEditor component now accepts currentContent prop for overwrite confirmation
- ManagerWindow now includes periodic polling for external file changes
- Import dialog now filters both .md and .txt files

### Technical Details
- **Match Rate**: 97% (38/38 sub-requirements)
- **Warnings Found**: 1 info-level (non-blocking, W1: multi-select duplication)
- **Files Modified**: 9 files
- **Code Changes**: +490/-38 lines
- **Duration**: 1 day (2026-03-12)
- **Commit**: 4470f43

### Known Limitations (Tech Debt)
- Multi-select logic duplicated between MemoList and TrashList (recommend useMultiSelect hook extraction)
- Single file drops only (no batch import queue)
- Polling interval hardcoded to 10 seconds (not user-configurable)
- Error feedback uses alert() instead of toast notifications

---

## [2026-03-11] - Phase 12 Dark Mode + UI Improvements

### Added
- Dark mode implementation with system-aware theme detection (system/light/dark)
- CSS variable-based theming system (--note-*, --bg-*, --text-*, etc.)
- Unified dark background color (#1e1e1e) for consistent appearance
- FOUC (Flash of Unstyled Content) prevention via async theme initialization
- Theme broadcast via IPC to all windows for real-time consistency
- `data-note-dark` attribute for text readability in dark backgrounds
- Dark mode swatch in ColorPalette (leftmost, #1e1e1e)
- System font picker with search and favorites (PowerShell-based)
- Font selection persistence via AppSettings (favoriteFonts array)
- Trash multi-select with checkboxes (Ctrl+click, Shift+click range select)
- Bulk restore and permanent delete operations
- Pin button glow animation (scale 1.2 + drop-shadow filter)
- GFM (GitHub Flavored Markdown) preset for task list support
- Checkbox button with proper task list generation
- Manager window dark mode with custom titlebar overlay

### Fixed
- Text color stuck white when switching dark → light theme
- Checkbox button producing bullet lists instead of task lists
- Checkbox clicking not toggling checked state
- Slash dropdown jitter from position recalculation
- Settings panel crash when opening font picker
- Font selection not applied to memos
- Unreadable text with dark custom color in light mode
- Duplicate `isLightColor` function definition (W1)
- Manager titleBarOverlay not updating on theme change (W2)

### Changed
- Titlebar rearrangement: increased height to 36px, new button order
- Removed `toDarkColor()` and `darkenCustomColor()` functions (simplified)
- ColorPalette now shows preset.light colors uniformly (no darkening in dark mode)
- Slash dropdown position calculation now one-time cached (stability fix)
- Frontmatter format remains unchanged (pure rendering change)

### Technical Details
- **Match Rate**: 97% (17/17 items implemented)
- **Warnings Found**: 5 non-blocking (W1-W5)
- **Bugs Fixed**: 9 during implementation
- **Files Modified**: 16 files
- **Commits**: 5 commits
- **Duration**: 1 day (2026-03-11)

### Known Limitations (Tech Debt)
- Hardcoded dark-mode color in MemoEditor.css:97 (#1e1e1e) — should use var(--bg-primary)
- Hardcoded danger colors in ManagerWindow.module.css (#d32f2f, etc.) — should use semantic variables
- Font picker uses synchronous PowerShell call on first load — could cache
- IPC theme broadcast pattern duplicated per-window — could use callback registry

---

## [2026-03-10] - Phase 11 Settings Tab (Previous)

### Added
- Settings tab with theme toggle, auto-save settings, trash retention, save path configuration
- Backup and restore functionality
- Auto-start on Windows boot option
