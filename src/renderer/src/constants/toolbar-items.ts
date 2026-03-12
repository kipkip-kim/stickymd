export interface ToolbarItemDef {
  id: string
  icon: string
  label: string
  title: string
  style?: React.CSSProperties
}

export const TOOLBAR_ITEMS: ToolbarItemDef[] = [
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
  { id: 'toggle', icon: '▶', label: '토글', title: '토글 (접기/펼치기)' }
]

export const DEFAULT_TOOLBAR_ITEMS = ['bold', 'underline', 'checkbox', 'bullet']
