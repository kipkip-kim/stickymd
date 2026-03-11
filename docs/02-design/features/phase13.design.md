# Design: Phase 13 — Global Hotkey, Clipboard Copy, Text Size Slider

> **Feature**: phase13
> **Plan**: [phase13.plan.md](../../01-plan/features/phase13.plan.md)
> **Created**: 2026-03-11

---

## 1. Component Design

### 1.1 텍스트 크기 슬라이더 (EditorToolbar)

기존 opacity 슬라이더 패턴을 그대로 재사용.

```
[B] [U] [☑] [•] | 가 10━━━●━━━28  80% ━━●━━
                   ↑ fontSize        ↑ opacity (기존)
```

**EditorToolbar Props 변경:**
```typescript
interface EditorToolbarProps {
  getEditor: () => Editor | undefined
  memoId: string
  opacity: number
  onOpacityChange: (opacity: number) => void
  fontSize: number              // 추가
  onFontSizeChange: (size: number) => void  // 추가
}
```

**슬라이더 사양:**
- Range: `min=10, max=28, step=1`
- 기본값: 16px
- 라벨: `가` + 현재 값 (예: `가 16`)
- 위치: opacity 슬라이더 왼쪽 (separator로 구분)

### 1.2 클립보드 복사 버튼 (Titlebar)

타이틀바 오른쪽 영역, 알람 자리(Phase 13b)와 색상닷 사이에 배치.

```
Left: [+][📌][☰][▲] — title — Right: [📋][🎨][×]
```

**동작:**
1. 클릭 → `getEditor().getMarkdown()` → `clipboard.writeText()`
2. 아이콘 1.5초 변경 (📋 → ✓) 피드백
3. 에디터 비어있으면 무시

**IPC:**
```typescript
// preload
copyToClipboard: (text: string): Promise<void> =>
  ipcRenderer.invoke('clipboard:write', text)

// main
ipcMain.handle('clipboard:write', (_event, text: string) => {
  clipboard.writeText(text)
})
```

### 1.3 글로벌 핫키 (Main Process)

**새 파일: `src/main/lib/hotkey.ts`**

```typescript
import { globalShortcut, BrowserWindow } from 'electron'
import { createMemoWindow } from './window-manager'
import { getSettings } from './store'

let currentAccelerator: string | null = null

export function registerGlobalHotkey(): void {
  // 설정에서 핫키 읽기
  // 기본값: 'Ctrl+Shift+M'
  // globalShortcut.register(accelerator, callback)
  // callback: 열린 창 있으면 focus, 없으면 createMemoWindow()
}

export function unregisterGlobalHotkey(): void {
  if (currentAccelerator) {
    globalShortcut.unregister(currentAccelerator)
    currentAccelerator = null
  }
}

export function updateGlobalHotkey(newAccelerator: string): boolean {
  unregisterGlobalHotkey()
  // 재등록, 실패 시 false 반환
}
```

**핫키 콜백 로직:**
```
1. BrowserWindow.getAllWindows() 확인
2. 열린 메모 창 있음 → 마지막 활성 창 focus + restore
3. 열린 메모 창 없음 → createMemoWindow()
```

**등록 실패 처리:**
- `globalShortcut.register()` 반환값 체크
- 실패 시 console.warn (crash 방지)
- 설정 UI에서 실패 메시지 표시

---

## 2. Data Flow

### 2.1 텍스트 크기

```
[App.tsx] fontSize state (기본 16)
    ↓ props
[EditorToolbar] 슬라이더 onChange → onFontSizeChange(size)
    ↓ props
[MemoEditor] fontSize prop → view.dom.style.fontSize
    ↓ 저장
[App.tsx] saveMemo() frontmatter에 fontSize 포함
```

**App.tsx 변경:**
- `const [fontSize, setFontSize] = useState(16)` 추가
- `loadMemo()`에서 `data.frontmatter.fontSize || 16` 로드
- `handleMarkdownChange`의 saveMemo에 fontSize 포함
- `handleFontSizeChange` 콜백: state 업데이트 + 즉시 저장

### 2.2 클립보드 복사

```
[Titlebar] 복사 버튼 클릭
    ↓
[App.tsx] getEditorRef.current() → editor.getMarkdown()
    ↓
[Preload] window.api.copyToClipboard(markdown)
    ↓
[Main] clipboard.writeText(markdown)
    ↓
[Titlebar] copied state → 1.5초 후 리셋
```

**Titlebar Props 변경:**
```typescript
interface TitlebarProps {
  // ... existing
  onCopy: () => void  // 추가: App에서 에디터 마크다운 가져와서 복사
}
```

### 2.3 글로벌 핫키

```
[Main: app.whenReady()] → registerGlobalHotkey()
    ↓
[사용자: Ctrl+Shift+M]
    ↓
[Main: callback]
    ├── 열린 창 있음 → focus + restore
    └── 열린 창 없음 → createMemoWindow()

[Settings 변경] → updateGlobalHotkey(newKey)
    ↓
[Main: unregister old → register new]
```

---

## 3. File Changes

| File | Change | Effort |
|------|--------|--------|
| `src/renderer/src/components/EditorToolbar.tsx` | fontSize 슬라이더 추가 | Small |
| `src/renderer/src/components/EditorToolbar.module.css` | 슬라이더 스타일 | Small |
| `src/renderer/src/App.tsx` | fontSize state, handleFontSizeChange, handleCopy, saveMemo에 fontSize | Small |
| `src/renderer/src/components/MemoEditor.tsx` | (이미 fontSize prop 지원) | None |
| `src/renderer/src/components/Titlebar.tsx` | 복사 버튼 + copied 피드백 | Small |
| `src/renderer/src/components/Titlebar.module.css` | 복사 버튼 스타일 (copyFeedback) | Small |
| `src/main/lib/hotkey.ts` | 새 파일: 글로벌 핫키 등록/해제 | Medium |
| `src/main/index.ts` | registerGlobalHotkey() 호출 | Small |
| `src/main/lib/settings-ipc.ts` | clipboard:write 핸들러, 핫키 변경 시 updateGlobalHotkey | Small |
| `src/preload/index.ts` | copyToClipboard API 추가 | Small |
| `src/shared/types.ts` | (이미 fontSize, globalHotkey 필드 존재) | None |
| `src/renderer/src/components/ManagerWindow.tsx` | 설정 패널에 핫키 입력 필드 | Small |

---

## 4. Implementation Order

```
Step 1: 텍스트 크기 슬라이더
  ├── EditorToolbar.tsx: fontSize 슬라이더 UI
  ├── EditorToolbar.module.css: 스타일
  ├── App.tsx: fontSize state + handleFontSizeChange
  └── App.tsx: loadMemo/saveMemo에 fontSize 연동

Step 2: 클립보드 복사
  ├── main/settings-ipc.ts: clipboard:write 핸들러
  ├── preload/index.ts: copyToClipboard API
  ├── App.tsx: handleCopy 콜백
  ├── Titlebar.tsx: 복사 버튼 + copied 피드백
  └── Titlebar.module.css: 피드백 스타일

Step 3: 글로벌 핫키
  ├── main/lib/hotkey.ts: 새 파일
  ├── main/index.ts: registerGlobalHotkey() 호출
  ├── main/lib/settings-ipc.ts: 핫키 변경 IPC
  └── ManagerWindow.tsx: 설정에 핫키 입력
```

---

## 5. Edge Cases

| Case | Handling |
|------|----------|
| fontSize frontmatter 없는 기존 메모 | `data.frontmatter.fontSize \|\| 16` 기본값 |
| 핫키가 이미 다른 앱에 등록됨 | register 실패 → 경고, 앱은 정상 동작 |
| 빈 메모 복사 | 빈 문자열이면 복사 무시 |
| 핫키 설정값이 빈 문자열 | 핫키 해제 (등록 안 함) |
| 핫키 accelerator 문법 오류 | try-catch로 잡아서 경고 |
