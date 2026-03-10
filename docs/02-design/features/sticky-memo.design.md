# Design: Sticky Memo

> **Feature**: sticky-memo
> **Plan Reference**: `docs/01-plan/features/sticky-memo.plan.md`
> **Created**: 2026-03-10
> **Status**: Draft

---

## 1. System Architecture

### 1.1 Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│  ┌─────────┐ ┌──────────────┐ ┌───────────────────────┐ │
│  │TitleBar │ │   Sidebar    │ │    Editor Area        │ │
│  │(커스텀) │ │  (토글 가능) │ │ ┌───────────────────┐ │ │
│  │ 핀/모드 │ │  검색+목록   │ │ │ MilkdownEditor    │ │ │
│  └─────────┘ └──────────────┘ │ │ (WYSIWYG+Slash)   │ │ │
│                               │ ├───────────────────┤ │ │
│                               │ │ SourceEditor      │ │ │
│                               │ │ (CodeMirror)      │ │ │
│                               │ └───────────────────┘ │ │
│                               └───────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                    State Layer (Zustand)                 │
│  memoStore: memos, activeMemo, editorMode, windowMode   │
│  uiStore: sidebarOpen, searchQuery                      │
├─────────────────────────────────────────────────────────┤
│                    Bridge Layer (Tauri IPC)              │
│  invoke("save_memo")  invoke("load_memos")              │
│  invoke("delete_memo") invoke("get_config")             │
│  invoke("set_config")  invoke("search_memos")           │
├─────────────────────────────────────────────────────────┤
│                    Backend Layer (Rust)                  │
│  commands/memo.rs   commands/config.rs                  │
│  ┌──────────┐ ┌───────────┐ ┌──────────────┐           │
│  │ File I/O │ │ Frontmatter│ │ Window Mgmt │           │
│  │ (async)  │ │ Parser    │ │ (always_on_  │           │
│  │          │ │           │ │  top, resize)│           │
│  └──────────┘ └───────────┘ └──────────────┘           │
├─────────────────────────────────────────────────────────┤
│                    Storage Layer (Local FS)              │
│  ~/Documents/StickyMemo/*.md                            │
│  ~/Documents/StickyMemo/settings.json                   │
└─────────────────────────────────────────────────────────┘
```

### 1.2 Tech Stack Versions

| Technology | Version | Purpose |
|-----------|---------|---------|
| Tauri | 2.x | Desktop framework |
| React | 19.x | UI library |
| TypeScript | 5.x | Type safety |
| Vite | 6.x | Build tool |
| Milkdown | 7.x | WYSIWYG markdown editor |
| @milkdown/plugin-slash | 7.x | Slash command support |
| @milkdown/plugin-listener | 7.x | Editor change events |
| CodeMirror | 6.x | Source mode editor |
| @codemirror/lang-markdown | 6.x | Markdown syntax support |
| Zustand | 5.x | State management |
| Tailwind CSS | 4.x | Styling |
| @tanstack/react-virtual | 3.x | Virtual scrolling for large lists |
| gray-matter | 4.x | YAML frontmatter parse |

---

## 2. Data Models

### 2.1 TypeScript Types (`src/types/memo.ts`)

```typescript
/** 메모 메타데이터 (frontmatter에서 파싱) */
export interface MemoMeta {
  id: string;            // UUID v4 (파일명에 사용)
  title: string;         // 메모 제목
  created: string;       // ISO 8601 datetime
  modified: string;      // ISO 8601 datetime
  pinned: boolean;       // 목록 상단 고정 여부
}

/** 메모 전체 데이터 */
export interface Memo {
  meta: MemoMeta;
  content: string;       // 마크다운 본문 (frontmatter 제외)
  filePath: string;      // 절대 파일 경로
}

/** 메모 목록 아이템 (사이드바용, content 미포함) */
export interface MemoListItem {
  id: string;
  title: string;
  modified: string;
  pinned: boolean;
  preview: string;       // 본문 첫 100자
}

/** 에디터 모드 */
export type EditorMode = "wysiwyg" | "source";

/** 윈도우 모드 */
export type WindowMode = "editor" | "sticky";

/** 테마 모드 */
export type ThemeMode = "light" | "dark" | "system";

/** 앱 설정 */
export interface AppConfig {
  currentDir: string;             // 현재 열린 폴더 경로
  recentDirs: string[];           // 최근 열었던 폴더 목록 (최대 10개)
  defaultDir: string;             // 앱 첫 실행 시 기본 폴더 (~/Documents/StickyMemo)
  autoSaveDelay: number;          // 자동 저장 debounce (ms), 기본 2000
  theme: ThemeMode;               // 테마 모드 (기본: "dark")
  fontFamily: string;             // 에디터 폰트 (기본: "Pretendard")
  fontSize: number;               // 에디터 폰트 크기 (기본: 14)
  editorWindowState: WindowState; // 에디터 모드 창 상태
  stickyWindowState: WindowState; // 스티키 모드 창 상태
}

/** 창 위치/크기 상태 */
export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### 2.2 .md File Format

```markdown
---
id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
title: "할일 목록"
created: "2026-03-10T14:30:00+09:00"
modified: "2026-03-10T15:00:00+09:00"
pinned: false
---

## 오늘 할 일

- [x] 프로젝트 설계
- [ ] 코드 작성
- [ ] 테스트
```

### 2.3 Folder-Based File Management (폴더 기반)

고정된 `memoDir` 없이, **현재 열린 폴더** 기반으로 동작한다.

```
┌─────────────────────────────────────────────────────────┐
│                    폴더 기반 동작                         │
│                                                         │
│  앱 시작 → 마지막으로 열었던 폴더(currentDir) 로드        │
│  첫 실행 → 기본 폴더(~/Documents/StickyMemo) 자동 생성   │
│                                                         │
│  사이드바 = 현재 폴더의 .md 파일 목록                     │
│  새 메모 = 현재 폴더에 .md 파일 생성                      │
│  폴더 전환 = 사이드바 목록이 해당 폴더로 교체              │
│                                                         │
│  .md 파일 드래그 앤 드롭 또는 더블클릭(OS 연결)           │
│    → 해당 파일의 폴더로 자동 전환                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**사이드바 구조:**

```
┌─ 사이드바 ──────────────────┐
│ 📂 D:\Notes  [▼]            │  ← 현재 폴더 (클릭 → 폴더 선택)
│ ┌────────────────────────┐  │
│ │ 🔍 검색...              │  │
│ └────────────────────────┘  │
│ ─── 고정된 메모 ─────────── │
│   📌 중요 할일              │
│ ─── 모든 메모 ──────────── │
│   프로젝트 노트             │
│   회의록                    │
│   아이디어                  │
│                             │
│ 📂 최근 폴더                │  ← 접을 수 있는 섹션
│   Documents\StickyMemo      │
│   D:\Projects\blog          │
│   C:\Work\notes             │
│                             │
│ [+ 새 메모]  [⚙ 설정]      │
└─────────────────────────────┘
```

**폴더 전환 방법:**
- 현재 폴더 클릭 `[📂 D:\Notes ▼]` → OS 폴더 선택 다이얼로그
- 최근 폴더 클릭 → 즉시 전환
- .md 파일 드래그 앤 드롭 → 해당 파일의 폴더로 전환 + 그 파일 열기
- OS에서 .md 파일 더블클릭 → 앱에서 해당 폴더로 전환 + 파일 열기

**최근 폴더 규칙:**
- 최대 10개 저장
- 가장 최근 사용 순으로 정렬
- 존재하지 않는 폴더는 자동 제거

### 2.4 .md File Handling (frontmatter 호환)

frontmatter가 없는 .md 파일도 정상적으로 불러올 수 있어야 한다.

```
[.md 파일 읽기]
    ↓
frontmatter "---" 블록 존재?
    ├── Yes → 파싱하여 MemoMeta 생성
    └── No  → 자동 보완:
              id: 파일명(확장자 제외)을 slug로 사용
              title: 파일명(확장자 제외) 또는 본문 첫 번째 # 제목
              created: 파일 시스템의 생성일(ctime)
              modified: 파일 시스템의 수정일(mtime)
              pinned: false
    ↓
[첫 저장 시]
    frontmatter가 없었던 파일 → frontmatter 자동 삽입
    (원본 내용은 보존, 상단에 --- 블록만 추가)
```

**규칙:**
- 파일명 유지: 기존 .md 파일은 원래 파일명을 유지한다 (UUID로 리네임하지 않음)
- 앱에서 새로 생성한 메모만 `{uuid}.md` 파일명 사용
- frontmatter 삽입은 사용자가 실제로 편집+저장할 때만 발생 (읽기만 할 때는 원본 보존)

### 2.5 settings.json Format

```json
{
  "currentDir": "D:\\Notes",
  "recentDirs": ["D:\\Notes", "C:\\Users\\USER\\Documents\\StickyMemo", "D:\\Projects\\blog"],
  "defaultDir": "C:\\Users\\USER\\Documents\\StickyMemo",
  "autoSaveDelay": 2000,
  "theme": "dark",
  "fontFamily": "Pretendard",
  "fontSize": 14,
  "editorWindowState": { "x": 100, "y": 100, "width": 900, "height": 700 },
  "stickyWindowState": { "x": 1200, "y": 100, "width": 350, "height": 400 }
}
```

---

## 3. Rust Backend Commands

### 3.1 Command Signatures (`src-tauri/src/commands/memo.rs`)

```rust
/// 지정 디렉토리의 .md 파일 목록 반환 (frontmatter만 파싱, 본문 첫 100자)
/// - 첫 호출: load_memos(dir, 50, 0) → 상위 50개 즉시 반환
/// - 이후: 스크롤 시 추가 로드 (무한 스크롤)
#[tauri::command]
async fn load_memos(dir: String, limit: usize, offset: usize) -> Result<MemoListResponse, String>
// MemoListResponse { items: Vec<MemoListItem>, total: usize, has_more: bool }

/// 특정 메모 파일 전체 읽기 (frontmatter + content)
#[tauri::command]
async fn read_memo(file_path: String) -> Result<Memo, String>

/// 메모 저장 (신규 생성 또는 기존 덮어쓰기)
/// - frontmatter 자동 생성/업데이트 (modified 갱신)
/// - 신규 시 UUID 생성 + 파일명: {uuid}.md
#[tauri::command]
async fn save_memo(dir: String, id: String, title: String,
                   content: String, pinned: bool) -> Result<String, String>

/// 메모 파일 삭제
#[tauri::command]
async fn delete_memo(file_path: String) -> Result<(), String>

/// 메모 내용 검색 (현재 폴더 내 제목 + 본문 텍스트 매칭)
#[tauri::command]
async fn search_memos(dir: String, query: String) -> Result<Vec<MemoListItem>, String>

/// .md 파일 경로로부터 부모 디렉토리 추출하여 폴더 전환
/// - 드래그 앤 드롭 또는 OS 파일 연결로 열 때 사용
/// - 해당 파일의 폴더로 currentDir 전환 + 파일 열기
#[tauri::command]
async fn open_file_and_switch_dir(file_path: String) -> Result<(String, Memo), String>
// 반환: (새 currentDir, 열린 Memo)
```

### 3.2 Command Signatures (`src-tauri/src/commands/config.rs`)

```rust
/// 설정 파일 읽기 (없으면 기본값 반환)
/// - settings.json은 앱 데이터 디렉토리에 저장 (폴더 독립)
#[tauri::command]
async fn get_config() -> Result<AppConfig, String>

/// 설정 파일 저장
#[tauri::command]
async fn set_config(config: AppConfig) -> Result<(), String>

/// 디렉토리 선택 다이얼로그 열기 (폴더 전환용)
#[tauri::command]
async fn pick_directory() -> Result<Option<String>, String>
```

### 3.3 Window Management (`src-tauri/src/commands/window.rs`)

```rust
/// Always on Top 토글
#[tauri::command]
async fn set_always_on_top(window: tauri::Window, enabled: bool) -> Result<(), String>

/// 창 크기/위치 변경
#[tauri::command]
async fn set_window_state(window: tauri::Window,
                          x: f64, y: f64, width: f64, height: f64) -> Result<(), String>

/// 현재 창 크기/위치 가져오기
#[tauri::command]
async fn get_window_state(window: tauri::Window) -> Result<WindowState, String>

/// 장식(decoration) 토글 — 스티키 모드에서 타이틀바 제거용
#[tauri::command]
async fn set_decorations(window: tauri::Window, enabled: bool) -> Result<(), String>
```

### 3.4 Frontmatter Parsing (Rust)

```rust
// Cargo.toml 의존성
// serde_yaml = "0.9"
// uuid = { version = "1", features = ["v4"] }

struct FrontmatterParser;

impl FrontmatterParser {
    /// "---\n...\n---\n본문" 형태에서 (meta, content) 분리
    fn parse(raw: &str) -> Result<(MemoMeta, String), Error>

    /// MemoMeta + content를 frontmatter 포함 마크다운으로 직렬화
    fn serialize(meta: &MemoMeta, content: &str) -> String
}
```

---

## 4. Frontend Component Design

### 4.1 Component Tree

```
App.tsx
├── TitleBar.tsx                  ← 커스텀 타이틀바 (핀, 모드 전환, 창 컨트롤)
├── Sidebar.tsx                   ← 숨김 가능 사이드바
│   ├── SearchBar.tsx             ← 검색 입력
│   ├── MemoList.tsx              ← 메모 목록 (@tanstack/react-virtual 가상 스크롤)
│   │   └── MemoItem.tsx          ← 개별 메모 항목 (64px 고정 높이)
│   └── SidebarFooter.tsx         ← 새 메모 버튼, 설정
└── EditorArea.tsx                ← 편집 영역 컨테이너
    ├── MilkdownEditor.tsx        ← WYSIWYG 모드 (기본)
    │   └── SlashMenu.tsx         ← 슬래시 커맨드 드롭다운
    ├── SourceEditor.tsx          ← 소스 모드 (CodeMirror)
    └── EditorToolbar.tsx         ← WYSIWYG/소스 모드 전환 토글
```

### 4.2 TitleBar.tsx

커스텀 타이틀바. Tauri의 `decorations: false` 설정으로 OS 타이틀바를 제거하고 직접 구현.

```
에디터 모드:
┌──────────────────────────────────────────────────┐
│ [☰] [📌]  Sticky Memo - {메모 제목}   [─][□][✕] │
└──────────────────────────────────────────────────┘

스티키 모드:
┌──────────────────────────┐
│ [📌]  {메모 제목}    [✕] │  ← 드래그로 이동 가능
└──────────────────────────┘
```

| Element | Action |
|---------|--------|
| `[☰]` 햄버거 | 사이드바 토글 (에디터 모드에서만 표시) |
| `[📌]` 핀 | 스티키/에디터 모드 전환 |
| `[─]` 최소화 | 창 최소화 (에디터 모드에서만) |
| `[□]` 최대화 | 창 최대화 토글 (에디터 모드에서만) |
| `[✕]` 닫기 | 앱 종료 |
| 타이틀 영역 | `data-tauri-drag-region` — 드래그로 창 이동 |

**Props:**
```typescript
interface TitleBarProps {
  windowMode: WindowMode;
  memoTitle: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onTogglePin: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}
```

### 4.3 Sidebar.tsx

슬라이드 인/아웃 방식의 사이드바. 에디터 모드에서만 접근 가능.

```
┌─ Sidebar (280px) ────────┐
│ ┌──────────────────────┐ │
│ │ 🔍 메모 검색...       │ │  ← SearchBar
│ └──────────────────────┘ │
│ ─── 고정된 메모 ──────── │
│ ┌──────────────────────┐ │
│ │ 📌 중요 할일          │ │  ← pinned: true
│ │    3분 전 수정        │ │
│ └──────────────────────┘ │
│ ─── 모든 메모 ────────── │
│ ┌──────────────────────┐ │
│ │ 프로젝트 노트         │ │
│ │   오늘 14:30         │ │
│ ├──────────────────────┤ │
│ │ 회의록               │ │
│ │   어제               │ │
│ └──────────────────────┘ │
│                          │
│ [+ 새 메모]   [⚙ 설정]  │  ← SidebarFooter
└──────────────────────────┘
```

**동작:**
- 에디터 모드: 햄버거 `[☰]` 클릭 또는 `Ctrl+B`로 토글
- 스티키 모드: 자동 숨김 (표시 불가)
- 메모 목록: `modified` 기준 내림차순, `pinned: true` 항목 상단 분리
- 메모 클릭: 해당 메모 로드 → 에디터에 표시
- 메모 우클릭: 컨텍스트 메뉴 (삭제, 고정/해제)

### 4.4 MilkdownEditor.tsx (WYSIWYG 모드)

Milkdown 7 기반 WYSIWYG 편집기. 핵심 컴포넌트.

**Milkdown 플러그인 구성:**

```typescript
import { Editor, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { slash } from "@milkdown/kit/plugin/slash";
import { indent } from "@milkdown/kit/plugin/indent";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { upload } from "@milkdown/kit/plugin/upload";

// Editor 초기화
Editor.make()
  .config((ctx) => {
    ctx.set(rootCtx, editorRef.current);
    ctx.get(listenerCtx)
      .markdownUpdated((ctx, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown) {
          onContentChange(markdown);  // → auto-save trigger
        }
      });
  })
  .use(commonmark)      // 기본 마크다운 (heading, list, code, etc.)
  .use(gfm)             // GFM 확장 (table, strikethrough, task list)
  .use(history)          // Ctrl+Z / Ctrl+Y
  .use(clipboard)        // 복사/붙여넣기
  .use(cursor)           // 커서 표시
  .use(listener)         // 변경 감지
  .use(slash)            // 슬래시 커맨드
  .use(indent)           // 들여쓰기
  .use(trailing)         // 마지막 줄 뒤 빈 줄 보장
  .create();
```

**인라인 마크다운 단축키:**

Milkdown의 commonmark 프리셋에 InputRule이 내장되어 있어 별도 구현 불필요:
- `# ` → Heading 1 (commonmark 내장)
- `## ` → Heading 2 (commonmark 내장)
- `### ` → Heading 3 (commonmark 내장)
- `- ` / `* ` → Bullet list (commonmark 내장)
- `1. ` → Ordered list (commonmark 내장)
- `> ` → Blockquote (commonmark 내장)
- `` ``` `` → Code block (commonmark 내장)
- `---` → Horizontal rule (commonmark 내장)
- `- [ ] ` → Task list checkbox (gfm 내장)
- `**text**` → Bold (commonmark 내장)
- `*text*` → Italic (commonmark 내장)
- `` `text` `` → Inline code (commonmark 내장)
- `~~text~~` → Strikethrough (gfm 내장)

> Plan의 FR-12 요구사항은 Milkdown commonmark + gfm 프리셋으로 100% 충족.

### 4.5 SlashMenu.tsx (슬래시 커맨드)

Milkdown의 `@milkdown/kit/plugin/slash` 플러그인 기반 커스텀 UI.

**슬래시 커맨드 정의:**

```typescript
interface SlashItem {
  key: string;           // 고유 키
  label: string;         // 표시 이름 (한글)
  labelEn: string;       // 표시 이름 (영문)
  keywords: string[];    // 검색 키워드 (한글+영문)
  icon: string;          // 아이콘
  action: (ctx: Ctx) => void;  // 실행 액션
}

const slashItems: SlashItem[] = [
  {
    key: "h1",
    label: "제목 1",
    labelEn: "Heading 1",
    keywords: ["h1", "제목1", "heading", "제목"],
    icon: "H1",
    action: (ctx) => {
      // ProseMirror command: setBlockType → heading level 1
    }
  },
  {
    key: "h2",
    label: "제목 2",
    labelEn: "Heading 2",
    keywords: ["h2", "제목2", "heading"],
    icon: "H2",
    action: (ctx) => { /* heading level 2 */ }
  },
  {
    key: "h3",
    label: "제목 3",
    labelEn: "Heading 3",
    keywords: ["h3", "제목3", "heading"],
    icon: "H3",
    action: (ctx) => { /* heading level 3 */ }
  },
  {
    key: "bullet",
    label: "글머리 기호 목록",
    labelEn: "Bullet List",
    keywords: ["bullet", "리스트", "목록", "list", "ul"],
    icon: "•",
    action: (ctx) => { /* wrapIn bulletList */ }
  },
  {
    key: "numbered",
    label: "번호 매기기 목록",
    labelEn: "Numbered List",
    keywords: ["numbered", "번호", "숫자", "ol", "ordered"],
    icon: "1.",
    action: (ctx) => { /* wrapIn orderedList */ }
  },
  {
    key: "todo",
    label: "체크리스트",
    labelEn: "To-do List",
    keywords: ["todo", "체크", "할일", "task", "checkbox"],
    icon: "☐",
    action: (ctx) => { /* wrapIn taskList */ }
  },
  {
    key: "code",
    label: "코드 블록",
    labelEn: "Code Block",
    keywords: ["code", "코드", "소스", "source"],
    icon: "</>",
    action: (ctx) => { /* setBlockType codeBlock */ }
  },
  {
    key: "quote",
    label: "인용",
    labelEn: "Quote",
    keywords: ["quote", "인용", "blockquote"],
    icon: "❝",
    action: (ctx) => { /* wrapIn blockquote */ }
  },
  {
    key: "divider",
    label: "구분선",
    labelEn: "Divider",
    keywords: ["divider", "구분선", "hr", "line", "horizontal"],
    icon: "─",
    action: (ctx) => { /* insert horizontalRule */ }
  },
  {
    key: "bold",
    label: "굵게",
    labelEn: "Bold",
    keywords: ["bold", "굵게", "진하게", "strong"],
    icon: "B",
    action: (ctx) => { /* toggleMark strong */ }
  },
  {
    key: "italic",
    label: "기울임",
    labelEn: "Italic",
    keywords: ["italic", "기울임", "이탤릭", "em"],
    icon: "I",
    action: (ctx) => { /* toggleMark emphasis */ }
  },
  {
    key: "link",
    label: "링크",
    labelEn: "Link",
    keywords: ["link", "링크", "url", "href"],
    icon: "🔗",
    action: (ctx) => { /* insert link template */ }
  },
  {
    key: "image",
    label: "이미지",
    labelEn: "Image",
    keywords: ["image", "이미지", "사진", "img"],
    icon: "🖼",
    action: (ctx) => { /* insert image template */ }
  },
  {
    key: "table",
    label: "표",
    labelEn: "Table",
    keywords: ["table", "표", "테이블"],
    icon: "⊞",
    action: (ctx) => { /* insert 2x2 table */ }
  },
];
```

**SlashMenu UI 동작:**

```
사용자: "/" 입력
    ↓
┌─ Slash Menu ────────────────┐
│ 🔍 /                        │  ← 필터 입력
│ ┌──────────────────────────┐│
│ │ H1  제목 1    Heading 1  ││
│ │ H2  제목 2    Heading 2  ││  ← 최대 10개 표시
│ │ H3  제목 3    Heading 3  ││
│ │ •   글머리 기호 목록      ││  ← ↑↓ 키로 선택
│ │ 1.  번호 매기기 목록      ││  ← Enter로 확정
│ │ ☐   체크리스트            ││  ← ESC로 닫기
│ │ </> 코드 블록             ││
│ │ ❝   인용                  ││
│ │ ─   구분선                ││
│ │ B   굵게                  ││
│ └──────────────────────────┘│
└─────────────────────────────┘

사용자: "/제" 입력 (필터링)
    ↓
┌─ Slash Menu ────────────────┐
│ 🔍 /제                      │
│ ┌──────────────────────────┐│
│ │ H1  제목 1    Heading 1  ││  ← "제" 매칭
│ │ H2  제목 2    Heading 2  ││
│ │ H3  제목 3    Heading 3  ││
│ └──────────────────────────┘│
└─────────────────────────────┘
```

- 위치: 커서 바로 아래에 떠있는 드롭다운 (absolute positioning)
- 크기: 너비 280px, 최대 높이 360px (스크롤)
- 필터: `keywords` 배열에서 입력 문자열 포함 여부로 필터링

### 4.6 SourceEditor.tsx (소스 모드)

CodeMirror 6 기반 원본 마크다운 텍스트 편집기.

```typescript
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

// 초기화
const view = new EditorView({
  doc: markdownContent,
  extensions: [
    basicSetup,
    markdown(),
    oneDark,                    // 다크 테마 (추후 테마 전환 시 변경)
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onContentChange(update.state.doc.toString());
      }
    }),
  ],
  parent: editorRef.current,
});
```

### 4.7 EditorToolbar.tsx

에디터 영역 우측 상단에 위치. 모드 전환 + 클립보드 복사 버튼.

```
┌──────────────────────────────────────┐
│                   [📋] [WYSIWYG|소스] │  ← 복사 + 모드 전환
│                                      │
│          편집 영역                    │
│                                      │
└──────────────────────────────────────┘
```

| Element | Action |
|---------|--------|
| `[📋]` 클립보드 복사 | 현재 메모 전체 내용을 클립보드에 복사 (마크다운 원본) |
| `[WYSIWYG\|소스]` 토글 | 에디터 모드 전환 |

**클립보드 복사 동작:**
```typescript
async function copyToClipboard() {
  const { activeContent } = useMemoStore.getState();
  await navigator.clipboard.writeText(activeContent);
  // 복사 완료 → 아이콘 ✅ 로 1.5초간 변경 후 원복
  setCopied(true);
  setTimeout(() => setCopied(false), 1500);
}
```

- 단축키: `Ctrl+Shift+C` (전체 메모 복사)
- 복사 성공 시: `📋` → `✅` 아이콘 1.5초간 표시
- 복사 대상: WYSIWYG 모드에서도 마크다운 원본 텍스트 복사

**모드 전환:**
- 단축키: `Ctrl+Shift+M`
- 전환 시 데이터 동기화:
  - WYSIWYG → 소스: `Milkdown.getMarkdown()` → CodeMirror에 설정
  - 소스 → WYSIWYG: `CodeMirror.state.doc.toString()` → Milkdown에 설정

---

## 5. State Management

### 5.1 memoStore (Zustand)

```typescript
// src/stores/memoStore.ts
import { create } from "zustand";

interface MemoState {
  // Data
  currentDir: string;            // 현재 열린 폴더 경로
  recentDirs: string[];          // 최근 폴더 목록
  memos: MemoListItem[];         // 현재 폴더의 메모 목록
  activeMemoId: string | null;   // 현재 선택된 메모 ID
  activeContent: string;         // 현재 편집 중인 마크다운 내용
  isDirty: boolean;              // 미저장 변경 있음
  isLoading: boolean;            // 목록 로딩 중
  loadError: string | null;      // 로딩 에러 메시지
  _loadAbort: AbortController | null; // 폴더 전환 시 이전 요청 취소용

  // UI State
  editorMode: EditorMode;        // "wysiwyg" | "source"
  windowMode: WindowMode;        // "editor" | "sticky"
  sidebarOpen: boolean;          // 사이드바 열림 여부
  searchQuery: string;           // 검색어

  // Actions — 폴더
  switchDir: (dir: string) => void;       // 폴더 전환 → 이전 요청 abort → load_memos 재호출
  openFileAndSwitch: (path: string) => void; // 파일 열기 → 해당 폴더로 전환

  // Actions — 메모
  setMemos: (memos: MemoListItem[]) => void;
  setActiveMemo: (id: string) => void;
  setActiveContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  createNewMemo: () => void;
  deleteMemo: (id: string) => void;
  togglePin: (id: string) => void;

  // Actions — UI
  setEditorMode: (mode: EditorMode) => void;
  setWindowMode: (mode: WindowMode) => void;
  toggleSidebar: () => void;
  setSearchQuery: (query: string) => void;
}
```

### 5.2 State Flow

```
[앱 시작]
    ↓
get_config() → currentDir 복원 (없으면 defaultDir)
    ↓
load_memos(currentDir) → memos 세팅
    ↓
[메모 클릭] → setActiveMemo(id) → read_memo(path) → setActiveContent(md)
    ↓
[편집] → setActiveContent(md) + setDirty(true)
    ↓
[2초 debounce] → save_memo() → setDirty(false) + memos 목록 갱신
    ↓
[폴더 전환] → switchDir(newDir) → _loadAbort.abort() (이전 요청 취소)
                               → isLoading=true → load_memos(newDir, 50, 0)
                               → memos 교체 + isLoading=false
                               + recentDirs 업데이트
                               + set_config() 저장
                               → 실패 시 loadError 설정, 이전 memos 유지
    ↓
[파일 드롭/.md 더블클릭] → openFileAndSwitch(path)
                          → 부모 폴더 추출 → switchDir(parentDir)
                          → setActiveMemo(해당 파일)
    ↓
[핀 클릭] → setWindowMode("sticky") → set_always_on_top(true)
                                      + set_window_state(stickyState)
                                      + setSidebarOpen(false)
    ↓
[핀 해제] → setWindowMode("editor") → set_always_on_top(false)
                                      + set_window_state(editorState)
```

---

## 6. Auto-Save Mechanism

### 6.1 useAutoSave Hook

```typescript
// src/hooks/useAutoSave.ts
export function useAutoSave(content: string, delay: number = 2000) {
  const timeoutRef = useRef<number | null>(null);
  const { activeMemoId, setDirty } = useMemoStore();

  useEffect(() => {
    if (!activeMemoId) return;

    setDirty(true);

    // 이전 타이머 클리어
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // 새 타이머 설정
    timeoutRef.current = window.setTimeout(async () => {
      await invoke("save_memo", {
        memoDir: config.memoDir,
        id: activeMemoId,
        title: extractTitle(content),
        content: content,
        pinned: currentMemo.pinned,
      });
      setDirty(false);
    }, delay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [content, activeMemoId, delay]);
}
```

### 6.2 Auto-Save 상태 표시

타이틀바 또는 에디터 하단에 저장 상태 표시:

| State | Display |
|-------|---------|
| 편집 중 (dirty) | `편집 중...` |
| 저장 중 | `저장 중...` |
| 저장 완료 | `저장됨` (2초 후 사라짐) |
| 저장 실패 | `저장 실패 ⚠` (빨간색, 유지) |

---

## 7. Window Mode Management

### 7.1 Mode Transition Logic

```typescript
// src/hooks/useWindowMode.ts
async function toggleWindowMode() {
  const { windowMode, setWindowMode } = useMemoStore.getState();

  if (windowMode === "editor") {
    // 에디터 → 스티키
    const currentState = await invoke("get_window_state");
    await invoke("set_config", { editorWindowState: currentState });

    const stickyState = config.stickyWindowState;
    await invoke("set_always_on_top", { enabled: true });
    await invoke("set_window_state", stickyState);
    setWindowMode("sticky");
    setSidebarOpen(false);
  } else {
    // 스티키 → 에디터
    const currentState = await invoke("get_window_state");
    await invoke("set_config", { stickyWindowState: currentState });

    const editorState = config.editorWindowState;
    await invoke("set_always_on_top", { enabled: false });
    await invoke("set_window_state", editorState);
    setWindowMode("editor");
  }
}
```

### 7.2 Window Defaults

| Property | Editor Mode | Sticky Mode |
|----------|-------------|-------------|
| Size | 900 x 700 | 350 x 400 |
| Min Size | 600 x 400 | 280 x 200 |
| Always on Top | false | true |
| Resizable | true | true |
| Sidebar | 토글 가능 | 숨김 |
| TitleBar | 풀 (햄버거, 핀, 최소/최대/닫기) | 컴팩트 (핀, 닫기) |

---

## 8. Tauri Configuration

### 8.1 tauri.conf.json (핵심 부분)

```json
{
  "productName": "Sticky Memo",
  "version": "1.0.0",
  "identifier": "com.stickymemo.app",
  "build": {
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Sticky Memo",
        "width": 900,
        "height": 700,
        "minWidth": 280,
        "minHeight": 200,
        "decorations": false,
        "transparent": false,
        "resizable": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "icon": ["icons/icon.ico"],
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "languages": ["Korean", "English"],
        "displayLanguageSelector": false
      }
    }
  }
}
```

### 8.2 Permissions (`capabilities/default.json`)

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-size",
    "core:window:allow-set-position",
    "core:window:allow-set-decorations",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-close",
    "core:window:allow-start-dragging",
    "dialog:allow-open",
    "fs:allow-read",
    "fs:allow-write",
    "fs:allow-exists",
    "fs:allow-remove"
  ]
}
```

---

## 9. Keyboard Shortcuts

| Shortcut | Action | Scope |
|----------|--------|-------|
| `Ctrl+N` | 새 메모 생성 | Global |
| `Ctrl+B` | 사이드바 토글 | Editor mode |
| `Ctrl+Shift+M` | WYSIWYG ↔ 소스 모드 전환 | Editor area |
| `Ctrl+Shift+C` | 메모 전체 클립보드 복사 | Editor area |
| `Ctrl+S` | 강제 저장 (즉시) | Editor area |
| `Ctrl+Z` | 실행 취소 | Editor area |
| `Ctrl+Shift+Z` | 다시 실행 | Editor area |
| `Ctrl+F` | 메모 내 검색 (향후) | Editor area |
| `Escape` | 슬래시 메뉴 닫기 / 스티키 모드에서 핀 해제 | Context |

---

## 10. Styling Guide

### 10.1 Color Palette (Dark / Light Theme)

테마는 `<html data-theme="dark|light">` 속성으로 전환. `system` 모드는 `prefers-color-scheme` 미디어 쿼리 감지.

```css
/* Dark Theme (기본) — Catppuccin Mocha */
[data-theme="dark"] {
  --bg-primary: #1e1e2e;
  --bg-secondary: #181825;
  --bg-titlebar: #11111b;
  --bg-hover: #313244;
  --bg-active: #45475a;

  --text-primary: #cdd6f4;
  --text-secondary: #a6adc8;
  --text-muted: #6c7086;

  --accent-primary: #89b4fa;
  --accent-pin: #f9e2af;
  --accent-danger: #f38ba8;
  --accent-success: #a6e3a1;

  --border-subtle: #313244;
}

/* Light Theme — Catppuccin Latte */
[data-theme="light"] {
  --bg-primary: #eff1f5;
  --bg-secondary: #e6e9ef;
  --bg-titlebar: #dce0e8;
  --bg-hover: #ccd0da;
  --bg-active: #bcc0cc;

  --text-primary: #4c4f69;
  --text-secondary: #5c5f77;
  --text-muted: #9ca0b0;

  --accent-primary: #1e66f5;
  --accent-pin: #df8e1d;
  --accent-danger: #d20f39;
  --accent-success: #40a02b;

  --border-subtle: #ccd0da;
}
```

**테마 전환 로직:**
```typescript
function applyTheme(mode: ThemeMode) {
  if (mode === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
  } else {
    document.documentElement.dataset.theme = mode;
  }
}
```

### 10.2 Typography & Font Selection

```css
:root {
  --font-sans: var(--user-font, "Pretendard"), -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "D2Coding", Consolas, monospace;
  --font-size-sm: 0.8125rem;   /* 13px — 목록, 메타 정보 */
  --font-size-base: 0.875rem;  /* 14px — 에디터 본문 */
  --font-size-lg: 1rem;        /* 16px — 제목 */
}
```

**사용자 폰트 선택 (설정 다이얼로그):**

```
┌─ 설정 ───────────────────────────────┐
│ 테마                                  │
│   [● 다크] [○ 라이트] [○ 시스템]     │
│                                       │
│ 에디터 폰트                           │
│   [▼ Pretendard          ]            │  ← 드롭다운
│   내장 폰트:                          │
│   - Pretendard (기본)                 │
│   - Noto Sans KR                      │
│   - D2Coding                          │
│   - 시스템 기본 폰트                   │
│                                       │
│ 폰트 크기                             │
│   [─────●─────] 14px                  │  ← 슬라이더 (12~20px)
│                                       │
│ 자동 저장 간격                         │
│   [▼ 2초 ]                            │
│                                       │
│           [취소]  [저장]               │
└───────────────────────────────────────┘
```

**폰트 적용:**
```typescript
function applyFont(fontFamily: string, fontSize: number) {
  document.documentElement.style.setProperty("--user-font", `"${fontFamily}"`);
  document.documentElement.style.setProperty("--font-size-base", `${fontSize}px`);
}
```

### 10.3 Layout Dimensions

| Element | Size |
|---------|------|
| TitleBar 높이 | 36px |
| Sidebar 너비 | 280px |
| Sidebar 최소 너비 | 200px |
| 에디터 패딩 | 24px 32px |
| SlashMenu 너비 | 280px |
| SlashMenu 최대 높이 | 360px |
| MemoItem 높이 | 64px |

---

## 11. Installer & Distribution

### 11.1 Build Targets

| Target | Format | Description |
|--------|--------|-------------|
| NSIS | `.exe` | 사용자 권한 설치 (기본), 다국어 지원 |
| MSI | `.msi` | 관리자 배포용 (그룹 정책 배포 가능) |

### 11.2 Install/Uninstall Flow

```
설치:
  StickyMemo-Setup-1.0.0.exe 실행
    → 설치 경로 선택 (기본: C:\Users\{USER}\AppData\Local\StickyMemo)
    → 바탕화면 바로가기 생성 (선택)
    → 시작 메뉴 등록
    → 완료

삭제:
  Windows 설정 → 앱 → "Sticky Memo" 검색 → 제거
    → 앱 파일 삭제
    → 바로가기 제거
    → 레지스트리 정리
    → 메모 데이터(~/Documents/StickyMemo)는 보존 (삭제 안 함)
```

### 11.3 Expected Bundle Size

| Component | Size |
|-----------|------|
| Tauri runtime | ~3MB |
| Frontend (React + Milkdown + CodeMirror) | ~2MB |
| Rust binary | ~1MB |
| **Total installer** | **~6MB** (목표 10MB 이내 충족) |

---

## 12. Implementation Order (with Dependencies)

```
Phase 1: 프로젝트 기초
├── 1.1 Tauri + React + Vite + TS 프로젝트 초기화
├── 1.2 Tailwind CSS 설정
├── 1.3 TypeScript 타입 정의 (types/memo.ts)
└── 1.4 tauri.conf.json 설정 (decorations: false, permissions)

Phase 2: Rust 백엔드
├── 2.1 Frontmatter 파서 구현 (parse/serialize)
├── 2.2 memo commands (load_memos, read_memo, save_memo, delete_memo, search_memos)
├── 2.3 config commands (get_config, set_config, pick_directory)
└── 2.4 window commands (set_always_on_top, set_window_state, set_decorations)

Phase 3: 상태 관리 + 레이아웃
├── 3.1 Zustand memoStore 구현
├── 3.2 App.tsx 레이아웃 (TitleBar + Sidebar + EditorArea)
└── 3.3 커스텀 TitleBar 구현 (드래그, 창 컨트롤)

Phase 4: 에디터 핵심
├── 4.1 MilkdownEditor 기본 구현 (commonmark + gfm + 기본 플러그인)
│        → 인라인 마크다운 단축키 자동 지원 (FR-12)
├── 4.2 SlashMenu 커스텀 UI + 14종 커맨드 등록 (FR-11)
├── 4.3 SourceEditor (CodeMirror) 구현
├── 4.4 EditorToolbar (WYSIWYG ↔ 소스 모드 전환)
└── 4.5 Milkdown ↔ CodeMirror 데이터 동기화

Phase 5: 사이드바 + CRUD
├── 5.1 Sidebar 컴포넌트 (열기/닫기 애니메이션)
├── 5.2 SearchBar 구현
├── 5.3 MemoList + MemoItem (목록 표시, 정렬, 핀 분리)
├── 5.4 새 메모 생성 플로우
├── 5.5 메모 삭제 (확인 다이얼로그)
└── 5.6 메모 고정(Pin) 토글

Phase 6: Auto-save + 윈도우 모드
├── 6.1 useAutoSave 훅 구현 (2초 debounce)
├── 6.2 저장 상태 표시 (편집 중/저장 중/저장됨)
├── 6.3 스티키 모드 전환 (핀 버튼 → Always on Top + 컴팩트 UI)
├── 6.4 에디터 모드 전환 (핀 해제 → 일반 창 + 사이드바)
└── 6.5 모드별 창 위치/크기 기억

Phase 7: 마무리
├── 7.1 검색 기능 연동 (Rust search_memos ↔ Sidebar)
├── 7.2 설정 화면 (저장 경로 변경)
├── 7.3 키보드 단축키 바인딩
├── 7.4 NSIS/MSI 인스톨러 빌드 설정
└── 7.5 아이콘 + 빌드 테스트
```

---

## 13. Performance & Stability (1000+ 파일 대응)

### 13.1 Virtual Scrolling (MemoList)

1000개 이상의 메모에서도 사이드바가 버벅이지 않도록 `@tanstack/react-virtual`로 가상 스크롤 적용.

```typescript
// src/components/Sidebar/MemoList.tsx
import { useVirtualizer } from "@tanstack/react-virtual";

function MemoList({ memos }: { memos: MemoListItem[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: memos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,  // MemoItem 높이 64px 고정
    overscan: 5,             // 화면 밖 위아래 5개씩 미리 렌더
  });

  return (
    <div ref={parentRef} style={{ overflow: "auto", height: "100%" }}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <MemoItem
            key={memos[virtualRow.index].id}
            memo={memos[virtualRow.index]}
            style={{
              position: "absolute",
              top: virtualRow.start,
              height: virtualRow.size,
              width: "100%",
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

**효과:**
- DOM 노드: 1000개 → ~30개 (화면 표시 20 + overscan 10)
- React reconciliation: O(1000) → O(30)
- 메모리: ~10MB → ~0.5MB (VDOM)

### 13.2 Pagination & Progressive Loading

Rust 백엔드에서 페이지네이션 지원:

```rust
#[derive(Serialize)]
struct MemoListResponse {
    items: Vec<MemoListItem>,
    total: usize,      // 폴더 내 전체 .md 파일 수
    has_more: bool,     // 추가 로드 가능 여부
}

/// 디렉토리 스캔 시 정렬된 파일 목록에서 limit/offset으로 슬라이싱
async fn load_memos(dir: String, limit: usize, offset: usize) -> Result<MemoListResponse, String> {
    let mut entries: Vec<_> = fs::read_dir(&dir)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
        .collect();

    // modified 기준 내림차순 정렬 (최신 먼저)
    entries.sort_by(|a, b| b.metadata().modified().cmp(&a.metadata().modified()));

    let total = entries.len();
    let items: Vec<MemoListItem> = entries
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|e| parse_list_item(&e.path()))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(MemoListResponse {
        has_more: offset + items.len() < total,
        items,
        total,
    })
}
```

**프론트엔드 무한 스크롤:**
- 초기 로드: `load_memos(dir, 50, 0)` → 50개 즉시 표시
- 스크롤 끝 도달 시: `load_memos(dir, 50, 50)` → 추가 50개 append
- 가상 스크롤과 결합하여 DOM은 항상 ~30개만 유지

### 13.3 Request Queue & Cancellation

빠른 폴더 전환 시 레이스 컨디션 방지:

```typescript
// memoStore 내부
switchDir: async (dir: string) => {
  const state = get();

  // 1. 이전 요청 취소
  if (state._loadAbort) {
    state._loadAbort.abort();
  }

  // 2. 새 AbortController 생성
  const abort = new AbortController();
  set({ _loadAbort: abort, isLoading: true, loadError: null });

  try {
    const res = await invoke("load_memos", { dir, limit: 50, offset: 0 });

    // 3. abort 되었으면 결과 무시
    if (abort.signal.aborted) return;

    set({
      currentDir: dir,
      memos: res.items,
      isLoading: false,
      _loadAbort: null,
    });
  } catch (err) {
    if (abort.signal.aborted) return;
    set({ loadError: String(err), isLoading: false });
  }
},
```

### 13.4 React Error Boundary

렌더링 에러가 앱 전체를 뻗게 하지 않도록 Error Boundary 적용:

```typescript
// src/components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// App.tsx에서 적용
<ErrorBoundary fallback={<SidebarErrorFallback />}>
  <Sidebar />
</ErrorBoundary>
<ErrorBoundary fallback={<EditorErrorFallback />}>
  <EditorArea />
</ErrorBoundary>
```

**적용 위치:**
- `<Sidebar>` — 목록 로딩 실패 시 "다시 시도" 버튼 표시
- `<EditorArea>` — 에디터 크래시 시 "메모 다시 열기" 표시
- 전체 앱은 죽지 않음

### 13.5 File Watching (외부 변경 감지)

`notify` crate로 현재 폴더의 .md 파일 변경을 실시간 감지:

```rust
// Cargo.toml 추가
// notify = "6"

use notify::{Watcher, RecursiveMode, Event, EventKind};

/// 현재 디렉토리 파일 변경 감시 시작
#[tauri::command]
async fn watch_dir(window: tauri::Window, dir: String) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx)
        .map_err(|e| e.to_string())?;

    watcher.watch(Path::new(&dir), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    // 파일 변경 이벤트를 프론트엔드로 전달
    std::thread::spawn(move || {
        for event in rx {
            if let Ok(Event { kind: EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_), paths, .. }) = event {
                let md_paths: Vec<_> = paths.iter()
                    .filter(|p| p.extension().map_or(false, |e| e == "md"))
                    .collect();
                if !md_paths.is_empty() {
                    let _ = window.emit("fs-change", &md_paths);
                }
            }
        }
    });

    Ok(())
}
```

**프론트엔드 처리:**
```typescript
// 파일 변경 이벤트 수신
listen("fs-change", (event) => {
  // 현재 열린 메모가 외부에서 변경됨 → 리로드 확인
  if (event.payload.includes(activeMemoPath)) {
    showConflictDialog("외부에서 수정되었습니다. 다시 불러올까요?");
  }
  // 목록 갱신
  refreshMemoList();
});
```

### 13.6 LRU Cache (메모 내용 캐싱)

반복적으로 같은 메모를 열 때 디스크 I/O 방지:

```rust
use std::collections::HashMap;
use std::sync::Mutex;

struct MemoCache {
    entries: Mutex<HashMap<String, (Memo, std::time::SystemTime)>>, // path → (memo, file_mtime)
    max_size: usize, // 최대 캐시 항목 (기본 50)
}

impl MemoCache {
    fn get(&self, path: &str) -> Option<Memo> {
        let entries = self.entries.lock().unwrap();
        if let Some((memo, cached_mtime)) = entries.get(path) {
            // 파일 mtime 비교 → 변경됐으면 캐시 무효화
            let current_mtime = fs::metadata(path).ok()?.modified().ok()?;
            if current_mtime == *cached_mtime {
                return Some(memo.clone());
            }
        }
        None
    }
}
```

### 13.7 Performance Targets

| Scenario | Target | Strategy |
|----------|--------|----------|
| 폴더 열기 (100개) | < 500ms | 페이지네이션 불필요, 전체 로드 |
| 폴더 열기 (1000개) | < 1s (첫 50개) | `load_memos(dir, 50, 0)` 점진 로드 |
| 사이드바 스크롤 (1000개) | 60fps | 가상 스크롤, DOM ~30개 |
| 폴더 빠른 전환 (연타) | 마지막 요청만 처리 | AbortController 취소 |
| 메모 열기 (캐시 히트) | < 10ms | LRU 캐시 |
| 메모 열기 (캐시 미스) | < 100ms | 단일 파일 async 읽기 |
| 메모리 (1000개 목록) | < 5MB | 가상 스크롤 + 내용 lazy load |
| 외부 편집 감지 | < 2s | notify watcher |

---

## 14. File Structure (Final)

```
C:\Projects\Memo\
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── memo.rs              # 메모 CRUD + 검색
│   │   │   ├── config.rs            # 설정 읽기/쓰기
│   │   │   └── window.rs            # 창 모드 제어
│   │   └── parser/
│   │       ├── mod.rs
│   │       └── frontmatter.rs       # YAML frontmatter 파싱
│   ├── capabilities/
│   │   └── default.json             # 권한 설정
│   ├── icons/
│   │   └── icon.ico
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── App.tsx                      # 루트 레이아웃
│   ├── main.tsx                     # 엔트리포인트
│   ├── components/
│   │   ├── TitleBar/
│   │   │   └── TitleBar.tsx
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   ├── MemoList.tsx
│   │   │   ├── MemoItem.tsx
│   │   │   └── SidebarFooter.tsx
│   │   ├── Editor/
│   │   │   ├── EditorArea.tsx       # 에디터 컨테이너
│   │   │   ├── MilkdownEditor.tsx   # WYSIWYG
│   │   │   ├── SlashMenu.tsx        # 슬래시 커맨드 UI
│   │   │   ├── SourceEditor.tsx     # CodeMirror
│   │   │   └── EditorToolbar.tsx    # 모드 전환 토글
│   │   └── Settings/
│   │       └── SettingsDialog.tsx   # 설정 다이얼로그
│   ├── stores/
│   │   └── memoStore.ts
│   ├── hooks/
│   │   ├── useAutoSave.ts
│   │   ├── useMemos.ts
│   │   └── useWindowMode.ts
│   ├── types/
│   │   └── memo.ts
│   ├── lib/
│   │   ├── commands.ts              # Tauri invoke 래퍼
│   │   └── utils.ts                 # 유틸리티 (extractTitle 등)
│   └── styles/
│       └── globals.css
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```
