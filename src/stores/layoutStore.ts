import { create } from "zustand";
import { commands } from "../bindings";

interface LayoutState {
  sidebarTab: "files" | "git" | "agents";
  leftPaneVisible: boolean;
  rightPaneVisible: boolean;
  setSidebarTab: (tab: "files" | "git" | "agents") => void;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;
  saveLayout: () => Promise<void>;
  loadLayout: () => Promise<string | null>;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useLayoutStore = create<LayoutState>((set, get) => ({
  sidebarTab: "files",
  leftPaneVisible: true,
  rightPaneVisible: true,

  setSidebarTab: (tab: "files" | "git" | "agents") => {
    set({ sidebarTab: tab });
  },

  toggleLeftPane: () => {
    set((state) => ({ leftPaneVisible: !state.leftPaneVisible }));
  },

  toggleRightPane: () => {
    set((state) => ({ rightPaneVisible: !state.rightPaneVisible }));
  },

  saveLayout: async () => {
    const { leftPaneVisible, rightPaneVisible, sidebarTab } = get();

    // Debounce saves
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const layout = JSON.stringify({
        leftPaneVisible,
        rightPaneVisible,
        sidebarTab,
      });
      await commands.saveWorkspaceState({
        layout,
        active_project_id: null,
      });
    }, 1000);
  },

  loadLayout: async () => {
    const result = await commands.loadWorkspaceState();
    if (result.status === "ok" && result.data.layout) {
      return result.data.layout;
    }
    return null;
  },
}));
