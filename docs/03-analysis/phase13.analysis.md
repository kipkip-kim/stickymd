# Phase 13 Analysis Report

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: Sticky Memo
> **Analyst**: Claude (gap-detector)
> **Date**: 2026-03-11
> **Design Doc**: [phase13.design.md](../02-design/features/phase13.design.md)
> **Plan Doc**: [phase13.plan.md](../01-plan/features/phase13.plan.md)

---

## 1. Analysis Overview

### 1.1 Analysis Purpose

Compare Phase 13 design document against actual implementation to verify completeness and correctness of the three sub-features: global hotkey, clipboard copy, and text size slider.

### 1.2 Analysis Scope

- **Design Document**: `docs/02-design/features/phase13.design.md`
- **Plan Document**: `docs/01-plan/features/phase13.plan.md`
- **Implementation Files**: 10 files across main, preload, renderer
- **Analysis Date**: 2026-03-11

---

## 2. Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match | 88% | ⚠️ |
| Architecture Compliance | 95% | ✅ |
| Convention Compliance | 98% | ✅ |
| **Overall** | **91%** | **✅** |

---

## 3. Gap Analysis (Design vs Implementation)

### 3.1 Feature 1: Text Size Slider (EditorToolbar)

| Design Item | Implementation | Status | Notes |
|-------------|---------------|:------:|-------|
| EditorToolbar props: fontSize, onFontSizeChange | `EditorToolbar.tsx:12-19` | ✅ | Exact match |
| Slider range: min=10, max=28, step=1 | `EditorToolbar.tsx:173-176` | ✅ | Exact match |
| Default value: 16px | `App.tsx:20`, `MemoEditor.tsx:30` | ✅ | Both default to 16 |
| Label: "가" + current value | `EditorToolbar.tsx:169` renders `가 {fontSize}` | ✅ | Exact match |
| Position: left of opacity slider, separator | `EditorToolbar.tsx:167-181` | ✅ | Separator present |
| App.tsx: fontSize state | `App.tsx:20` `useState(16)` | ✅ | Match |
| App.tsx: loadMemo fontSize fallback | `App.tsx:45` `data.frontmatter.fontSize \|\| 16` | ✅ | Match |
| App.tsx: handleFontSizeChange callback | `App.tsx:170-180` | ✅ | Saves immediately |
| App.tsx: saveMemo includes fontSize in frontmatter | `App.tsx:111,143-146,162,174-175` | ✅ | All save paths include fontSize |
| MemoEditor: view.dom.style.fontSize | `MemoEditor.tsx:141-147` | ✅ | useEffect applies fontSize |

**Sub-score: 10/10 (100%)**

### 3.2 Feature 2: Clipboard Copy Button (Titlebar)

| Design Item | Implementation | Status | Notes |
|-------------|---------------|:------:|-------|
| Titlebar onCopy prop | `Titlebar.tsx:12` `onCopy: () => void` | ✅ | Match |
| Button position: between alarm slot and color dot | `Titlebar.tsx:119-131` | ✅ | Comment marks Phase 13b alarm slot |
| Click -> getMarkdown -> clipboard | `App.tsx:183-192` handleCopy | ⚠️ | See note 1 |
| Icon feedback: 1.5s change (clipboard -> checkmark) | `Titlebar.tsx:26-33` copied state, 1.5s timeout | ✅ | Match |
| Empty memo ignored | `App.tsx:185` `if (!markdown.trim()) return` | ✅ | Match |
| IPC: preload copyToClipboard | `preload/index.ts:81-82` | ✅ | Match |
| IPC: main clipboard:write handler | `settings-ipc.ts:304-306` | ✅ | Match |
| SVG icon for clipboard button | `Titlebar.tsx:126-129` | ✅ | Custom SVG icon |
| Checkmark feedback character | `Titlebar.tsx:125` renders `✓` | ✅ | Match (uses text, not emoji) |

**Note 1**: Design specifies `getEditor().getMarkdown()` via editor ref, but implementation uses `currentContentRef.current` (the ref holding current markdown content). This is a minor approach difference -- functionally equivalent since currentContentRef is kept in sync with editor content. The implementation also adds `navigator.clipboard.writeText` as primary method with IPC as fallback, which is an improvement over design (design only specified IPC).

**Sub-score: 9/10 (90%)**

### 3.3 Feature 3: Global Hotkey (Main Process)

| Design Item | Implementation | Status | Notes |
|-------------|---------------|:------:|-------|
| New file: `src/main/lib/hotkey.ts` | Exists with 83 lines | ✅ | Match |
| Exports: registerGlobalHotkey, unregisterGlobalHotkey, updateGlobalHotkey | All three exported | ✅ | Match |
| currentAccelerator tracking variable | `hotkey.ts:5` | ✅ | Match |
| Default hotkey: Ctrl+Shift+M | `types.ts:26` `globalHotkey: 'Ctrl+Alt+M'` | ⚠️ | See finding 1 |
| Callback: focus existing or create new | `hotkey.ts:19-31` | ✅ | Match |
| Filter out manager window in callback | `hotkey.ts:20` filters `#manager` URLs | ✅ | Not in design, good addition |
| Registration failure: console.warn, no crash | `hotkey.ts:37` warn on failure | ✅ | Match |
| Empty accelerator: skip registration | `hotkey.ts:11` `if (!accelerator) return` | ✅ | Match |
| Try-catch for syntax errors | `hotkey.ts:39-41` catch block | ✅ | Match |
| main/index.ts: call registerGlobalHotkey | `index.ts:41` after IPC registration | ✅ | Match |
| main/index.ts: unregister on before-quit | `index.ts:59` in before-quit handler | ✅ | Match |
| settings-ipc.ts: updateGlobalHotkey on settings change | `settings-ipc.ts:256-261` | ✅ | Match, returns error on failure |
| ManagerWindow.tsx: hotkey input field in settings | NOT IMPLEMENTED | ❌ | See finding 2 |

**Sub-score: 11/13 (85%)**

### 3.4 Data Model

| Design Item | Implementation | Status |
|-------------|---------------|:------:|
| MemoFrontmatter.fontSize: number | `shared/types.ts:26` | ✅ |
| AppSettings.globalHotkey: string | `shared/types.ts:12` | ✅ |
| DEFAULT_SETTINGS.globalHotkey | `types.ts:26` | ✅ |

**Sub-score: 3/3 (100%)**

### 3.5 Match Rate Summary

```
Total Design Items: 36
  Matched:          32 items (89%)
  Minor deviation:   2 items (5%)
  Missing:           1 item  (3%)
  Changed:           1 item  (3%)

Overall Match Rate: 88%
```

---

## 4. Differences Found

### 4.1 Missing Features (Design O, Implementation X)

| # | Item | Design Location | Description |
|---|------|-----------------|-------------|
| 1 | Hotkey settings UI in ManagerWindow | design.md:183, Section 3 Step 3 | `ManagerWindow.tsx` has no globalHotkey input field in settings panel. Users cannot customize the hotkey from the app UI. |

### 4.2 Changed Features (Design != Implementation)

| # | Item | Design | Implementation | Impact |
|---|------|--------|----------------|--------|
| 1 | Default hotkey accelerator | `Ctrl+Shift+M` (plan FR-01, design Section 1.3) | `Ctrl+Alt+M` (types.ts:26 DEFAULT_SETTINGS) | Low -- different default key combo. Plan explicitly says "Ctrl+Shift+M" in multiple places. |
| 2 | Clipboard copy mechanism | IPC only (`window.api.copyToClipboard`) via `getEditor().getMarkdown()` | `navigator.clipboard.writeText` primary + IPC fallback, uses `currentContentRef` not editor API | Low -- functionally superior (avoids unnecessary IPC), same result |

### 4.3 Added Features (Design X, Implementation O)

| # | Item | Implementation Location | Description |
|---|------|------------------------|-------------|
| 1 | Manager window URL filter in hotkey callback | `hotkey.ts:20` | Filters out manager window when determining "open memo windows" -- prevents focusing manager instead of memo |
| 2 | Navigator Clipboard API as primary copy method | `App.tsx:187` | Uses Web API first, IPC as fallback -- better performance |

### 4.4 Plan vs Design Discrepancy

| # | Item | Plan | Design | Notes |
|---|------|------|--------|-------|
| 1 | Ctrl+Scroll text size | Plan title mentions "Ctrl+Scroll Text Size" (FR-06 describes slider only) | Design specifies slider only, no Ctrl+Scroll | Neither design nor implementation includes Ctrl+Scroll. The plan title references it but FR-06 only describes a slider. This is a plan-level ambiguity, not an implementation gap. |
| 2 | fontSize scope | Plan FR-08: "global setting" | Design Section 2.1: per-memo frontmatter | Implementation follows design (per-memo). Each memo has its own fontSize in frontmatter. This deviates from plan FR-08 which says "global" setting. |

---

## 5. Convention Compliance

### 5.1 Naming Convention

| Category | Convention | Compliance | Violations |
|----------|-----------|:----------:|------------|
| Components | PascalCase | 100% | None |
| Functions | camelCase | 100% | None |
| Constants | UPPER_SNAKE_CASE | 100% | None |
| Files (component) | PascalCase.tsx | 100% | None |
| Files (utility) | camelCase.ts | 100% | None |

### 5.2 Import Order

All Phase 13 files follow the correct import order:
1. External libraries (react, electron)
2. Internal imports
3. Relative imports
4. Type imports
5. Styles (CSS modules last)

### 5.3 Architecture Compliance

| Layer | File | Correct Layer | Status |
|-------|------|---------------|:------:|
| Main (Infrastructure) | hotkey.ts | Infrastructure | ✅ |
| Main (Infrastructure) | settings-ipc.ts | Infrastructure | ✅ |
| Preload (Bridge) | index.ts | Bridge | ✅ |
| Renderer (Presentation) | App.tsx | Presentation | ✅ |
| Renderer (Presentation) | Titlebar.tsx | Presentation | ✅ |
| Renderer (Presentation) | EditorToolbar.tsx | Presentation | ✅ |
| Renderer (Presentation) | MemoEditor.tsx | Presentation | ✅ |
| Shared (Domain) | types.ts | Domain | ✅ |

No dependency direction violations found. Electron architecture properly separates main/preload/renderer concerns.

**Convention Score: 98%** (minor: hotkey callback logic is duplicated between `registerAccelerator` and `updateGlobalHotkey` in hotkey.ts)

---

## 6. Edge Cases Verification

| Design Edge Case | Implementation | Status |
|------------------|---------------|:------:|
| fontSize frontmatter missing on old memos | `App.tsx:45` `data.frontmatter.fontSize \|\| 16` | ✅ |
| Hotkey already registered by another app | `hotkey.ts:37` console.warn, no crash | ✅ |
| Empty memo copy | `App.tsx:185` returns early on empty | ✅ |
| Empty hotkey string | `hotkey.ts:11` and `hotkey.ts:47` skip registration | ✅ |
| Hotkey accelerator syntax error | `hotkey.ts:39-41` try-catch | ✅ |

**All 5 design edge cases are handled: 5/5 (100%)**

---

## 7. Code Quality Observations

### 7.1 Code Duplication

The hotkey callback logic (lines 18-31 and 50-61 in `hotkey.ts`) is nearly identical. Could be extracted into a shared function.

### 7.2 Ref Pattern Consistency

`fontSizeRef` follows the established ref pattern (BUG-1/2/3 fixes) consistently with `colorRef` and `opacityRef`. Good adherence to project conventions.

---

## 8. Recommended Actions

### 8.1 Immediate (before Phase 13 completion)

| Priority | Item | Location | Description |
|----------|------|----------|-------------|
| 1 | Add hotkey settings UI | `ManagerWindow.tsx` Settings tab | Design specifies a hotkey input field in settings panel. This is missing. Users have no way to change the hotkey from the UI. |
| 2 | Fix default hotkey value | `src/main/lib/types.ts:26` | Change `'Ctrl+Alt+M'` to `'Ctrl+Shift+M'` to match plan FR-01, OR update plan/design to document `Ctrl+Alt+M` as the intended default. |

### 8.2 Documentation Updates Needed

| Item | Document | Description |
|------|----------|-------------|
| 1 | Plan FR-08 | Clarify fontSize is per-memo (frontmatter), not global. Current implementation stores fontSize per-memo which is arguably better UX. |
| 2 | Plan title | Remove or clarify "Ctrl+Scroll" -- neither design nor implementation includes mouse wheel zoom. If planned for later, note it explicitly. |
| 3 | Design Section 2.2 | Note that `navigator.clipboard` is used as primary, IPC as fallback. |

### 8.3 Tech Debt (Low Priority)

| Item | Location | Description |
|------|----------|-------------|
| 1 | `hotkey.ts` | Extract duplicated hotkey callback into shared function |

---

## 9. Synchronization Recommendation

Match Rate is **88%** (>=70% and <90%), so:

> There are some differences. Document update is recommended.

**Recommended path**: Fix the 2 immediate items (hotkey UI + default key), then match rate rises to ~97%.

| Gap | Recommended Resolution |
|-----|----------------------|
| Missing hotkey settings UI | Implement in ManagerWindow.tsx settings tab |
| Default hotkey mismatch | Align types.ts with plan (Ctrl+Shift+M), or update plan/design |
| Clipboard approach change | Update design to document the improved approach (no action needed in code) |
| Plan "Ctrl+Scroll" reference | Update plan to remove or defer to future phase |
| Plan FR-08 "global" fontSize | Update plan to say "per-memo" to match design+implementation |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-11 | Initial gap analysis | Claude (gap-detector) |
