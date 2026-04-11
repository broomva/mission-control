import { create } from "zustand";
import { commands } from "../bindings";

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 400;
const SIDEBAR_DEFAULT = 260;
const EXPLORER_MIN = 200;
const EXPLORER_MAX = 450;
const EXPLORER_DEFAULT = 280;

interface LayoutState {
  sidebarTab: "files" | "git" | "worktrees" | "agents";
  leftPaneVisible: boolean;
  rightPaneVisible: boolean;
  sidebarWidth: number;
  fileExplorerWidth: number;
  setSidebarTab: (tab: "files" | "git" | "worktrees" | "agents") => void;
  toggleLeftPane: () => void;
  toggleRightPane: () => void;
  setSidebarWidth: (w: number) => void;
  setFileExplorerWidth: (w: number) => void;
  saveLayout: () => Promise<void>;
  loadLayout: () => Promise<string | null>;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useLayoutStore = create<LayoutState>((set, get) => ({
  sidebarTab: "files",
  leftPaneVisible: true,
  rightPaneVisible: true,
  sidebarWidth: SIDEBAR_DEFAULT,
  fileExplorerWidth: EXPLORER_DEFAULT,

  setSidebarTab: (tab: "files" | "git" | "worktrees" | "agents") => {
    set({ sidebarTab: tab });
  },

  toggleLeftPane: () => {
    set((state) => ({ leftPaneVisible: !state.leftPaneVisible }));
  },

  toggleRightPane: () => {
    set((state) => ({ rightPaneVisible: !state.rightPaneVisible }));
  },

  setSidebarWidth: (w: number) => {
    set({ sidebarWidth: Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w))) });
  },

  setFileExplorerWidth: (w: number) => {
    set({ fileExplorerWidth: Math.round(Math.min(EXPLORER_MAX, Math.max(EXPLORER_MIN, w))) });
  },

  saveLayout: async () => {
    const { leftPaneVisible, rightPaneVisible, sidebarTab, sidebarWidth, fileExplorerWidth } = get();

    // Debounce saves
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const layout = JSON.stringify({
        leftPaneVisible,
        rightPaneVisible,
        sidebarTab,
        sidebarWidth,
        fileExplorerWidth,
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
