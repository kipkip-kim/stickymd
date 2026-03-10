import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type {
  AppConfig,
  EditorMode,
  Memo,
  MemoListItem,
  MemoListResponse,
} from "../types/memo";

interface MemoState {
  // Folder
  currentDir: string;
  recentDirs: string[];

  // Memo data
  memos: MemoListItem[];
  totalMemos: number;
  hasMore: boolean;
  activeMemoId: string | null;
  activeMemo: Memo | null;
  activeContent: string;
  isDirty: boolean;

  // Loading
  isLoading: boolean;
  loadError: string | null;

  // Mode
  editorMode: EditorMode;

  // Sticky
  openStickyIds: string[];

  // UI
  sidebarOpen: boolean;
  searchQuery: string;

  // Config
  config: AppConfig | null;
}

interface MemoActions {
  initApp: () => Promise<void>;
  switchDir: (dir: string) => Promise<void>;
  loadMemos: () => Promise<void>;
  setActiveMemo: (id: string, filePath: string) => Promise<void>;
  setActiveContent: (content: string) => void;
  createNewMemo: () => Promise<void>;
  deleteMemo: (id: string, filePath: string) => Promise<void>;
  togglePin: (id: string, filePath: string) => Promise<void>;
  saveCurrent: () => Promise<void>;
  searchMemos: (query: string) => Promise<void>;
  setEditorMode: (mode: EditorMode) => void;
  toggleSidebar: () => void;
  popOutMemo: (id: string, filePath: string, title: string) => Promise<void>;
  syncOpenStickies: () => Promise<void>;
}

export type MemoStore = MemoState & MemoActions;

export const useMemoStore = create<MemoStore>((set, get) => ({
  // Initial state
  currentDir: "",
  recentDirs: [],
  memos: [],
  totalMemos: 0,
  hasMore: false,
  activeMemoId: null,
  activeMemo: null,
  activeContent: "",
  isDirty: false,
  isLoading: false,
  loadError: null,
  editorMode: "wysiwyg",
  openStickyIds: [],
  sidebarOpen: true,
  searchQuery: "",
  config: null,

  initApp: async () => {
    set({ isLoading: true, loadError: null });
    try {
      const config = await invoke<AppConfig>("get_config");
      const dir = config.currentDir || config.defaultDir;

      set({
        config,
        currentDir: dir,
        recentDirs: config.recentDirs,
        sidebarOpen: true,
      });

      await get().loadMemos();

      // Restore open stickies from last session
      if (config.openStickies && config.openStickies.length > 0) {
        for (const sticky of config.openStickies) {
          await invoke("pop_out_memo", {
            memoId: sticky.memoId,
            filePath: sticky.filePath,
            title: "Restoring...",
          }).catch(() => {});
        }
        await get().syncOpenStickies();
      }
    } catch (e) {
      set({ loadError: String(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  switchDir: async (dir: string) => {
    const { recentDirs, config } = get();
    set({ currentDir: dir, activeMemoId: null, activeMemo: null, activeContent: "", isDirty: false, searchQuery: "" });

    const updated = [dir, ...recentDirs.filter((d) => d !== dir)].slice(0, 10);
    set({ recentDirs: updated });

    if (config) {
      const newConfig = { ...config, currentDir: dir, recentDirs: updated };
      set({ config: newConfig });
      await invoke("set_config", { config: newConfig }).catch(() => {});
    }

    await get().loadMemos();
  },

  loadMemos: async () => {
    const { currentDir } = get();
    if (!currentDir) return;
    set({ isLoading: true, loadError: null });
    try {
      const res = await invoke<MemoListResponse>("load_memos", {
        dir: currentDir,
        limit: 50,
        offset: 0,
      });
      set({ memos: res.items, totalMemos: res.total, hasMore: res.hasMore });
    } catch (e) {
      set({ loadError: String(e) });
    } finally {
      set({ isLoading: false });
    }
  },

  setActiveMemo: async (id: string, filePath: string) => {
    const { openStickyIds, isDirty } = get();

    // If memo is open as sticky, focus that window instead
    if (openStickyIds.includes(id)) {
      await invoke("focus_sticky", { memoId: id }).catch(() => {});
      return;
    }

    // Auto-save dirty memo before switching
    if (isDirty) {
      await get().saveCurrent();
    }

    try {
      const memo = await invoke<Memo>("read_memo", { filePath });
      set({
        activeMemoId: id,
        activeMemo: memo,
        activeContent: memo.content,
        isDirty: false,
      });
    } catch (e) {
      set({ loadError: String(e) });
    }
  },

  setActiveContent: (content: string) => {
    set({ activeContent: content, isDirty: true });
  },

  createNewMemo: async () => {
    const { currentDir } = get();
    if (!currentDir) return;
    try {
      const memo = await invoke<Memo>("save_memo", {
        dir: currentDir,
        id: null,
        title: "새 메모",
        content: "",
        pinned: false,
      });
      await get().loadMemos();
      set({
        activeMemoId: memo.meta.id,
        activeMemo: memo,
        activeContent: memo.content,
        isDirty: false,
      });
    } catch (e) {
      set({ loadError: String(e) });
    }
  },

  deleteMemo: async (id: string, filePath: string) => {
    try {
      // Close sticky if open
      const { openStickyIds } = get();
      if (openStickyIds.includes(id)) {
        await invoke("close_sticky", { memoId: id }).catch(() => {});
      }

      await invoke("delete_memo", { filePath });
      await emit("memo-deleted", id);

      const { activeMemo } = get();
      if (activeMemo?.filePath === filePath) {
        set({ activeMemoId: null, activeMemo: null, activeContent: "", isDirty: false });
      }
      await get().loadMemos();
      await get().syncOpenStickies();
    } catch (e) {
      set({ loadError: String(e) });
    }
  },

  togglePin: async (_id: string, filePath: string) => {
    try {
      const memo = await invoke<Memo>("read_memo", { filePath });
      const { currentDir } = get();
      await invoke("save_memo", {
        dir: currentDir,
        id: memo.meta.id,
        title: memo.meta.title,
        content: memo.content,
        pinned: !memo.meta.pinned,
      });
      await get().loadMemos();
    } catch (e) {
      set({ loadError: String(e) });
    }
  },

  saveCurrent: async () => {
    const { activeMemo, activeContent, currentDir } = get();
    if (!activeMemo) return;
    try {
      const firstLine = activeContent.split("\n").find((l) => l.trim()) || "";
      const title = firstLine.replace(/^#+\s*/, "").trim() || activeMemo.meta.title;

      const saved = await invoke<Memo>("save_memo", {
        dir: currentDir,
        id: activeMemo.meta.id,
        title,
        content: activeContent,
        pinned: activeMemo.meta.pinned,
      });
      set({ activeMemo: saved, isDirty: false });
      await get().loadMemos();
    } catch (e) {
      set({ loadError: String(e) });
    }
  },

  searchMemos: async (query: string) => {
    set({ searchQuery: query });
    const { currentDir } = get();
    if (!currentDir) return;

    if (!query.trim()) {
      await get().loadMemos();
      return;
    }

    try {
      const results = await invoke<MemoListItem[]>("search_memos", {
        dir: currentDir,
        query,
      });
      set({ memos: results, totalMemos: results.length, hasMore: false });
    } catch (e) {
      set({ loadError: String(e) });
    }
  },

  setEditorMode: (mode: EditorMode) => {
    set({ editorMode: mode });
  },

  toggleSidebar: () => {
    set((s) => ({ sidebarOpen: !s.sidebarOpen }));
  },

  popOutMemo: async (id: string, filePath: string, title: string) => {
    try {
      await invoke("pop_out_memo", { memoId: id, filePath, title });

      // Clear active memo if it was popped out
      const { activeMemoId } = get();
      if (activeMemoId === id) {
        set({ activeMemoId: null, activeMemo: null, activeContent: "", isDirty: false });
      }

      await get().syncOpenStickies();
    } catch (e) {
      set({ loadError: String(e) });
    }
  },

  syncOpenStickies: async () => {
    try {
      const ids = await invoke<string[]>("get_open_stickies");
      set({ openStickyIds: ids });
    } catch {
      // ignore
    }
  },
}));
