# Plan: Sticky Memo

> **Feature**: sticky-memo
> **Created**: 2026-03-10
> **Status**: Draft

---

## Executive Summary

| Perspective | Description |
|-------------|-------------|
| **Problem** | Windows 기본 Sticky Notes는 메모가 쌓일수록 극심한 성능 저하와 강제 종료가 발생하여 실사용이 불가능해진다. |
| **Solution** | Tauri v2 기반 경량 데스크톱 앱으로, 스티키 메모와 마크다운 에디터를 겸용하며 노션 스타일 슬래시 커맨드를 지원하는 WYSIWYG 프로그램을 구축한다. |
| **Function UX Effect** | 핀 버튼 하나로 스티키 메모 ↔ 에디터 모드 전환, `/` 커맨드 팔레트와 인라인 단축키로 마크다운을 몰라도 쉽게 작성할 수 있다. |
| **Core Value** | 수백 개 메모에서도 버벅임 없는 안정성과, .md 파일 기반 이식성, 스티키+에디터 겸용의 실용성을 제공한다. |

---

## 1. Background & Problem

### 1.1 현재 상황
- Windows 기본 Sticky Notes 사용 중
- 메모가 수십~수백 개 쌓이면 심각한 성능 저하 발생
- 프로그램 강제 종료(crash) 빈번
- 데이터가 독자 포맷으로 저장되어 백업/이관이 어려움

### 1.2 핵심 문제
1. **성능**: 메모 개수 증가에 따른 비례적 성능 저하
2. **안정성**: 메모리 누수 및 crash로 인한 데이터 손실 위험
3. **이식성**: 메모 데이터를 다른 도구에서 사용 불가
4. **편집 경험**: 서식 지원이 제한적이고 마크다운 미지원

### 1.3 해결 목표
- 수백 개 메모에서도 즉시 실행, 버벅임 없는 성능
- crash 없는 안정성
- .md 파일 기반 저장으로 완전한 데이터 이식성
- 마크다운 편집/미리보기 모드 전환

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Description |
|----|-------------|----------|-------------|
| FR-01 | 메모 생성 | Must | 새 메모를 생성하고 즉시 편집 가능 |
| FR-02 | 메모 편집 (WYSIWYG) | Must | 마크다운 문법을 입력하면 즉시 서식이 적용되는 WYSIWYG 편집 |
| FR-03 | 편집/보기 모드 전환 | Must | WYSIWYG 편집 모드 ↔ 원본 마크다운(소스) 보기 모드 전환 |
| FR-11 | 슬래시 커맨드 (`/`) | Must | `/` 입력 시 서식 명령 팔레트 표시 (제목, 리스트, 체크박스, 코드블록, 구분선, 인용 등) |
| FR-12 | 인라인 마크다운 단축키 | Must | `# `+Space→제목, `- `→리스트, `> `→인용 등 마크다운 입력 시 실시간 서식 변환 |
| FR-13 | 스티키 메모 모드 | Must | 핀 버튼 클릭 시 항상 위(Always on Top) 스티키 메모로 동작. 타이틀바 최소화, 컴팩트 UI |
| FR-14 | 에디터 모드 | Must | 핀 해제 시 일반 에디터 창으로 동작. 사이드바 접근 가능, 풀 UI |
| FR-15 | 사이드바 토글 | Must | 사이드바 숨김/표시 전환. 에디터 모드에서 햄버거 메뉴 또는 단축키로 열기 |
| FR-16 | 간편 설치/삭제 | Must | MSI 또는 NSIS 인스톨러로 원클릭 설치, Windows 설정에서 표준 삭제 |
| FR-04 | 자동 저장 | Must | 편집 중 일정 간격(2초 debounce)으로 자동 저장 |
| FR-05 | 로컬 .md 파일 저장 | Must | 각 메모를 개별 .md 파일로 로컬 디렉토리에 저장 |
| FR-06 | 메모 목록 | Must | 저장된 모든 메모를 목록으로 표시 (제목, 수정일) |
| FR-07 | 메모 삭제 | Must | 메모 삭제 시 확인 후 .md 파일 삭제 |
| FR-08 | 메모 검색 | Should | 제목 및 내용 기반 텍스트 검색 |
| FR-09 | 메모 고정(Pin) | Could | 중요 메모를 목록 상단에 고정 |
| FR-10 | 저장 디렉토리 설정 | Should | 메모 저장 경로를 사용자가 지정 가능 |

### 2.2 Slash Command Spec (`/` 커맨드)

사용자가 빈 줄 또는 줄 시작에서 `/`를 입력하면 커맨드 팔레트(드롭다운)가 표시된다.
키보드 방향키 또는 문자 입력으로 필터링/선택할 수 있다.

| Command | Output (Markdown) | Description |
|---------|-------------------|-------------|
| `/h1` or `/제목1` | `# ` | Heading 1 |
| `/h2` or `/제목2` | `## ` | Heading 2 |
| `/h3` or `/제목3` | `### ` | Heading 3 |
| `/bullet` or `/리스트` | `- ` | Bullet list |
| `/numbered` or `/번호` | `1. ` | Numbered list |
| `/todo` or `/체크` | `- [ ] ` | Checkbox (task list) |
| `/code` or `/코드` | ` ``` ` | Code block (fenced) |
| `/quote` or `/인용` | `> ` | Blockquote |
| `/divider` or `/구분선` | `---` | Horizontal rule |
| `/bold` or `/굵게` | `**text**` | Bold text |
| `/italic` or `/기울임` | `*text*` | Italic text |
| `/link` or `/링크` | `[text](url)` | Hyperlink |
| `/image` or `/이미지` | `![alt](path)` | Image (향후 확장) |
| `/table` or `/표` | 2x2 table template | Table scaffold |

- 한글/영문 모두 검색 가능 (예: `/제` 입력 시 제목1, 제목2, 제목3 필터링)
- ESC 키로 팔레트 닫기
- 최대 10개 항목 표시, 스크롤 가능

### 2.3 Inline Markdown Shortcuts (인라인 단축키)

줄 시작에서 마크다운 문법을 입력하면 즉시 서식 블록으로 변환된다.

| Input | Trigger | Result |
|-------|---------|--------|
| `# ` + Space | 줄 시작 | Heading 1 블록으로 변환 |
| `## ` + Space | 줄 시작 | Heading 2 블록으로 변환 |
| `### ` + Space | 줄 시작 | Heading 3 블록으로 변환 |
| `- ` or `* ` | 줄 시작 | Bullet list 항목으로 변환 |
| `1. ` | 줄 시작 | Numbered list 항목으로 변환 |
| `- [ ] ` | 줄 시작 | Checkbox 항목으로 변환 |
| `> ` | 줄 시작 | Blockquote 블록으로 변환 |
| `` ``` `` | 줄 시작 | Code block으로 변환 |
| `---` + Enter | 줄 시작 | Horizontal rule 삽입 |
| `**text**` | 인라인 | **Bold** 서식 적용 |
| `*text*` | 인라인 | *Italic* 서식 적용 |
| `` `text` `` | 인라인 | `Inline code` 서식 적용 |
| `~~text~~` | 인라인 | ~~Strikethrough~~ 서식 적용 |

### 2.4 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | 실행 속도 | 앱 시작 ~ 목록 표시: 1초 이내 |
| NFR-02 | 메모 로딩 | 개별 메모 열기: 100ms 이내 |
| NFR-03 | 메모리 사용량 | 100개 메모 기준: 100MB 이하 |
| NFR-04 | 설치 파일 크기 | 인스톨러: 10MB 이하 |
| NFR-05 | 지원 OS | Windows 10 (1803+) 이상 |
| NFR-06 | 안정성 | 500개 메모에서도 crash 없음 |

---

## 3. Tech Stack

### 3.1 선정 기술

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Tauri v2 | Electron 대비 10배 이상 가벼움, Windows WebView2 활용, Rust 백엔드로 안정성 확보 |
| **Frontend** | React 19 + TypeScript | 컴포넌트 기반 UI, 타입 안전성 |
| **빌드 도구** | Vite | 빠른 HMR, Tauri와 공식 통합 |
| **WYSIWYG 편집기** | Milkdown (ProseMirror + remark 기반) | 마크다운 WYSIWYG 편집, 슬래시 커맨드 플러그인 내장, .md 파일 직접 입출력 |
| **마크다운 소스 보기** | CodeMirror 6 | 원본 마크다운 소스 편집 시 사용 (소스 모드 전환용) |
| **파일 I/O** | Tauri fs API (Rust) | 네이티브 파일 시스템 접근, 비동기 I/O |
| **상태 관리** | Zustand | 경량 상태 관리, 보일러플레이트 최소 |
| **스타일링** | Tailwind CSS 4 | 유틸리티 기반 빠른 UI 구현 |

### 3.2 대안 검토

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Electron | 큰 생태계, 쉬운 개발 | 200MB+ 설치 크기, 높은 메모리 사용 | **탈락** - 경량 요구사항 불충족 |
| Tauri v2 | ~5MB 설치, 낮은 메모리, Rust 안정성 | 상대적으로 작은 생태계 | **채택** |
| WPF/WinForms | 네이티브 성능 | 웹 기반 마크다운 렌더링 어려움, C# 필요 | **탈락** |

---

## 4. Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────┐
│                  Tauri Shell                 │
│  ┌───────────────────────────────────────┐   │
│  │          React Frontend (WebView2)    │   │
│  │  ┌─────────┐  ┌──────────────────┐    │   │
│  │  │Sidebar │  │  Editor Area     │    │   │
│  │  │(숨김형)│  │  ┌────────────┐  │    │   │
│  │  │        │  │  │[📌 Pin]    │  │    │   │
│  │  │ - 검색 │  │  │ Milkdown   │  │    │   │
│  │  │ - 메모 │  │  │ (WYSIWYG)  │  │    │   │
│  │  │   리스트│  │  │ + Slash Cmd│  │    │   │
│  │  │ - 새메모│  │  ├────────────┤  │    │   │
│  │  │ - 설정 │  │  │ CodeMirror │  │    │   │
│  │  │        │  │  │ (소스모드) │  │    │   │
│  │  │        │  │  └────────────┘  │    │   │
│  │  └─────────┘  └──────────────────┘    │   │
│  └───────────────────────────────────────┘   │
│  ┌───────────────────────────────────────┐   │
│  │          Rust Backend (Tauri Core)    │   │
│  │  ┌──────────┐  ┌─────────────────┐   │   │
│  │  │ File I/O │  │  Config Manager  │   │   │
│  │  │ Commands │  │  (settings.json) │   │   │
│  │  └──────────┘  └─────────────────┘   │   │
│  └───────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
         │
         ▼
  ~/Documents/StickyMemo/*.md   (로컬 파일 저장)
```

### 4.2 Data Flow

```
[사용자 입력]
    ↓
[Milkdown WYSIWYG 편집기]
    ├── "/" 입력 → [Slash Command 팔레트] → 서식 선택 → 블록 삽입
    ├── "# " 입력 → [InputRule] → 즉시 Heading 블록 변환
    └── 일반 입력 → [ProseMirror Document 업데이트]
                          ↓
                   (2초 debounce)
                          ↓
                [Milkdown → Markdown 직렬화]
                          ↓
                [Tauri invoke: save_memo]
                          ↓
                [Rust: fs::write → .md 파일]

[소스 모드 전환 시]
    Milkdown Doc → markdown serialize → CodeMirror에 표시
    CodeMirror 편집 → markdown deserialize → Milkdown Doc에 반영
```

### 4.3 Window Modes (스티키 모드 / 에디터 모드)

```
┌─ 에디터 모드 (기본) ──────────────────────┐
│ [☰ 사이드바] [📌 Pin]        [─][□][✕]   │
│ ┌──────────┬─────────────────────────┐    │
│ │ Sidebar  │  Milkdown WYSIWYG       │    │
│ │ (열림)   │  + Slash Commands       │    │
│ │          │                         │    │
│ │ 메모목록 │  풀 에디터 영역          │    │
│ │ 검색     │                         │    │
│ └──────────┴─────────────────────────┘    │
└───────────────────────────────────────────┘

        📌 Pin 클릭 (Always on Top 활성화)
                    ↓

┌─ 스티키 메모 모드 ──────┐
│ [📌] 메모 제목    [✕]   │  ← 타이틀바 최소화
│ ┌───────────────────┐   │
│ │ Milkdown WYSIWYG  │   │  ← 사이드바 숨김
│ │ + Slash Commands  │   │  ← 컴팩트 편집 영역
│ │                   │   │  ← 항상 위(Always on Top)
│ └───────────────────┘   │
└─────────────────────────┘
```

- **에디터 모드**: 일반 창, 사이드바 접근 가능, 리사이즈 자유, 풀 메뉴
- **스티키 모드**: Always on Top, 사이드바 자동 숨김, 컴팩트 UI, 메모 제목만 표시
- 모드 전환 시 창 크기/위치 기억 (각 모드별 마지막 상태 저장)

### 4.4 File Structure (저장 포맷)

```
~/Documents/StickyMemo/
├── settings.json          # 앱 설정 (저장 경로, 테마 등)
├── memo-metadata.json     # 메모 메타데이터 (고정, 정렬 순서)
├── 2026-03-10_첫번째메모.md
├── 2026-03-10_할일목록.md
└── ...
```

각 .md 파일은 YAML frontmatter로 메타데이터를 포함:

```markdown
---
title: 첫번째 메모
created: 2026-03-10T14:30:00
modified: 2026-03-10T15:00:00
pinned: false
---

# 메모 내용

여기에 마크다운으로 작성...
```

---

## 5. Scope

### 5.1 In Scope (v1.0)
- 메모 CRUD (생성, 읽기, 수정, 삭제)
- Milkdown 기반 WYSIWYG 마크다운 편집
- 슬래시 커맨드 (`/`) 팔레트 (14종 서식)
- 인라인 마크다운 단축키 (실시간 서식 변환)
- WYSIWYG 모드 ↔ 소스(원본 마크다운) 모드 전환
- 스티키 메모 모드 (핀 → Always on Top, 컴팩트 UI)
- 에디터 모드 (일반 창, 사이드바 접근)
- 사이드바 토글 (숨김/표시)
- 자동 저장 (2초 debounce)
- 로컬 .md 파일 저장/로드
- 메모 목록 (사이드바)
- 기본 검색 (제목/내용)
- 메모 고정(Pin)
- 저장 디렉토리 설정
- MSI/NSIS 인스톨러로 간편 설치/삭제
- Windows 10+ 지원

### 5.2 Out of Scope (향후 고려)
- 클라우드 동기화
- 다중 기기 동기화
- 태그/폴더 분류 시스템
- 이미지 붙여넣기 지원
- 다크/라이트 테마 전환
- 시스템 트레이 상주
- 글로벌 단축키 (빠른 메모)
- 내보내기 (PDF, HTML)

---

## 6. Project Structure

```
C:\Projects\Memo\
├── src-tauri/                  # Rust 백엔드
│   ├── src/
│   │   ├── main.rs            # Tauri 진입점
│   │   ├── commands/          # Tauri commands
│   │   │   ├── mod.rs
│   │   │   ├── memo.rs        # 메모 CRUD 커맨드
│   │   │   └── config.rs      # 설정 관련 커맨드
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                        # React 프론트엔드
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx     # 메모 목록 사이드바
│   │   │   ├── MemoItem.tsx    # 개별 메모 항목
│   │   │   └── SearchBar.tsx   # 검색 바
│   │   ├── Editor/
│   │   │   ├── Editor.tsx           # 편집 모드 컨테이너 (WYSIWYG / 소스 전환)
│   │   │   ├── MilkdownEditor.tsx   # Milkdown WYSIWYG 편집기
│   │   │   ├── SlashMenu.tsx        # 슬래시 커맨드 팔레트 UI
│   │   │   └── SourceEditor.tsx     # CodeMirror 소스 모드 편집기
│   │   ├── TitleBar/
│   │   │   └── TitleBar.tsx         # 커스텀 타이틀바 (핀 버튼, 모드 표시)
│   │   └── common/
│   │       └── Button.tsx
│   ├── stores/
│   │   └── memoStore.ts        # Zustand 스토어
│   ├── hooks/
│   │   ├── useAutoSave.ts      # 자동 저장 훅
│   │   └── useMemos.ts         # 메모 CRUD 훅
│   ├── types/
│   │   └── memo.ts             # 타입 정의
│   └── styles/
│       └── globals.css         # Tailwind + 글로벌 스타일
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── docs/
    └── 01-plan/
        └── features/
            └── sticky-memo.plan.md
```

---

## 7. Implementation Order

| Phase | Task | Estimated Effort |
|-------|------|-----------------|
| 1 | Tauri + React + Vite 프로젝트 초기화 | Small |
| 2 | Rust 파일 I/O 커맨드 구현 (읽기/쓰기/삭제/목록) | Medium |
| 3 | Zustand 스토어 + 메모 타입 정의 | Small |
| 4 | 사이드바 (메모 목록) UI 구현 | Medium |
| 5 | Milkdown WYSIWYG 편집기 기본 구현 | Medium |
| 6 | 인라인 마크다운 단축키 (InputRules) 구현 | Medium |
| 7 | 슬래시 커맨드 (`/`) 팔레트 구현 | Large |
| 8 | CodeMirror 소스 모드 + 모드 전환 | Medium |
| 9 | 자동 저장 (debounce) 구현 | Small |
| 10 | 검색 기능 구현 | Small |
| 11 | 메모 고정(Pin to list) 기능 | Small |
| 12 | 스티키 모드 / 에디터 모드 전환 (핀 버튼 + Always on Top) | Medium |
| 13 | 사이드바 토글 (숨김/표시) | Small |
| 14 | 커스텀 타이틀바 (스티키 모드용 컴팩트 UI) | Medium |
| 15 | 설정 (저장 경로 변경) | Small |
| 16 | MSI/NSIS 인스톨러 빌드 + 간편 설치/삭제 | Medium |

---

## 8. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WebView2 미설치 환경 | High | Low | Windows 10 1803+ 에는 기본 포함, Tauri가 자동 설치 프롬프트 제공 |
| 대용량 .md 파일 편집 시 성능 | Medium | Low | CodeMirror 6 가상 스크롤 활용, 파일 크기 제한 경고 |
| 파일명 충돌 | Medium | Medium | UUID 기반 파일명 + frontmatter로 제목 관리 |
| 동시 편집 충돌 (외부 에디터) | Low | Low | 파일 변경 감지(fs watch)로 리로드 제안 |

---

## 9. Success Criteria

- [ ] 앱 시작 ~ 목록 표시: 1초 이내
- [ ] 500개 메모 로드 시 crash 없음
- [ ] 설치 파일 크기 10MB 이하
- [ ] 메모 편집 → 자동 저장 → 재실행 시 데이터 유지 확인
- [ ] 편집 모드 ↔ 보기 모드 전환 정상 동작
- [ ] .md 파일을 다른 에디터(VS Code 등)에서 열기 가능
- [ ] 슬래시 커맨드 `/` 입력 시 팔레트 표시 및 서식 적용
- [ ] 인라인 단축키 (`# ` + Space → Heading 등) 정상 변환
- [ ] WYSIWYG 모드 ↔ 소스 모드 전환 시 내용 동기화
- [ ] 핀 버튼 클릭 시 Always on Top 스티키 모드 전환
- [ ] 사이드바 토글 정상 동작 (열기/닫기)
- [ ] MSI/NSIS 인스톨러로 설치 후 Windows 설정에서 정상 삭제 가능
