interface StickyEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
}

export function StickyEditor({ content, onChange, onSave }: StickyEditorProps) {
  return (
    <textarea
      className="flex-1 p-3 resize-none outline-none text-sm"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-sans)",
      }}
      value={content}
      onChange={(e) => onChange(e.target.value)}
      placeholder="여기에 마크다운을 작성하세요..."
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
          e.preventDefault();
          onSave();
        }
      }}
    />
  );
}
