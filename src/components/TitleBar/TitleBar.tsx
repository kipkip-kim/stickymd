import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMemoStore } from "../../stores/memoStore";

const appWindow = getCurrentWindow();

export function TitleBar() {
  const toggleSidebar = useMemoStore((s) => s.toggleSidebar);
  const popOutMemo = useMemoStore((s) => s.popOutMemo);
  const activeMemo = useMemoStore((s) => s.activeMemo);
  const isDirty = useMemoStore((s) => s.isDirty);

  const title = activeMemo?.meta.title || "Sticky Memo";

  const handlePopOut = () => {
    if (!activeMemo) return;
    popOutMemo(activeMemo.meta.id, activeMemo.filePath, activeMemo.meta.title);
  };

  return (
    <div
      className="flex items-center justify-between select-none shrink-0"
      style={{
        height: 36,
        backgroundColor: "var(--bg-titlebar)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      {/* Left: hamburger + pin */}
      <div className="flex items-center gap-1 px-2">
        <button
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
          title="사이드바 토글 (Ctrl+B)"
          onClick={toggleSidebar}
        >
          ☰
        </button>
        <button
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--bg-hover)]"
          style={{
            color: activeMemo ? "var(--text-secondary)" : "var(--text-muted)",
            opacity: activeMemo ? 1 : 0.5,
          }}
          title={activeMemo ? "스티키로 팝아웃" : "메모를 선택하세요"}
          onClick={handlePopOut}
          disabled={!activeMemo}
        >
          📌
        </button>
      </div>

      {/* Center: draggable title area */}
      <div
        className="flex-1 text-center text-sm cursor-default truncate px-2"
        style={{ color: "var(--text-secondary)" }}
        data-tauri-drag-region
        onMouseDown={() => appWindow.startDragging()}
      >
        {title}
        {isDirty && " *"}
      </div>

      {/* Right: window controls */}
      <div className="flex items-center">
        <button
          className="w-11 h-9 flex items-center justify-center hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
          onClick={() => appWindow.minimize()}
          title="최소화"
        >
          ─
        </button>
        <button
          className="w-11 h-9 flex items-center justify-center hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
          onClick={async () => {
            const maximized = await appWindow.isMaximized();
            maximized ? appWindow.unmaximize() : appWindow.maximize();
          }}
          title="최대화"
        >
          □
        </button>
        <button
          className="w-11 h-9 flex items-center justify-center hover:bg-[var(--accent-danger)] text-[var(--text-muted)] hover:text-white"
          onClick={() => appWindow.close()}
          title="닫기"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
