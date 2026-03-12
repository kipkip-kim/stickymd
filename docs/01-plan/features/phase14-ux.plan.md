# Phase 14 UX 개선 Planning Document

> **Summary**: 메모 사용성 향상을 위한 3가지 UX 기능 추가 — Ctrl+휠 폰트 크기, 체크박스 다중 선택 일관성, 제목줄 크기 설정
>
> **Project**: Sticky Memo
> **Version**: 1.0.0
> **Author**: AI
> **Date**: 2026-03-12
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 폰트 크기 조절이 직관적이지 않고, 메모 목록 체크박스 동작이 비일관적이며, 제목줄 크기를 사용자가 선택할 수 없음 |
| **Solution** | 브라우저 표준 Ctrl+휠 확대, 체크박스 토글 방식 통일, 제목줄 3단계 스타일 설정 추가 |
| **Function/UX Effect** | 익숙한 조작감으로 폰트 조절, 예측 가능한 다중 선택, 개인화된 제목줄 크기 |
| **Core Value** | 네이티브 앱 수준의 직관적 사용 경험 제공 |

---

## 1. Overview

### 1.1 Purpose

사용자 피드백 기반 UX 개선 3건을 한 번에 구현하여 메모 앱의 전체적인 사용 편의성을 높인다.

### 1.2 Background

- Ctrl+휠 확대/축소는 브라우저, VS Code 등 거의 모든 앱에서 지원하는 표준 UX — 사용자가 자연스럽게 기대함
- 메모 목록에서 체크박스 클릭과 행 클릭의 선택 동작이 다르게 동작하여 혼란 유발
- 제목줄(36px 고정)이 일부 사용자에게는 너무 크거나 작을 수 있음 — OS별 스타일 대응 필요

### 1.3 Related Documents

- Phase 13 Plan (archived: `docs/archive/2026-03/phase13b/`)
- Settings IPC: `src/main/lib/settings-ipc.ts`

---

## 2. Scope

### 2.1 In Scope

- [x] FR-01: Ctrl+휠 스크롤로 폰트 크기 조절
- [x] FR-02: 메모 목록/휴지통 체크박스 다중 선택 일관성
- [x] FR-03: 설정창 제목줄 크기 3단계 선택

### 2.2 Out of Scope

- 핀치 줌 (터치스크린) — 향후 고려
- 제목줄 커스텀 색상/글꼴 — 현재 불필요
- 메모 내용 줌 레벨 (웹 기반 zoom) — 폰트 크기 조절로 대체

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Ctrl+휠 Up → 폰트 크기 +1, Ctrl+휠 Down → -1 (min 10, max 28) | High | Pending |
| FR-01a | 현재 폰트 크기 변경 즉시 저장 (기존 handleFontSizeChange 재활용) | High | Pending |
| FR-01b | 에디터 영역에서만 동작 (타이틀바, 툴바 등에서는 무시) | Medium | Pending |
| FR-02 | 체크박스 클릭 시 해당 항목만 토글 (다른 선택 유지) | High | Pending |
| FR-02a | 행 클릭도 체크박스와 동일하게 토글 방식으로 변경 | High | Pending |
| FR-02b | Shift+클릭 범위 선택 유지 | Medium | Pending |
| FR-02c | 메모 목록 탭, 휴지통 탭 모두 동일하게 적용 | High | Pending |
| FR-03 | 설정에 `titlebarStyle` 옵션 추가 ('compact' \| 'default' \| 'spacious') | High | Pending |
| FR-03a | compact=28px (Mac 스타일), default=36px (현재), spacious=44px (Windows 스타일) | High | Pending |
| FR-03b | 설정 변경 시 열린 모든 메모 창에 실시간 반영 | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | Ctrl+휠 이벤트 디바운스 불필요 (1px 단위) | 수동 테스트 |
| UX | 기존 하단 툴바 슬라이더와 동기화 유지 | 수동 테스트 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~03 모든 기능 구현 완료
- [ ] `npm run typecheck` 통과
- [ ] 실행 후 수동 테스트 통과

### 4.2 Quality Criteria

- [ ] 기존 기능 회귀 없음
- [ ] 빌드 성공

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Ctrl+휠이 Electron 기본 줌과 충돌 | High | Medium | `webFrame.setZoomLevel` 대신 커스텀 핸들러에서 `e.preventDefault()` |
| 행 클릭 동작 변경이 더블클릭(메모 열기)에 영향 | Medium | Low | 더블클릭 핸들러는 별도 유지, 싱글 클릭만 토글 방식으로 변경 |
| 제목줄 크기 변경 시 레이아웃 깨짐 | Medium | Low | CSS 변수로 높이 제어, flex 기반 레이아웃 유지 |

---

## 6. Architecture Considerations

### 6.1 FR-01: Ctrl+휠 폰트 크기

**변경 파일:**
- `src/renderer/src/App.tsx` — wheel 이벤트 리스너 추가
- `src/renderer/src/components/MemoEditor.tsx` — (선택적) 에디터 영역 타겟팅

**구현 방식:**
- `App.tsx`에서 `useEffect`로 document-level `wheel` 이벤트 리스너 등록
- `e.ctrlKey && e.deltaY` 감지 → `handleFontSizeChange` 호출
- `e.preventDefault()`로 Electron 기본 줌 차단
- 기존 `fontSize` 상태 + `handleFontSizeChange` 콜백 재활용

### 6.2 FR-02: 체크박스 다중 선택 일관성

**변경 파일:**
- `src/renderer/src/components/ManagerWindow.tsx` — `handleMemoClick` 수정

**현재 문제:**
- 행 클릭: Ctrl 없이 클릭하면 `next.clear()` → 기존 선택 해제
- 체크박스 클릭: 항상 개별 토글 (`stopPropagation`으로 행 클릭 차단)
- 결과: 행 클릭 → 단일 선택, 체크박스 → 다중 토글 → 비일관적

**수정 방향:**
- 행 클릭도 체크박스와 동일하게 토글 방식으로 변경
- 일반 클릭: 해당 항목 토글 (다른 선택 유지)
- Shift+클릭: 범위 선택 (기존 유지)

### 6.3 FR-03: 제목줄 크기 설정

**변경 파일:**
- `src/shared/types.ts` — `AppSettings`에 `titlebarStyle` 추가
- `src/main/lib/store.ts` — 기본값 설정
- `src/renderer/src/components/Titlebar.module.css` — CSS 변수 기반 높이
- `src/renderer/src/components/Titlebar.tsx` — 스타일 적용
- `src/renderer/src/App.tsx` — settings에서 titlebarStyle 읽기
- Manager Window 설정 탭 — UI 추가

**크기 매핑:**

| 스타일 | 높이 | 설명 |
|--------|------|------|
| compact | 28px | Mac 스타일, 작고 깔끔 |
| default | 36px | 현재 기본값 |
| spacious | 44px | Windows 스타일, 넉넉한 터치 영역 |

---

## 7. Implementation Order

1. **FR-02** (체크박스) — 가장 단순, `handleMemoClick` 한 줄 수정
2. **FR-01** (Ctrl+휠) — App.tsx에 이벤트 리스너 추가
3. **FR-03** (제목줄 크기) — 설정 + CSS + IPC 연동 필요하여 가장 복잡

---

## 8. Next Steps

1. [ ] Write design document (`phase14-ux.design.md`)
2. [ ] Start implementation
3. [ ] Gap analysis

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-12 | Initial draft | AI |
