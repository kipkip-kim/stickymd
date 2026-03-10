import { useMemoStore } from "../../stores/memoStore";

export function EditorArea() {
  const activeMemo = useMemoStore((s) => s.activeMemo);
  const activeContent = useMemoStore((s) => s.activeContent);
  const setActiveContent = useMemoStore((s) => s.setActiveContent);
  const editorMode = useMemoStore((s) => s.editorMode);
  const setEditorMode = useMemoStore((s) => s.setEditorMode);
  const isDirty = useMemoStore((s) => s.isDirty);
  const saveCurrent = useMemoStore((s) => s.saveCurrent);

  if (!activeMemo) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-2"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <span className="text-4xl">📝</span>
        <p style={{ color: "var(--text-muted)" }}>
          메모를 선택하거나 새 메모를 만드세요
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-1 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          {/* Editor mode toggle */}
          <div
            className="flex rounded overflow-hidden text-xs"
            style={{ border: "1px solid var(--border-subtle)" }}
          >
            <button
              className="px-2 py-1 transition-colors"
              style={{
                backgroundColor:
                  editorMode === "wysiwyg"
                    ? "var(--bg-active)"
                    : "transparent",
                color:
                  editorMode === "wysiwyg"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
              onClick={() => setEditorMode("wysiwyg")}
            >
              편집
            </button>
            <button
              className="px-2 py-1 transition-colors"
              style={{
                backgroundColor:
                  editorMode === "source"
                    ? "var(--bg-active)"
                    : "transparent",
                color:
                  editorMode === "source"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
              }}
              onClick={() => setEditorMode("source")}
            >
              소스
            </button>
          </div>
          {isDirty && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              수정됨
            </span>
          )}
        </div>
        <button
          className="text-xs px-2 py-1 rounded hover:bg-[var(--bg-hover)] transition-colors"
          style={{ color: "var(--accent-primary)" }}
          onClick={saveCurrent}
          disabled={!isDirty}
        >
          저장
        </button>
      </div>

      {/* Editor placeholder — Phase 4: Milkdown / CodeMirror */}
      <textarea
        className="flex-1 p-4 resize-none outline-none"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-primary)",
          fontFamily:
            editorMode === "source"
              ? "var(--font-mono)"
              : "var(--font-sans)",
          fontSize: "inherit",
        }}
        value={activeContent}
        onChange={(e) => setActiveContent(e.target.value)}
        placeholder="여기에 마크다운을 작성하세요..."
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            saveCurrent();
          }
        }}
      />
    </div>
  );
}
