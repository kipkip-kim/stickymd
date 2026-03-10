import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMemoStore } from "../stores/memoStore";
import type { OpenStickyInfo } from "../types/memo";

export function useAppInit() {
  const isLoading = useMemoStore((s) => s.isLoading);
  const loadError = useMemoStore((s) => s.loadError);

  useEffect(() => {
    useMemoStore.getState().initApp();

    // Listen for sticky events to keep main window in sync
    const unlistenOpened = listen("sticky-opened", () => {
      useMemoStore.getState().syncOpenStickies();
    });

    const unlistenClosed = listen("sticky-closed", () => {
      useMemoStore.getState().syncOpenStickies();
      useMemoStore.getState().loadMemos();
    });

    const unlistenSaved = listen("memo-saved-from-sticky", () => {
      useMemoStore.getState().loadMemos();
    });

    // Handle main window close: persist stickies, then close everything
    const appWindow = getCurrentWindow();
    const unlistenClose = appWindow.onCloseRequested(async (event) => {
      event.preventDefault();

      try {
        // Persist open stickies positions to config
        const stickies = await invoke<OpenStickyInfo[]>("persist_open_stickies");
        const config = useMemoStore.getState().config;
        if (config) {
          const newConfig = { ...config, openStickies: stickies };
          await invoke("set_config", { config: newConfig }).catch(() => {});
        }

        // Close all sticky windows
        const ids = await invoke<string[]>("get_open_stickies");
        for (const id of ids) {
          await invoke("close_sticky", { memoId: id }).catch(() => {});
        }
      } catch {
        // Proceed with closing even if persistence fails
      }

      // Now actually close the main window
      await appWindow.destroy();
    });

    return () => {
      unlistenOpened.then((fn) => fn());
      unlistenClosed.then((fn) => fn());
      unlistenSaved.then((fn) => fn());
      unlistenClose.then((fn) => fn());
    };
  }, []);

  return { isLoading, loadError };
}
