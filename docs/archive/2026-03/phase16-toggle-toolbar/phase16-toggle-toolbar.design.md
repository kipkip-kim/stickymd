# Phase 16: Toggle Block + Customizable Toolbar Design Document

> **Feature**: phase16-toggle-toolbar
> **Plan**: `docs/01-plan/features/phase16-toggle-toolbar.plan.md`
> **Date**: 2026-03-12
> **Status**: Draft

---

## 1. Architecture Overview

두 기능을 독립적으로 구현하되, 토글을 먼저 완성한 후 툴바 커스터마이징에 통합한다.

```
Part A: Toggle Block
  toggle-plugin.ts (신규) → MemoEditor.tsx (.use) → MemoEditor.css (스타일)
  slash-commands.ts (추가) → useSlashExecute.ts (추가)
  blockquote inputRule 제거 (MemoEditor.tsx에서 $prose로 처리)

Part B: Customizable Toolbar
  shared/types.ts (toolbarItems 추가) → types.ts (DEFAULT_SETTINGS)
  ManagerWindow.tsx (설정 UI) → EditorToolbar.tsx (동적 렌더)
```

---

## 2. Part A: Toggle Block

### 2.1 Node Schema Design

두 개의 커스텀 ProseMirror 노드를 정의한다.

#### `details` 노드 (컨테이너)

```typescript
$nodeSchema('details', (ctx) => ({
  content: 'details_summary block+',   // summary 1개 + 블록 1개 이상
  group: 'block',
  defining: true,
  attrs: { open: { default: true } },  // 접기/펼치기 상태
  parseDOM: [{
    tag: 'details',
    getAttrs: (dom) => ({ open: (dom as HTMLElement).hasAttribute('open') })
  }],
  toDOM: (node) => [
    'details',
    { ...(node.attrs.open ? { open: 'true' } : {}), class: 'toggle-block' },
    0
  ],
  parseMarkdown: { ... },  // 아래 2.3에서 상세
  toMarkdown: { ... }
}))
```

#### `details_summary` 노드

```typescript
$nodeSchema('details_summary', () => ({
  content: 'inline*',
  group: '',           // group 없음 — details 안에서만 사용
  defining: true,
  parseDOM: [{ tag: 'summary' }],
  toDOM: () => ['summary', { class: 'toggle-summary' }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'details_summary',
    runner: (state, node, type) => {
      state.openNode(type).next(node.children).closeNode()
    }
  },
  toMarkdown: {
    match: (node) => node.type.name === 'details_summary',
    runner: (state, node) => {
      // toMarkdown에서는 remark plugin이 처리
      state.openNode('details_summary').next(node.content).closeNode()
    }
  }
}))
```

### 2.2 Blockquote InputRule 제거 + Toggle InputRule 등록

**핵심 전략**: commonmark 프리셋의 `wrapInBlockquoteInputRule`을 제거하고, 같은 정규식 `/^\s*>\s$/`로 토글 블록을 생성하는 inputRule을 등록한다.

**구현 방식**: `$prose()` 플러그인에서 `inputRulesCtx`를 조작한다.

```typescript
// toggle-plugin.ts 내부
import { inputRulesCtx, SchemaReady } from '@milkdown/kit/core'

const removeBlockquoteInputRule = (ctx) => async () => {
  await ctx.wait(SchemaReady)
  ctx.update(inputRulesCtx, (rules) =>
    rules.filter((r) => {
      // blockquote의 inputRule regex: /^\s*>\s$/
      return r.match?.source !== '^\\s*>\\s$'
    })
  )
}
```

**Toggle InputRule**: ProseMirror `InputRule` 직접 생성 (wrappingInputRule이 아닌 커스텀).

```typescript
import { InputRule } from '@milkdown/kit/prose/inputrules'

const toggleInputRule = $inputRule((ctx) => {
  const detailsType = detailsSchema.type(ctx)
  const summaryType = detailsSummarySchema.type(ctx)

  return new InputRule(/^\s*>\s$/, (state, _match, start, end) => {
    const { tr } = state
    // 현재 줄의 텍스트 삭제
    tr.delete(start, end)
    // details > summary + paragraph 삽입
    const summaryNode = summaryType.create(null)
    const paragraphNode = state.schema.nodes.paragraph.create(null)
    const detailsNode = detailsType.create({ open: true }, [summaryNode, paragraphNode])
    tr.replaceSelectionWith(detailsNode)
    // 커서를 summary 안으로 이동
    tr.setSelection(TextSelection.create(tr.doc, start + 1))
    return tr
  })
})
```

### 2.3 Remark Plugin (마크다운 직렬화/파싱)

underline-plugin.ts의 `$remark` 패턴을 따른다.

#### 마크다운 → MDAST (파싱)

.md 파일에서 `<details>` HTML을 읽어 커스텀 MDAST 노드로 변환:

```typescript
function remarkToggle(this: any) {
  const data = this.data()

  // to-markdown: serialize
  const existing: any[] = data.toMarkdownExtensions || []
  existing.push({
    handlers: {
      details(node: any, _parent: any, state: any) {
        const summaryChild = node.children.find((c: any) => c.type === 'details_summary')
        const contentChildren = node.children.filter((c: any) => c.type !== 'details_summary')

        const summaryText = summaryChild
          ? state.containerPhrasing(summaryChild, { before: '', after: '' })
          : '토글'

        let content = ''
        if (contentChildren.length > 0) {
          const exit = state.enter('details')
          content = state.containerFlow({ type: 'root', children: contentChildren })
          exit()
        }

        return `<details>\n<summary>${summaryText}</summary>\n\n${content}\n</details>`
      }
    }
  })
  data.toMarkdownExtensions = existing

  // from-markdown: tree transform
  return function transformer(tree: any) {
    visitDetailsBlocks(tree)
  }
}
```

`visitDetailsBlocks`는 tree의 `html` 노드에서 `<details>`, `<summary>`, `</summary>`, `</details>` 태그를 찾아 MDAST 노드로 재구성한다.

#### MDAST → ProseMirror (파싱)

```typescript
parseMarkdown: {
  match: (node) => node.type === 'details',
  runner: (state, node, type) => {
    state.openNode(type, { open: true })
    state.next(node.children)
    state.closeNode()
  }
}
```

### 2.4 NodeView (클릭으로 접기/펼치기)

HTML `<details>` 요소의 네이티브 toggle 동작을 사용하되, ProseMirror의 `attrs.open`과 동기화한다.

```typescript
// $prose() 내 nodeViews 등록
const toggleNodeView = $prose((_ctx) => {
  return new Plugin({
    props: {
      nodeViews: {
        details(node, view, getPos) {
          const dom = document.createElement('details')
          dom.className = 'toggle-block'
          if (node.attrs.open) dom.setAttribute('open', 'true')

          dom.addEventListener('toggle', () => {
            const pos = getPos()
            if (pos === undefined) return
            view.dispatch(
              view.state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                open: dom.open
              })
            )
          })

          const contentDOM = document.createElement('div')
          contentDOM.className = 'toggle-content'
          dom.appendChild(contentDOM)

          return { dom, contentDOM }
        }
      }
    }
  })
})
```

**주의**: `contentDOM`을 사용하면 ProseMirror가 자동으로 자식 노드를 렌더한다. `summary`는 `contentDOM` 안에 들어가므로 별도 처리 불필요.

실제로는 `<details>` 안에 `<summary>`가 첫 자식으로 와야 브라우저가 정상 처리하므로, `contentDOM`을 `<details>` 자체로 설정하고 ProseMirror가 `<summary>` + 나머지 블록을 순서대로 넣게 한다:

```typescript
return { dom, contentDOM: dom }  // details 자체가 contentDOM
```

### 2.5 CSS 스타일

`MemoEditor.css`에 추가:

```css
/* Toggle block */
.ProseMirror details.toggle-block {
  margin: 4px 0;
  padding: 0;
  border: none;
  cursor: default;
}

.ProseMirror details.toggle-block > summary {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  list-style: none;           /* 기본 삼각형 제거 */
  display: flex;
  align-items: center;
  gap: 4px;
  user-select: text;          /* 텍스트 선택 허용 */
}

/* 커스텀 삼각형 */
.ProseMirror details.toggle-block > summary::before {
  content: '▶';
  font-size: 10px;
  color: var(--note-text-secondary);
  transition: transform 0.15s;
  flex-shrink: 0;
  display: inline-block;
  width: 16px;
  text-align: center;
}

.ProseMirror details.toggle-block[open] > summary::before {
  transform: rotate(90deg);
}

.ProseMirror details.toggle-block > summary:hover {
  background: var(--note-hover);
}

/* 접힌 내용 영역 */
.ProseMirror details.toggle-block > :not(summary) {
  padding-left: 20px;
  border-left: 2px solid var(--note-border);
  margin-left: 7px;
}

/* summary 기본 마커 제거 (크로스 브라우저) */
.ProseMirror details.toggle-block > summary::-webkit-details-marker {
  display: none;
}
```

### 2.6 슬래시 커맨드

`slash-commands.ts`에 토글 추가:

```typescript
{ id: 'toggle', labelEn: 'toggle', labelKo: '토글', description: 'Toggle Block', icon: '▶' }
```

`useSlashExecute.ts`에 핸들러 추가:

```typescript
case 'toggle': {
  const { schema, tr } = view.state
  const detailsType = schema.nodes['details']
  const summaryType = schema.nodes['details_summary']
  if (detailsType && summaryType) {
    const summary = summaryType.create(null)
    const para = schema.nodes.paragraph.create(null)
    const details = detailsType.create({ open: true }, [summary, para])
    view.dispatch(tr.replaceSelectionWith(details))
  }
  break
}
```

---

## 3. Part B: Customizable Toolbar

### 3.1 Settings 변경

#### `shared/types.ts`

```typescript
export interface AppSettings {
  // ... 기존 필드
  toolbarItems: string[]    // 추가
}
```

#### `main/lib/types.ts`

```typescript
export const DEFAULT_SETTINGS: AppSettings = {
  // ... 기존 값
  toolbarItems: ['bold', 'underline', 'checkbox', 'bullet']  // 추가
}
```

### 3.2 Toolbar Item Registry

`EditorToolbar.tsx`에서 사용할 아이템 정의:

```typescript
// src/renderer/src/constants/toolbar-items.ts (신규)

export interface ToolbarItem {
  id: string
  icon: string          // 표시할 텍스트/기호
  label: string         // 한글 이름
  title: string         // tooltip
  style?: React.CSSProperties  // 추가 스타일 (예: underline)
}

export const TOOLBAR_ITEMS: ToolbarItem[] = [
  { id: 'bold', icon: 'B', label: '굵게', title: '굵게 (Ctrl+B)', style: { fontWeight: 700 } },
  { id: 'underline', icon: 'U', label: '밑줄', title: '밑줄 (Ctrl+U)', style: { textDecoration: 'underline' } },
  { id: 'italic', icon: 'I', label: '기울임', title: '기울임 (Ctrl+I)', style: { fontStyle: 'italic' } },
  { id: 'strikethrough', icon: 'S', label: '취소선', title: '취소선', style: { textDecoration: 'line-through' } },
  { id: 'h1', icon: 'H1', label: '제목1', title: '제목 1' },
  { id: 'h2', icon: 'H2', label: '제목2', title: '제목 2' },
  { id: 'h3', icon: 'H3', label: '제목3', title: '제목 3' },
  { id: 'checkbox', icon: '☑', label: '체크박스', title: '체크박스' },
  { id: 'bullet', icon: '•', label: '글머리 기호', title: '글머리 기호' },
  { id: 'ordered', icon: '1.', label: '번호 목록', title: '번호 목록' },
  { id: 'quote', icon: '"', label: '인용', title: '인용 (블록)' },
  { id: 'code', icon: '</>', label: '코드 블록', title: '코드 블록' },
  { id: 'hr', icon: '—', label: '구분선', title: '구분선' },
  { id: 'toggle', icon: '▶', label: '토글', title: '토글 (접기/펼치기)' },
]

export const MAX_TOOLBAR_ITEMS = 6
```

### 3.3 EditorToolbar 리팩터링

현재 하드코딩된 4개 버튼을 아이템 레지스트리 기반으로 변경:

```typescript
// EditorToolbar.tsx

interface EditorToolbarProps {
  getEditor: () => Editor | undefined
  memoId: string
  opacity: number
  onOpacityChange: (opacity: number) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  toolbarItems: string[]     // 추가: settings에서 전달
}

// 아이템별 실행 핸들러 맵
const ITEM_HANDLERS: Record<string, (editor: Editor) => void> = {
  bold: (editor) => editor.action(callCommand(toggleStrongCommand.key)),
  underline: (editor) => editor.action(callCommand(toggleUnderlineCommand.key)),
  italic: (editor) => editor.action(callCommand(toggleEmphasisCommand.key)),
  // ... 나머지
}

// 렌더
{toolbarItems.map((itemId) => {
  const item = TOOLBAR_ITEMS.find(t => t.id === itemId)
  if (!item) return null
  return (
    <button
      key={item.id}
      className={styles.btn}
      onMouseDown={(e) => { e.preventDefault(); ITEM_HANDLERS[item.id]?.(editor) }}
      title={item.title}
      style={item.style}
    >
      {item.icon}
    </button>
  )
})}
```

### 3.4 Settings UI — 툴바 설정 섹션

`ManagerWindow.tsx`의 설정 탭에 추가:

```
┌─────────────────────────────────────────────┐
│ 툴바 버튼 (최대 6개)                          │
│                                             │
│ [✓] B  굵게            [↑] [↓]              │
│ [✓] U  밑줄            [↑] [↓]              │
│ [ ] I  기울임                               │
│ [ ] S  취소선                               │
│ [ ] H1 제목1                                │
│ [✓] ☑  체크박스        [↑] [↓]              │
│ [✓] •  글머리 기호     [↑] [↓]              │
│ [ ] 1. 번호 목록                            │
│ [ ] "  인용                                 │
│ [ ] ▶  토글                                 │
│                                             │
│ 선택됨: 4/6                                  │
└─────────────────────────────────────────────┘
```

**동작**:
- 체크박스 on/off로 아이템 추가/제거
- 체크된 아이템만 위/아래 화살표 표시
- 체크된 순서가 `toolbarItems` 배열 순서
- 새 아이템 체크 시 배열 끝에 추가
- 6개 초과 체크 시도 시 체크박스 비활성화 + "최대 6개" 안내

**IPC 흐름**:
1. ManagerWindow에서 `updateSetting('toolbarItems', newArray)` 호출
2. main process가 settings.json에 저장
3. `settings:changed` 이벤트로 모든 메모 창에 브로드캐스트
4. App.tsx에서 `onSettingsChanged`로 수신 → `toolbarItems` state 업데이트
5. EditorToolbar에 `toolbarItems` prop 전달

### 3.5 App.tsx 변경

```typescript
const [toolbarItems, setToolbarItems] = useState<string[]>(
  ['bold', 'underline', 'checkbox', 'bullet']
)

// getSettings에서 초기값 로드
window.api.getSettings().then((s) => {
  // ... 기존 코드
  if (s.toolbarItems) setToolbarItems(s.toolbarItems)
})

// onSettingsChanged에서 실시간 반영
window.api.onSettingsChanged((updates) => {
  // ... 기존 코드
  if (updates.toolbarItems) setToolbarItems(updates.toolbarItems)
})

// EditorToolbar에 전달
<EditorToolbar
  // ... 기존 props
  toolbarItems={toolbarItems}
/>
```

---

## 4. 수정 파일 목록

### Part A: Toggle Block

| 파일 | 변경 | 라인 수 |
|------|------|---------|
| `src/renderer/src/plugins/toggle-plugin.ts` | **신규** — 노드 스키마 + inputRule + nodeView + remark | ~200 |
| `src/renderer/src/components/MemoEditor.tsx` | `.use(togglePlugin)` 추가 | +2 |
| `src/renderer/src/components/MemoEditor.css` | 토글 CSS 추가 | +40 |
| `src/renderer/src/constants/slash-commands.ts` | toggle 커맨드 추가 | +1 |
| `src/renderer/src/hooks/useSlashExecute.ts` | toggle case 추가 | +12 |

### Part B: Customizable Toolbar

| 파일 | 변경 | 라인 수 |
|------|------|---------|
| `src/renderer/src/constants/toolbar-items.ts` | **신규** — 아이템 레지스트리 | ~30 |
| `src/shared/types.ts` | `toolbarItems: string[]` 추가 | +1 |
| `src/main/lib/types.ts` | DEFAULT_SETTINGS에 toolbarItems 추가 | +1 |
| `src/renderer/src/components/EditorToolbar.tsx` | 동적 렌더링으로 리팩터 | ~50 변경 |
| `src/renderer/src/components/ManagerWindow.tsx` | 설정 UI 섹션 추가 | ~60 |
| `src/renderer/src/App.tsx` | toolbarItems state + props 전달 | +15 |

---

## 5. Implementation Order

### Step 1: Toggle Node Schema + Remark Plugin
- `toggle-plugin.ts` 생성 — `detailsSchema`, `detailsSummarySchema`, `remarkToggle`
- `MemoEditor.tsx`에 `.use()` 추가
- `MemoEditor.css`에 토글 스타일 추가
- **검증**: tsc + npm run build

### Step 2: InputRule + NodeView
- blockquote inputRule 제거 로직 추가
- toggle inputRule 추가 (`> ` + 스페이스)
- nodeView 추가 (접기/펼치기 동기화)
- **검증**: tsc + 빌드 + `>` 입력 시 토글 생성 확인

### Step 3: 슬래시 커맨드 + 저장/로드 테스트
- `slash-commands.ts`에 toggle 추가
- `useSlashExecute.ts`에 toggle case 추가
- .md 파일 저장 → `<details>` HTML 확인
- .md 파일 다시 열기 → 토글 블록으로 렌더 확인
- **검증**: 전체 라운드트립 테스트

### Step 4: Toolbar Item Registry + Settings
- `toolbar-items.ts` 생성
- `AppSettings`에 `toolbarItems` 추가
- `ManagerWindow.tsx`에 설정 UI 추가
- **검증**: tsc + 빌드 + 설정 UI 표시 확인

### Step 5: EditorToolbar 동적 렌더링
- `EditorToolbar.tsx` 리팩터
- `App.tsx`에 toolbarItems state + props 연결
- **검증**: 설정 변경 → 툴바 즉시 반영

---

## 6. Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| `<details>` content schema `'details_summary block+'`가 ProseMirror에서 유효하지 않을 수 있음 | 높음 | 테스트 시 schema 에러 발생하면 `'block+'`로 변경 후 summary를 attrs로 처리 |
| remark 파싱 시 `<details>` HTML이 여러 html 노드로 분리됨 | 높음 | underline-plugin의 `combineUnderlineRuns` 패턴으로 시작/끝 태그 사이 노드 수집 |
| blockquote inputRule 제거가 타이밍 이슈로 실패 | 중간 | `$prose()`에서 `SchemaReady` 대기 후 `inputRulesCtx` 필터링 |
| nodeView에서 `getPos()`가 undefined 반환 | 중간 | undefined 체크 후 early return |
| 토글 내부에서 커서 이동/백스페이스 동작 이상 | 중간 | ProseMirror gapcursor 플러그인 활용, 엣지 케이스 테스트 |
| 설정 변경 시 열린 메모에 즉시 반영 안 됨 | 낮음 | `settings:changed` IPC 브로드캐스트는 이미 구현되어 있음 |

---

## 7. 대안 설계 (Fallback)

토글 블록이 ProseMirror 커스텀 노드로 구현하기 어려울 경우:

**Fallback A**: `<details>` 대신 커스텀 block 어트리뷰트
- 일반 blockquote에 `data-toggle="true"` 어트리뷰트 추가
- CSS로 토글 UI 렌더, JS로 접기/펼치기
- 마크다운: `> [!toggle] 제목` 같은 커스텀 문법
- 단점: 표준 호환성 없음

**Fallback B**: 단순 `<details>` HTML 패스스루
- ProseMirror에서는 일반 HTML 블록으로 취급 (편집 불가)
- 슬래시 커맨드로 `<details>` HTML 텍스트 직접 삽입
- 미리보기에서만 접기/펼치기 동작
- 단점: WYSIWYG 아님

→ 우선 본 설계(커스텀 노드)로 진행하고, Step 1에서 schema 등록이 실패하면 Fallback B로 전환.
