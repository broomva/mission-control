import type { DockviewApi } from "dockview-core";
import { create } from "zustand";
import { commands } from "../bindings";

interface LayoutState {
  dockviewApi: DockviewApi | null;
  setDockviewApi: (api: DockviewApi) => void;
  saveLayout: () => Promise<void>;
  loadLayout: () => Promise<string | null>;
  addTerminalPanel: (terminalId: string, title: string) => void;
  addDashboardPanel: () => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useLayoutStore = create<LayoutState>((set, get) => ({
  dockviewApi: null,

  setDockviewApi: (api: DockviewApi) => {
    set({ dockviewApi: api });
  },

  saveLayout: async () => {
    const { dockviewApi } = get();
    if (!dockviewApi) return;

    // Debounce saves
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const layout = JSON.stringify(dockviewApi.toJSON());
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

  addTerminalPanel: (terminalId: string, title: string) => {
    const { dockviewApi } = get();
    if (!dockviewApi) return;

    dockviewApi.addPanel({
      id: `terminal-${terminalId}`,
      component: "terminal",
      title: title,
      params: { terminalId },
    });
  },

  addDashboardPanel: () => {
    const { dockviewApi } = get();
    if (!dockviewApi) return;

    // Check if dashboard already exists
    const existing = dockviewApi.panels.find(
      (p) => p.id === "project-dashboard",
    );
    if (existing) {
      existing.api.setActive();
      return;
    }

    dockviewApi.addPanel({
      id: "project-dashboard",
      component: "dashboard",
      title: "Projects",
    });
  },
}));
