import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface StickyTitleBarProps {
  title: string;
  isDirty: boolean;
  onUnpin: () => void;
  onClose: () => void;
}

export function StickyTitleBar({ title, isDirty, onUnpin, onClose }: StickyTitleBarProps) {
  const appWindow = getCurrentWindow();

  const handleNewSticky = async () => {
    // Extract dir from current window's filePath
    const params = new URLSearchParams(window.location.search);
    const filePath = decodeURIComponent(params.get("filePath") || "");
    const sep = filePath.includes("\\") ? "\\" : "/";
    const dir = filePath.substring(0, filePath.lastIndexOf(sep));
    if (dir) {
      await invoke("create_new_sticky", { dir }).catch(console.error);
    }
  };

  return (
    <div
      className="flex items-center justify-between select-none shrink-0"
      style={{
        height: 30,
        backgroundColor: "var(--bg-titlebar)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      {/* Left: + button and unpin */}
      <div className="flex items-center">
        <button
          className="w-7 h-[30px] flex items-center justify-center hover:bg-[var(--bg-hover)] text-sm"
          style={{ color: "var(--accent-primary)" }}
          title="새 스티키 메모"
          onClick={handleNewSticky}
        >
          +
        </button>
        <button
          className="w-7 h-[30px] flex items-center justify-center hover:bg-[var(--bg-hover)] text-xs"
          style={{ color: "var(--accent-pin)" }}
          title="언핀 (스티키 닫기)"
          onClick={onUnpin}
        >
          📌
        </button>
      </div>

      {/* Center: draggable title */}
      <div
        className="flex-1 text-center text-xs cursor-default truncate px-1"
        style={{ color: "var(--text-secondary)" }}
        data-tauri-drag-region
        onMouseDown={() => appWindow.startDragging()}
      >
        {title}
        {isDirty && " *"}
      </div>

      {/* Right: close */}
      <button
        className="w-8 h-[30px] flex items-center justify-center hover:bg-[var(--accent-danger)] text-[var(--text-muted)] hover:text-white text-xs"
        title="닫기"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}
