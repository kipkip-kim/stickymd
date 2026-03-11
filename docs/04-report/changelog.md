# StickyMD Changelog

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
