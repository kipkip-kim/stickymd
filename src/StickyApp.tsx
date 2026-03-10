import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StickyTitleBar } from "./components/StickyTitleBar/StickyTitleBar";
import { StickyEditor } from "./components/StickyEditor/StickyEditor";
import type { Memo } from "./types/memo";

const params = new URLSearchParams(window.location.search);
const memoId = decodeURIComponent(params.get("memoId") || "");
const filePath = decodeURIComponent(params.get("filePath") || "");

export function StickyApp() {
  const [memo, setMemo] = useState<Memo | null>(null);
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const memoRef = useRef(memo);
  memoRef.current = memo;

  // Load memo on mount
  useEffect(() => {
    if (!filePath) {
      setError("No filePath provided");
      return;
    }
    invoke<Memo>("read_memo", { filePath })
      .then((m) => {
        setMemo(m);
        setContent(m.content);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Listen for memo-deleted events
  useEffect(() => {
    const unlisten = listen<string>("memo-deleted", (event) => {
      if (event.payload === memoId) {
        getCurrentWindow().close();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Debounced auto-save
  const saveNow = useCallback(async () => {
    const currentMemo = memoRef.current;
    const currentContent = contentRef.current;
    if (!currentMemo) return;

    const dir = filePath.substring(0, filePath.lastIndexOf("\\")) ||
                filePath.substring(0, filePath.lastIndexOf("/"));
    const firstLine = currentContent.split("\n").find((l) => l.trim()) || "";
    const title = firstLine.replace(/^#+\s*/, "").trim() || currentMemo.meta.title;

    try {
      const saved = await invoke<Memo>("save_memo", {
        dir,
        id: currentMemo.meta.id,
        title,
        content: currentContent,
        pinned: currentMemo.meta.pinned,
      });
      setMemo(saved);
      setIsDirty(false);
      await emit("memo-saved-from-sticky", memoId);
    } catch (e) {
      console.error("Sticky save failed:", e);
    }
  }, []);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setIsDirty(true);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveNow();
    }, 1500);
  }, [saveNow]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const handleUnpin = useCallback(async () => {
    if (isDirty) {
      await saveNow();
    }
    await invoke("unregister_sticky", { memoId }).catch(() => {});
    getCurrentWindow().close();
  }, [isDirty, saveNow]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ backgroundColor: "var(--bg-primary)", color: "var(--accent-danger)" }}
      >
        <p className="text-sm p-4 text-center">{error}</p>
      </div>
    );
  }

  const title = memo?.meta.title || "Loading...";

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      <StickyTitleBar
        title={title}
        isDirty={isDirty}
        onUnpin={handleUnpin}
        onClose={handleUnpin}
      />
      <StickyEditor
        content={content}
        onChange={handleContentChange}
        onSave={saveNow}
      />
    </div>
  );
}
