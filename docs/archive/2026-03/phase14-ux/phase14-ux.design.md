# Phase 14 UX 개선 Design Document

> **Summary**: Ctrl+휠 폰트 조절, 체크박스 다중 선택 일관성, 제목줄 크기 3단계 설정
>
> **Project**: Sticky Memo
> **Version**: 1.0.0
> **Author**: AI
> **Date**: 2026-03-12
> **Status**: Draft
> **Planning Doc**: [phase14-ux.plan.md](../../01-plan/features/phase14-ux.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- 브라우저 표준 UX (Ctrl+휠)를 메모 에디터에 적용
- 메모 목록/휴지통의 체크박스 선택 동작 일관성 확보
- 제목줄 크기를 사용자가 개인화할 수 있도록 설정 추가

### 1.2 Design Principles

- 최소 변경: 기존 코드 흐름을 최대한 재활용
- 일관성: 같은 UI 패턴은 같은 동작을 보장
- 즉시 반영: 설정 변경 시 모든 열린 창에 실시간 적용

---

## 2. FR-01: Ctrl+휠 폰트 크기 조절

### 2.1 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/src/App.tsx` | `wheel` 이벤트 리스너 등록 (useEffect) |

### 2.2 구현 상세

```typescript
// App.tsx — 새 useEffect 추가
useEffect(() => {
  const handleWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey) return
    e.preventDefault() // Electron 기본 줌 차단

    const delta = e.deltaY < 0 ? 1 : -1
    const newSize = Math.max(10, Math.min(28, fontSizeRef.current + delta))
    if (newSize !== fontSizeRef.current) {
      handleFontSizeChange(newSize)
    }
  }

  document.addEventListener('wheel', handleWheel, { passive: false })
  return () => document.removeEventListener('wheel', handleWheel)
}, [handleFontSizeChange])
```

### 2.3 동작 흐름

```
Ctrl+Wheel Up → deltaY < 0 → fontSize +1 → handleFontSizeChange
  → setFontSize(newSize)
  → saveMemo(id, content, { fontSize: newSize })
  → EditorToolbar 슬라이더 동기화 (fontSize prop)

Ctrl+Wheel Down → deltaY > 0 → fontSize -1 → 동일
```

### 2.4 경계 조건

- min: 10, max: 28 (기존 EditorToolbar 슬라이더와 동일)
- `passive: false`로 `preventDefault()` 가능하게 설정
- `fontSizeRef.current`로 stale closure 회피

---

## 3. FR-02: 체크박스 다중 선택 일관성

### 3.1 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/renderer/src/components/ManagerWindow.tsx` | `handleMemoClick`, `handleItemClick` 수정 |

### 3.2 현재 문제 분석

```
[현재 동작]
체크박스 클릭 → onChange → 해당 항목만 토글 (나머지 유지) ✅
행 클릭 → handleMemoClick → next.clear() → 기존 선택 전부 해제 ❌
→ 비일관적!
```

### 3.3 수정 설계

**handleMemoClick (메모 탭, line ~200):**

```typescript
// 변경 전
} else {
  next.clear()   // ← 이 줄 제거
  next.add(memoId)
}

// 변경 후
} else {
  if (next.has(memoId)) next.delete(memoId)
  else next.add(memoId)
}
```

**handleItemClick (휴지통 탭, line ~540):**

동일한 패턴 수정:
```typescript
// 변경 전
} else {
  next.clear()   // ← 이 줄 제거
  next.add(memoId)
}

// 변경 후
} else {
  if (next.has(memoId)) next.delete(memoId)
  else next.add(memoId)
}
```

### 3.4 최종 동작

| 조작 | 동작 |
|------|------|
| 일반 클릭 (행 or 체크박스) | 해당 항목 토글 (다른 선택 유지) |
| Shift+클릭 | 범위 선택 (기존 유지) |
| Ctrl+클릭 | 단일 토글 (기존 유지, 일반 클릭과 동일해짐) |
| 전체 선택 체크박스 | 전체 선택/해제 (기존 유지) |

---

## 4. FR-03: 제목줄 크기 3단계 설정

### 4.1 변경 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/shared/types.ts` | `AppSettings`에 `titlebarStyle` 필드 추가 |
| `src/main/lib/types.ts` | `DEFAULT_SETTINGS`에 기본값 추가 |
| `src/renderer/src/App.tsx` | settings에서 `titlebarStyle` 읽기, Titlebar에 prop 전달 |
| `src/renderer/src/components/Titlebar.tsx` | `titlebarStyle` prop 받아 높이 적용 |
| `src/renderer/src/components/Titlebar.module.css` | 높이 CSS 변수 제거, inline style 사용 |
| `src/renderer/src/components/ManagerWindow.tsx` | 설정 탭에 제목줄 크기 UI 추가 |

### 4.2 타입 정의

```typescript
// src/shared/types.ts — AppSettings에 추가
export interface AppSettings {
  // ... 기존 필드
  titlebarStyle: 'compact' | 'default' | 'spacious'
}
```

### 4.3 크기 매핑

```typescript
const TITLEBAR_HEIGHTS: Record<AppSettings['titlebarStyle'], number> = {
  compact: 28,   // Mac 스타일
  default: 36,   // 현재 기본
  spacious: 44   // Windows 스타일
}
```

### 4.4 Titlebar 컴포넌트

```typescript
// Titlebar.tsx — props에 추가
interface TitlebarProps {
  // ... 기존 props
  titlebarStyle?: 'compact' | 'default' | 'spacious'
}

// 렌더링 시
const height = TITLEBAR_HEIGHTS[titlebarStyle || 'default']
// .titlebar에 style={{ height }} 적용
```

### 4.5 CSS 변경

```css
/* Titlebar.module.css */
.titlebar {
  /* height: 36px; ← 제거, inline style로 대체 */
  /* 나머지 유지 */
}
```

### 4.6 설정 UI (ManagerWindow 설정 탭)

```
제목줄 크기
[기본] [윈도우] [맥]    ← 3개 라디오 버튼 또는 select
```

매핑:
- "기본" → `'default'` (36px)
- "윈도우" → `'spacious'` (44px)
- "맥" → `'compact'` (28px)

### 4.7 실시간 반영 흐름

```
설정 변경 → updateSettings({ titlebarStyle })
→ settings-ipc가 저장 후 응답
→ ManagerWindow에서 설정 값 업데이트
→ 열린 메모 창은 다음 방식으로 반영:
  1. App.tsx에서 settings 변경 이벤트 수신 (IPC)
  2. 또는 App.tsx에서 settings를 polling하지 않고
     settings 변경 시 main→renderer로 IPC 이벤트 broadcast
```

**실시간 반영 IPC 설계:**

```typescript
// main (settings-ipc.ts): 설정 변경 후 모든 메모 창에 broadcast
BrowserWindow.getAllWindows().forEach(win => {
  win.webContents.send('settings:changed', updatedSettings)
})

// preload: onSettingsChanged 리스너 추가
onSettingsChanged: (callback: (settings: AppSettings) => void): void => {
  ipcRenderer.on('settings:changed', (_event, settings) => callback(settings))
}

// App.tsx: 리스너에서 titlebarStyle 반영
window.api.onSettingsChanged((s) => {
  setTitlebarStyle(s.titlebarStyle)
  // fontFamily도 같이 업데이트 가능
})
```

---

## 5. Implementation Order

| 순서 | FR | 난이도 | 예상 변경 파일 수 |
|------|-----|--------|------------------|
| 1 | FR-02 (체크박스) | 낮음 | 1 (ManagerWindow.tsx) |
| 2 | FR-01 (Ctrl+휠) | 낮음 | 1 (App.tsx) |
| 3 | FR-03 (제목줄 크기) | 중간 | 6 (types, store, App, Titlebar, CSS, ManagerWindow) |

---

## 6. Test Plan

### 6.1 FR-01 테스트

- [ ] Ctrl+Wheel Up → 폰트 크기 +1 확인
- [ ] Ctrl+Wheel Down → 폰트 크기 -1 확인
- [ ] min(10), max(28) 경계 확인
- [ ] 하단 툴바 슬라이더 동기화 확인
- [ ] Ctrl 없이 Wheel → 일반 스크롤 동작 확인

### 6.2 FR-02 테스트

- [ ] 메모 목록: 체크박스 클릭 → 토글, 나머지 유지
- [ ] 메모 목록: 행 클릭 → 토글, 나머지 유지
- [ ] 메모 목록: Shift+클릭 → 범위 선택
- [ ] 휴지통: 동일 동작 확인
- [ ] 더블클릭 → 메모 열기 (기존 동작 유지)

### 6.3 FR-03 테스트

- [ ] 설정에서 compact/default/spacious 변경
- [ ] 변경 즉시 열린 메모 창 반영 확인
- [ ] 앱 재시작 후 설정 유지 확인
- [ ] 제목줄 내 버튼/텍스트 레이아웃 정상 확인

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-12 | Initial draft | AI |
