# Phase 16: Toggle Block + Customizable Toolbar Planning Document

> **Summary**: Notion 스타일 토글(접기/펼치기) 블록 추가 및 하단 서식 툴바 커스터마이징 기능
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
| **Problem** | 메모 내용이 길어지면 정리가 어렵고, 하단 툴바에 사용자가 원하는 서식 버튼만 배치할 수 없음 |
| **Solution** | Notion 스타일 토글 블록(접기/펼치기) 추가 + 툴바 버튼 선택/순서 커스터마이징 |
| **Function/UX Effect** | 콘텐츠를 접어서 메모를 깔끔하게 정리, 자주 쓰는 서식만 빠르게 접근 |
| **Core Value** | 개인화된 작업 환경으로 메모 생산성 향상 |

---

## 1. Overview

### 1.1 Purpose

두 가지 연관 기능을 구현한다:
1. **토글 블록**: `>` + 스페이스로 접기/펼치기 가능한 콘텐츠 블록 생성 (Notion의 toggle list와 동일)
2. **커스터마이징 툴바**: 하단 서식 툴바에 표시할 버튼과 순서를 사용자가 설정에서 선택

토글을 먼저 구현한 뒤 툴바 커스터마이징에서 토글 버튼도 포함시킨다.

### 1.2 Background

- 사용자가 Notion의 토글 기능을 자주 사용하며, `>` + 스페이스가 blockquote 대신 토글을 생성하길 원함
- 현재 하단 툴바는 고정 4개 버튼(B, U, ☑, •)으로, 사용자별 선호 서식이 다름
- blockquote는 슬래시 커맨드 `/인용`으로 계속 사용 가능

### 1.3 Related Documents

- EditorToolbar: `src/renderer/src/components/EditorToolbar.tsx`
- Slash commands: `src/renderer/src/constants/slash-commands.ts`
- Settings: `src/shared/types.ts` (AppSettings)
- Underline plugin (커스텀 플러그인 패턴): `src/renderer/src/plugins/underline-plugin.ts`

---

## 2. Scope

### 2.1 In Scope

- [x] FR-01: 토글 블록 — ProseMirror 커스텀 노드 (details/summary)
- [x] FR-02: `>` + 스페이스 입력 규칙을 토글로 변경
- [x] FR-03: 토글 → 마크다운 `<details><summary>` HTML 직렬화/파싱
- [x] FR-04: 슬래시 커맨드에 `/토글` 추가
- [x] FR-05: 툴바 버튼 선택 (설정에서 on/off)
- [x] FR-06: 툴바 버튼 순서 변경 (위/아래 화살표)
- [x] FR-07: 툴바 최대 버튼 수 제한

### 2.2 Out of Scope

- 토글 중첩 (toggle 안에 toggle) — 복잡도 과다, v2.0에서 고려
- 드래그 앤 드롭 순서 변경 — 외부 라이브러리 필요, 화살표 버튼으로 대체
- 토글 내 이미지/코드블록 — 단순 텍스트+인라인 서식만 지원
- blockquote 입력 규칙 유지 — `>` + 스페이스는 토글로 전환, blockquote는 슬래시 전용

---

## 3. Requirements

### 3.1 Functional Requirements

#### FR-01: 토글 블록 (Toggle Block)

| Item | Detail |
|------|--------|
| **설명** | 접기/펼치기 가능한 콘텐츠 블록 |
| **동작** | 삼각형(▶/▼) 클릭으로 내용을 접거나 펼침 |
| **렌더링** | HTML `<details><summary>` 네이티브 요소 사용 |
| **기본 상태** | 펼쳐진 상태 (open) |
| **편집** | summary 영역과 content 영역 모두 인라인 편집 가능 |

#### FR-02: 입력 규칙 변경

| Item | Detail |
|------|--------|
| **트리거** | `>` + 스페이스 (줄 시작) |
| **변경 전** | blockquote 생성 |
| **변경 후** | 토글 블록 생성 |
| **blockquote** | 슬래시 `/인용` 또는 `/quote`로만 생성 가능 |

#### FR-03: 마크다운 직렬화

| Item | Detail |
|------|--------|
| **저장 형식** | `<details><summary>제목</summary>\n\n내용\n\n</details>` |
| **호환성** | GitHub, VS Code, Obsidian, Typora에서 토글 정상 작동 |
| **불러오기** | `<details>` HTML이 포함된 .md 파일을 토글 블록으로 파싱 |

#### FR-04: 슬래시 커맨드

| Item | Detail |
|------|--------|
| **명령어** | `/토글`, `/toggle` |
| **동작** | 현재 위치에 빈 토글 블록 삽입, 커서는 summary에 위치 |

#### FR-05: 툴바 버튼 선택

| Item | Detail |
|------|--------|
| **설정 위치** | 설정 탭 → 툴바 설정 섹션 |
| **UI** | 체크박스 목록 (아이템명 + 아이콘) |
| **기본값** | bold, underline, checkbox, bullet (현재와 동일) |
| **저장** | `settings.json`의 `toolbarItems: string[]` |

사용 가능한 전체 아이템:

| ID | 아이콘 | 이름 | 기본 포함 |
|---|---|---|---|
| bold | **B** | 굵게 | O |
| underline | U | 밑줄 | O |
| italic | *I* | 기울임 | X |
| strikethrough | ~~S~~ | 취소선 | X |
| h1 | H1 | 제목1 | X |
| h2 | H2 | 제목2 | X |
| h3 | H3 | 제목3 | X |
| checkbox | ☑ | 체크박스 | O |
| bullet | • | 글머리 기호 | O |
| ordered | 1. | 번호 목록 | X |
| quote | " | 인용 | X |
| code | </> | 코드 블록 | X |
| hr | — | 구분선 | X |
| toggle | ▶ | 토글 | X |

#### FR-06: 툴바 버튼 순서 변경

| Item | Detail |
|------|--------|
| **UI** | 각 아이템 옆 위/아래 화살표 버튼 |
| **동작** | 선택된(체크된) 아이템의 순서를 변경 |
| **저장** | `toolbarItems` 배열 순서가 곧 표시 순서 |

#### FR-07: 툴바 최대 버튼 수

| Item | Detail |
|------|--------|
| **최대 개수** | 6개 |
| **근거** | 기본 메모 너비 240px, 버튼 36px/개, 슬라이더 2개 ~200px |
| **초과 시** | 체크박스 비활성화 + 안내 메시지 |

### 3.2 Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | 토글 접기/펼치기 애니메이션 없음 (즉시 전환) — 성능 우선 |
| NFR-02 | 토글 블록은 다크모드/라이트모드 모두에서 시각적으로 구분 |
| NFR-03 | 기존 메모 데이터 호환 — 토글 없는 기존 .md 파일에 영향 없음 |
| NFR-04 | 설정 변경 시 열린 메모의 툴바에 즉시 반영 |

---

## 4. Implementation Order

### Step 1: 토글 블록 플러그인 (FR-01, FR-03)

1. `src/renderer/src/plugins/toggle-plugin.ts` 신규 생성
   - `details` 노드 스키마 (container, content: summary + block+)
   - `summary` 노드 스키마 (inline content)
   - remark 플러그인으로 `<details>` HTML 파싱/직렬화
   - `$prose()` 로 Milkdown 플러그인 등록
2. `MemoEditor.tsx`에 `.use(togglePlugin)` 추가
3. `MemoEditor.css`에 토글 스타일 추가
4. tsc + 빌드 검증

### Step 2: 입력 규칙 + 슬래시 커맨드 (FR-02, FR-04)

1. `>` + 스페이스 입력 규칙을 토글로 변경 (commonmark의 blockquote inputRule 오버라이드)
2. 슬래시 커맨드에 `toggle` 추가 (`slash-commands.ts`, `useSlashExecute.ts`)
3. 기존 blockquote 슬래시는 유지 (`/인용`, `/quote`)
4. tsc + 빌드 + 동작 검증

### Step 3: 툴바 커스터마이징 설정 (FR-05, FR-06, FR-07)

1. `AppSettings`에 `toolbarItems: string[]` 추가 (기본값: `['bold','underline','checkbox','bullet']`)
2. 설정 UI에 툴바 섹션 추가 — 체크박스 + 위/아래 화살표
3. 최대 6개 제한 로직
4. tsc + 빌드 검증

### Step 4: EditorToolbar 동적 렌더링 (FR-05 연결)

1. `EditorToolbar.tsx` 리팩터 — 아이템 레지스트리 기반 동적 렌더
2. 설정에서 `toolbarItems`를 읽어 해당 버튼만 표시
3. 새 아이템 핸들러 추가 (italic, strikethrough, h1~h3, ordered, quote, code, hr, toggle)
4. IPC로 settings 변경 시 실시간 반영
5. tsc + 빌드 + 동작 검증

---

## 5. Risk Analysis

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| `>` inputRule 오버라이드 실패 | 높음 | 중간 | commonmark 플러그인 소스 확인, wrappingInputRule 제거 후 커스텀 규칙 등록 |
| `<details>` HTML 파싱 실패 | 높음 | 중간 | remark-rehype가 HTML 패스스루 지원하는지 확인, 필요시 커스텀 remark 플러그인 |
| 토글 내부 커서 이동 문제 | 중간 | 높음 | ProseMirror nodeView로 정밀 제어, arrow key 탐색 테스트 |
| 툴바 버튼 6개 초과 시 레이아웃 깨짐 | 낮음 | 낮음 | 최대 개수 제한으로 방지 |
| 기존 blockquote 입력 습관 혼란 | 낮음 | 중간 | 설정에서 안내 문구 표시, `/인용`으로 대체 가능 |

---

## 6. Testing Checklist

- [ ] `>` + 스페이스 → 토글 블록 생성 확인
- [ ] 토글 삼각형 클릭 → 접기/펼치기 동작
- [ ] 토글 내부에서 텍스트 편집 가능
- [ ] 저장 후 .md 파일에 `<details><summary>` 형식으로 저장
- [ ] .md 파일 다시 열었을 때 토글로 렌더링
- [ ] `/토글` 슬래시 커맨드 동작
- [ ] `/인용` blockquote 정상 동작 (기존 기능 유지)
- [ ] 설정에서 툴바 아이템 체크/해제 → 즉시 반영
- [ ] 위/아래 화살표로 순서 변경
- [ ] 최대 6개 초과 시 추가 선택 불가
- [ ] 다크모드에서 토글 + 툴바 UI 정상
