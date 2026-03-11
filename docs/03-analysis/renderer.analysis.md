# Phase 12 (Dark Mode) - Design-Implementation Gap Analysis Report

> **Summary**: Phase 12 dark mode implementation with additional features (font picker, trash multi-select, GFM, pin glow)
>
> **Author**: gap-detector
> **Created**: 2026-03-11
> **Status**: Draft

---

## Analysis Overview
- Analysis Target: Phase 12 — Dark Mode + Additional Features
- Design Document: Plan mode requirements (17 items)
- Implementation Path: `src/renderer/`, `src/main/lib/`, `src/preload/`, `src/shared/`
- Analysis Date: 2026-03-11

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Core Dark Mode (items 1-9) | 100% | PASS |
| Additional Features (items 10-17) | 100% | PASS |
| Architecture Compliance | 95% | WARN |
| Convention Compliance | 92% | WARN |
| **Overall** | **97%** | PASS |

---

## Core Dark Mode Requirements (1-9)

### 1. `getEffectiveColor()` returns fixed `#1e1e1e` in dark mode — PASS

**File**: `src/renderer/src/constants/colors.ts:30-33`

```ts
export function getEffectiveColor(storedColor: string, isDark: boolean): string {
  if (!isDark) return storedColor
  return DARK_NOTE_BG
}
```

Returns `DARK_NOTE_BG` (`#1e1e1e`) uniformly. No per-color dark variant logic.

### 2. `toDarkColor()` / `darkenCustomColor()` removed — PASS

Grep for `toDarkColor|darkenCustomColor` across `src/` returned zero results.

### 3. ColorPalette shows `preset.light` colors in dark mode — PASS

**File**: `src/renderer/src/components/ColorPalette.tsx:67-76`

Always renders `preset.light` regardless of `isDark`. The `isDark` prop is used only for container styling (dark background), not for color value switching.

### 4. `--note-*` CSS variables for dark theme — PASS

**File**: `src/renderer/src/theme.css`

Three complete variable sets defined:
- `:root, [data-theme="light"]` — light note variables (lines 32-44)
- `[data-theme="light"] [data-note-dark]` — inverted text for dark-bg notes in light mode (lines 48-62)
- `[data-theme="dark"]` — dark theme note variables (lines 86-98)

All 13 `--note-*` variables covered: text, text-secondary, text-muted, border, hover, code-bg, selection, blockquote-border, blockquote-text, hr, checkbox-border, checkbox-checked, dot-border.

### 5. Settings Theme toggle (dark/light/system) — PASS

**File**: `src/renderer/src/components/ManagerWindow.tsx:658-668`

Three-option `<select>`: system / light / dark. Updates via `updateSetting('darkMode', ...)`.

**File**: `src/shared/types.ts:10` — `darkMode: 'system' | 'light' | 'dark'` in `AppSettings`.

### 6. FOUC prevention (await theme before React render) — PASS

**File**: `src/renderer/src/main.tsx:14-30`

```ts
async function init(): Promise<void> {
  const theme = await window.api.getTheme()
  document.documentElement.setAttribute('data-theme', theme)
  // then ReactDOM.createRoot...
}
```

Theme is set before React mounts. `onThemeChanged` listener also registered at module level (line 9) for runtime changes.

### 7. Theme broadcast via IPC to all windows — PASS

**File**: `src/main/lib/theme.ts:16-22`

`broadcastTheme()` iterates `BrowserWindow.getAllWindows()` and sends `theme:changed`.

Triggered by:
- System theme change (`nativeTheme.on('updated')`, line 31)
- Settings change (`onDarkModeSettingChanged()`, line 38, called from `settings-ipc.ts:251`)

### 8. Manager window dark mode (custom titlebar, no menu bar) — PASS

**File**: `src/main/lib/manager-window.ts:21-44`

- `titleBarStyle: 'hidden'`
- `titleBarOverlay` adapts colors based on `isDark` (dark: `#1e1e1e`/`#e0e0e0`, light: `#ffffff`/`#333333`)
- `managerWindow.setMenu(null)` removes menu bar
- `backgroundColor` set to `#1e1e1e` or `#ffffff` based on theme

**File**: `src/renderer/src/components/ManagerWindow.module.css` — All styles use CSS variables (`var(--bg-primary)`, `var(--text-primary)`, etc.)

### 9. Data (frontmatter color field) unchanged — PASS

**File**: `src/shared/types.ts:23` — `MemoFrontmatter.color` remains a plain string.

`getEffectiveColor()` is render-only; `handleColorChange` in `App.tsx:153-162` saves the raw color to frontmatter.

---

## Additional Features (10-17)

### 10. System font picker (PowerShell-based, searchable dropdown with favorites) — PASS

**Implementation**:
- `src/main/lib/settings-ipc.ts:273-292` — PowerShell `InstalledFontCollection` query, cached after first call
- `src/preload/index.ts:81-82` — `listFonts` IPC
- `src/renderer/src/components/ManagerWindow.tsx:592-654` — Font picker with search input, favorites (star toggle), preview text
- `src/shared/types.ts:5` — `favoriteFonts: string[]` in AppSettings

### 11. Dark mode swatch in ColorPalette (leftmost, #1e1e1e) — PASS

**File**: `src/renderer/src/components/ColorPalette.tsx:60-66`

Dark swatch rendered before preset loop, uses `DARK_NOTE_BG` constant.

### 12. `data-note-dark` attribute for dark-bg notes in light mode — PASS

**File**: `src/renderer/src/App.tsx:184`

```ts
const forceDarkNote = !isDark && !isLightColor(effectiveColor)
```

Applied as `data-note-dark={forceDarkNote || undefined}` on root div (lines 197, 189).

**File**: `src/renderer/src/theme.css:48-62` — CSS overrides `--note-*` to white text under `[data-note-dark]`.

### 13. Pin button glow animation — PASS

**File**: `src/renderer/src/components/Titlebar.module.css:88-97`

```css
.btnActive {
  transform: scale(1.2);
  filter: drop-shadow(0 0 4px rgba(230, 119, 0, 0.5));
}
[data-theme="dark"] .btnActive, [data-note-dark] .btnActive {
  filter: drop-shadow(0 0 4px rgba(255, 179, 71, 0.5));
}
```

Transition on `.btn` (line 80): `transform 0.15s, filter 0.15s`.

### 14. Trash multi-select (checkboxes, Ctrl+click, Shift+click) — PASS

**File**: `src/renderer/src/components/ManagerWindow.tsx:332-499`

- `selectedIds` as `Set<string>` state
- `handleItemClick` with Shift (range select), Ctrl/Meta (toggle), normal (single)
- Select-all checkbox with count display
- Bulk restore / bulk permanent delete
- Individual item checkboxes with `stopPropagation`

### 15. GFM preset for task list support — PASS

**File**: `src/renderer/src/components/MemoEditor.tsx:4,63`

```ts
import { gfm } from '@milkdown/kit/preset/gfm'
// ...
.use(gfm)
```

Task list CSS in `MemoEditor.css:62-103` with `li[data-checked]` styles. Dark mode checkbox color handled via `var(--note-checkbox-*)` variables.

### 16. Slash dropdown stability fix — PASS

**File**: `src/renderer/src/components/SlashDropdown.module.css`

All styles use CSS variables (`var(--bg-primary)`, `var(--text-primary)`, `var(--shadow-dropdown)`, `var(--bg-hover)`, etc.), ensuring correct rendering in both themes.

### 17. Titlebar rearrangement (36px height) — PASS

**File**: `src/renderer/src/components/Titlebar.module.css:3` — `height: 36px`.

Button layout: left group (new, pin, manager, rollup) | title | right group (color dot, close).

---

## Findings

### Warnings (non-blocking)

| # | Item | Location | Description | Impact |
|---|------|----------|-------------|--------|
| W1 | Duplicate `isLightColor` | `ColorPalette.tsx:6-10` vs `colors.ts:22-27` | Same function defined in two places. ColorPalette has its own copy instead of importing from constants. | Low |
| W2 | Manager titleBarOverlay not updated on runtime theme change | `manager-window.ts:32-34` | `titleBarOverlay` is set at window creation time. If user toggles theme while manager is open, the OS title bar buttons retain the old color scheme. | Medium |
| W3 | `data-note-dark` only applied on note windows | `App.tsx` only | If a user picks a dark custom color in light mode and the ColorPalette "apply" button uses inline style with `isLightColor`, the button text adapts — but the palette container `dark` class is driven by `isDark` prop, not by note darkness. Minor visual inconsistency when picking dark colors in light mode. | Low |
| W4 | Hardcoded dark-mode colors in `MemoEditor.css:97` | `MemoEditor.css:96-98` | `[data-theme="dark"] li[data-checked="true"]::after { color: #1e1e1e }` hardcodes `#1e1e1e` instead of using `var(--bg-primary)`. Works now but breaks if dark bg color changes. | Low |
| W5 | `deleteBtn` colors hardcoded | `ManagerWindow.module.css:159-176` | Red colors (`#d32f2f`, `#ef5350`, `#5a2020`, `#3a1515`) are hardcoded rather than using CSS variables. Acceptable for semantic danger color but inconsistent with the variable-based approach elsewhere. | Low |

### Missing (none critical)

| # | Item | Description |
|---|------|-------------|
| - | No missing core features | All 17 planned items are implemented |

### Added (not in original plan)

| # | Item | Location | Description |
|---|------|----------|-------------|
| A1 | `AlarmData` type | `types.ts:26-38` | Alarm interface added (Phase 13b preparation) |
| A2 | `fontSize` in MemoFrontmatter | `types.ts:27` | Font size field added (Phase 13 preparation) |
| A3 | Manager window theme-aware `backgroundColor` | `manager-window.ts:30` | Prevents white flash on dark mode manager open |

---

## Architecture Compliance (95%)

| Check | Status | Notes |
|-------|--------|-------|
| IPC layer separation (main/preload/renderer) | PASS | Clean contextBridge, no nodeIntegration |
| Theme broadcast via IPC (not direct window access) | PASS | `theme.ts` broadcasts, renderer listens |
| CSS variable-based theming (no inline dark checks) | WARN | W4, W5: some hardcoded colors |
| State management via refs for async | PASS | Consistent pattern from earlier phases |
| MutationObserver for theme sync | PASS | `App.tsx:79-82` observes `data-theme` attribute |

---

## Convention Compliance (92%)

| Check | Status | Notes |
|-------|--------|-------|
| Component naming (PascalCase) | PASS | ColorPalette, Titlebar, ManagerWindow, etc. |
| File naming | PASS | Components PascalCase.tsx, utils camelCase.ts |
| CSS Modules for scoped styles | PASS | All components use `.module.css` |
| Constants UPPER_SNAKE_CASE | PASS | `DARK_NOTE_BG`, `DEFAULT_COLOR`, `COLOR_PRESETS` |
| No code duplication | WARN | W1: `isLightColor` duplicated |
| Type definitions in shared/ | PASS | `AppSettings`, `MemoFrontmatter` in `types.ts` |
| Import order (external, internal, relative) | PASS | Consistent across files |

---

## Recommended Actions

### Immediate (before Phase 13)

1. **W1**: Remove duplicate `isLightColor` from `ColorPalette.tsx` and import from `@/constants/colors`.
2. **W2**: Add `titleBarOverlay` update on `theme:changed` in manager window. Call `managerWindow.setTitleBarOverlay()` when theme changes.

### Deferred (tech debt)

3. **W4**: Replace hardcoded `#1e1e1e` in `MemoEditor.css:97` with `var(--bg-primary)`.
4. **W5**: Consider CSS variables for semantic danger colors (`--color-danger`, `--color-danger-bg`).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-11 | Initial Phase 12 gap analysis | gap-detector |
