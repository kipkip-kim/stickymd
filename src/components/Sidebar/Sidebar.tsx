import { useMemoStore } from "../../stores/memoStore";

export function Sidebar() {
  const sidebarOpen = useMemoStore((s) => s.sidebarOpen);
  const memos = useMemoStore((s) => s.memos);
  const activeMemoId = useMemoStore((s) => s.activeMemoId);
  const openStickyIds = useMemoStore((s) => s.openStickyIds);
  const setActiveMemo = useMemoStore((s) => s.setActiveMemo);
  const createNewMemo = useMemoStore((s) => s.createNewMemo);
  const currentDir = useMemoStore((s) => s.currentDir);

  return (
    <aside
      className="flex flex-col shrink-0 overflow-hidden transition-all duration-200 ease-in-out"
      style={{
        width: sidebarOpen ? 280 : 0,
        backgroundColor: "var(--bg-secondary)",
        borderRight: sidebarOpen ? "1px solid var(--border-subtle)" : "none",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span
          className="text-xs truncate"
          style={{ color: "var(--text-muted)" }}
          title={currentDir}
        >
          {currentDir.split(/[/\\]/).pop() || "Memos"}
        </span>
        <button
          className="w-7 h-7 flex items-center justify-center rounded text-lg hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--accent-primary)" }}
          onClick={createNewMemo}
          title="새 메모 (Ctrl+N)"
        >
          +
        </button>
      </div>

      {/* Memo list */}
      <div className="flex-1 overflow-y-auto">
        {memos.length === 0 ? (
          <div
            className="p-4 text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            메모가 없습니다
          </div>
        ) : (
          memos.map((memo) => {
            const isOpenAsSticky = openStickyIds.includes(memo.id);
            return (
              <button
                key={memo.id}
                className="w-full text-left px-3 py-2 transition-colors"
                style={{
                  backgroundColor:
                    memo.id === activeMemoId
                      ? "var(--bg-active)"
                      : "transparent",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
                onClick={() => setActiveMemo(memo.id, memo.filePath)}
                onMouseEnter={(e) => {
                  if (memo.id !== activeMemoId) {
                    e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (memo.id !== activeMemoId) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <div className="flex items-center gap-1">
                  {memo.pinned && (
                    <span className="text-xs" style={{ color: "var(--accent-pin)" }}>
                      📌
                    </span>
                  )}
                  {isOpenAsSticky && (
                    <span className="text-xs" title="스티키로 열림">
                      🔗
                    </span>
                  )}
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {memo.title}
                  </span>
                </div>
                <div
                  className="text-xs mt-0.5 truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {memo.preview || "빈 메모"}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
