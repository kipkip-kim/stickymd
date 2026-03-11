export interface SlashCommand {
  id: string
  labelEn: string
  labelKo: string
  description: string
  icon: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'h1', labelEn: 'h1', labelKo: '제목1', description: 'Heading 1', icon: 'H1' },
  { id: 'h2', labelEn: 'h2', labelKo: '제목2', description: 'Heading 2', icon: 'H2' },
  { id: 'h3', labelEn: 'h3', labelKo: '제목3', description: 'Heading 3', icon: 'H3' },
  { id: 'bullet', labelEn: 'bullet', labelKo: '글머리', description: 'Bullet List', icon: '•' },
  { id: 'numbered', labelEn: 'numbered', labelKo: '번호', description: 'Ordered List', icon: '1.' },
  { id: 'todo', labelEn: 'todo', labelKo: '할일', description: 'Checkbox', icon: '☑' },
  { id: 'code', labelEn: 'code', labelKo: '코드', description: 'Code Block', icon: '</>' },
  { id: 'quote', labelEn: 'quote', labelKo: '인용', description: 'Blockquote', icon: '"' },
  { id: 'divider', labelEn: 'divider', labelKo: '구분선', description: 'Horizontal Rule', icon: '—' },
  { id: 'bold', labelEn: 'bold', labelKo: '굵게', description: 'Bold', icon: 'B' },
  { id: 'italic', labelEn: 'italic', labelKo: '기울임', description: 'Italic', icon: 'I' },
  { id: 'link', labelEn: 'link', labelKo: '링크', description: 'Link', icon: '🔗' }
]

/** Filter commands by query (supports both English and Korean) */
export function filterCommands(query: string): SlashCommand[] {
  if (!query) return SLASH_COMMANDS
  const q = query.toLowerCase()
  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.labelEn.toLowerCase().includes(q) ||
      cmd.labelKo.includes(q) ||
      cmd.description.toLowerCase().includes(q)
  )
}
