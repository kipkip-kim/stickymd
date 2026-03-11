# Plan: Phase 13 — Global Hotkey, Clipboard Copy, Ctrl+Scroll Text Size

> **Feature**: phase13
> **Created**: 2026-03-11
> **Status**: Draft

---

## Executive Summary

| Perspective | Description |
|-------------|-------------|
| **Problem** | 메모를 빠르게 열 단축키가 없어 트레이→우클릭→새 메모 3단계가 필요하고, 메모 내용을 다른 앱에 붙여넣기 번거로우며, 텍스트 크기 조절이 불가능하다. |
| **Solution** | 글로벌 핫키(Ctrl+Shift+M)로 즉시 메모 생성/포커스, 메모 내용 클립보드 복사 버튼, 하단 툴바 슬라이더로 텍스트 크기 실시간 조절을 구현한다. |
| **Function UX Effect** | 어디서든 핫키 한 번으로 메모 접근, 한 번 클릭으로 마크다운을 플레인텍스트로 복사, 슬라이더로 직관적 텍스트 확대/축소가 가능하다. |
| **Core Value** | 3단계 → 1단계 접근으로 메모 진입 장벽 제거, 텍스트 크기 개인화로 가독성 향상, 클립보드 통합으로 메모 활용도 극대화. |

---

## 1. Background & Problem

### 1.1 현재 상황
- 새 메모 생성: 트레이 아이콘 우클릭 → 메뉴 → 새 메모 (3단계)
- 메모 내용 복사: 에디터에서 Ctrl+A → Ctrl+C (마크다운 문법 포함)
- 텍스트 크기: 고정 (설정 없음, 조절 불가)

### 1.2 핵심 문제
1. **접근성**: 다른 앱 사용 중 메모를 빠르게 열 수 없음
2. **공유성**: 메모 내용을 플레인텍스트로 깔끔하게 복사할 수 없음
3. **가독성**: 사용자마다 다른 시력/모니터 크기에 대응 불가

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Description |
|----|-------------|----------|-------------|
| FR-01 | 글로벌 핫키 | Must | `Ctrl+Shift+M`으로 새 메모 생성 또는 마지막 메모 포커스 |
| FR-02 | 핫키 커스터마이즈 | Should | 설정에서 글로벌 핫키 변경 가능 |
| FR-03 | 핫키 충돌 처리 | Must | 등록 실패 시 사용자 알림, 앱 crash 방지 |
| FR-04 | 클립보드 복사 버튼 | Must | 타이틀바 또는 컨텍스트 메뉴에서 메모 내용 플레인텍스트 복사 |
| FR-05 | 복사 피드백 | Should | 복사 완료 시 시각적 피드백 (툴팁 or 아이콘 변화) |
| FR-06 | 툴바 텍스트 크기 슬라이더 | Must | 하단 편집 툴바에 슬라이더로 텍스트 크기 조절 (opacity 슬라이더와 동일 UX) |
| FR-07 | 텍스트 크기 범위 | Must | 최소 10px ~ 최대 28px, 기본 16px |
| FR-08 | 텍스트 크기 저장 | Should | 전역 설정으로 크기 유지 (앱 재시작 시 복원) |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | 핫키 응답 | 키 입력 ~ 창 표시: 300ms 이내 |
| NFR-02 | 메모리 | 글로벌 핫키 등록에 추가 메모리 1MB 이하 |
| NFR-03 | 충돌 안전 | 핫키 등록 실패 시 앱 정상 동작 유지 |

---

## 3. Architecture

### 3.1 글로벌 핫키

```
[사용자] → Ctrl+Shift+M (어디서든)
    ↓
[Electron Main] globalShortcut.register()
    ↓
    ├── 열린 메모 있음 → 마지막 활성 메모 focus + restore
    └── 열린 메모 없음 → createMemoWindow()
```

- `globalShortcut` API 사용 (Electron built-in)
- `app.whenReady()` 후 등록, `will-quit` 시 해제
- 설정에서 커스텀 키 지원 (accelerator 문자열)

### 3.2 클립보드 복사

```
[타이틀바 복사 버튼] → onClick
    ↓
[Renderer] getEditor().getMarkdown()
    ↓
[Preload] window.api.copyToClipboard(text)
    ↓
[Main] clipboard.writeText(plainText)
    ↓
[Renderer] 복사 완료 피드백 (아이콘 1.5초 변경)
```

- 마크다운 → 플레인텍스트 변환 (# 제거, **bold** → bold 등)
- 또는 원본 마크다운 그대로 복사 (사용자 선택)

### 3.3 툴바 텍스트 크기 슬라이더

```
[EditorToolbar] fontSize 슬라이더 (opacity 슬라이더 옆)
    ↓
[App.tsx] fontSize state 업데이트
    ↓
[MemoEditor] view.dom.style.fontSize 즉시 반영
    ↓
[설정 저장] 전역 fontSize 저장 (debounce)
```

- 기존 opacity 슬라이더와 동일한 UI 패턴
- 범위: 10px ~ 28px, 기본 16px
- 라벨: "가" 아이콘 + 현재 크기 표시
- IPC 불필요 — 순수 Renderer 상태

---

## 4. Implementation Order

| Step | Task | Files | Effort |
|------|------|-------|--------|
| 1 | 툴바 텍스트 크기 슬라이더 | EditorToolbar.tsx, App.tsx, MemoEditor.tsx | Small |
| 2 | fontSize 전역 설정 저장 | types.ts, settings-ipc.ts, App.tsx | Small |
| 3 | 글로벌 핫키 등록 (Ctrl+Shift+M) | index.ts, new hotkey.ts | Medium |
| 4 | 핫키 설정 커스터마이즈 | ManagerWindow.tsx settings | Small |
| 5 | 클립보드 복사 버튼 | Titlebar.tsx, preload | Small |
| 6 | 복사 피드백 UI | Titlebar.tsx, CSS | Small |

---

## 5. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 다른 앱과 핫키 충돌 | Medium | 등록 실패 시 경고, 설정에서 변경 가능 |
| 슬라이더가 툴바 공간 부족 | Low | opacity 슬라이더와 나란히 배치, 라벨 최소화 |
| 클립보드에 서식 정보 필요 | Low | 플레인텍스트만 복사 (마크다운 원본) |

---

## 6. Success Criteria

- [ ] Ctrl+Shift+M → 메모 생성 또는 포커스 (300ms 이내)
- [ ] 핫키 등록 실패 시 앱 정상 동작
- [ ] 설정에서 핫키 변경 가능
- [ ] 복사 버튼 → 메모 내용 클립보드에 복사
- [ ] 복사 완료 시 시각적 피드백
- [ ] 툴바 슬라이더로 텍스트 크기 조절 (10~28px)
- [ ] 텍스트 크기 설정 저장 및 앱 재시작 시 복원
