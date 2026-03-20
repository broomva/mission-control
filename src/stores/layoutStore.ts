import type { DockviewApi } from "dockview-core";
import { create } from "zustand";
import { commands } from "../bindings";

interface LayoutState {
  dockviewApi: DockviewApi | null;
  contextPanelTab: "files" | "git" | "agents";
  setDockviewApi: (api: DockviewApi) => void;
  setContextPanelTab: (tab: "files" | "git" | "agents") => void;
  saveLayout: () => Promise<void>;
  loadLayout: () => Promise<string | null>;
  addTerminalPanel: (
    terminalId: string,
    title: string,
    params?: Record<string, unknown>,
  ) => void;
  addDashboardPanel: () => void;
  openProjectWorkspace: (
    projectId: string,
    projectName: string,
    projectPath: string,
  ) => void;
  openDiffViewer: (
    projectId: string,
    projectPath: string,
    commitOid: string,
    commitMessage: string,
  ) => void;
  openAgentPanel: (agentId: string, title: string) => void;
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useLayoutStore = create<LayoutState>((set, get) => ({
  dockviewApi: null,
  contextPanelTab: "files",

  setDockviewApi: (api: DockviewApi) => {
    set({ dockviewApi: api });
  },

  setContextPanelTab: (tab: "files" | "git" | "agents") => {
    set({ contextPanelTab: tab });
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

  addTerminalPanel: (
    terminalId: string,
    title: string,
    params?: Record<string, unknown>,
  ) => {
    const { dockviewApi } = get();
    if (!dockviewApi) return;

    dockviewApi.addPanel({
      id: `terminal-${terminalId}`,
      component: "terminal",
      title,
      params: { terminalId, ...params },
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

  openProjectWorkspace: async (
    projectId: string,
    projectName: string,
    projectPath: string,
  ) => {
    const { addTerminalPanel, dockviewApi } = get();
    if (!dockviewApi) return;

    // Check if there's already a terminal for this project
    const hasTerminal = dockviewApi.panels.some(
      (p) => p.id.startsWith("terminal-") && p.title?.includes(projectName),
    );

    if (hasTerminal) return;

    // Check for persisted sessions
    const result = await commands.listProjectTerminals(projectId);
    if (result.status === "ok" && result.data.length > 0) {
      for (const session of result.data) {
        if (session.status === "exited") {
          // Show exited session with scrollback
          addTerminalPanel(session.id, `${projectName} - Terminal`, {
            restoredSession: true,
          });
        } else {
          // Running session (shouldn't normally happen after restart, but handle it)
          addTerminalPanel(session.id, `${projectName} - Terminal`);
        }
      }
      return;
    }

    // No saved terminals — create a fresh one
    const createResult = await commands.createTerminal(
      projectId,
      projectPath,
      80,
      24,
    );
    if (createResult.status === "ok") {
      addTerminalPanel(createResult.data.id, `${projectName} - Terminal`);
    }
  },

  openDiffViewer: (
    projectId: string,
    projectPath: string,
    commitOid: string,
    commitMessage: string,
  ) => {
    const { dockviewApi } = get();
    if (!dockviewApi) return;

    const panelId = `diff-${commitOid.slice(0, 8)}`;

    // If already open, focus it
    const existing = dockviewApi.panels.find((p) => p.id === panelId);
    if (existing) {
      existing.api.setActive();
      return;
    }

    dockviewApi.addPanel({
      id: panelId,
      component: "diffviewer",
      title: commitMessage.slice(0, 50),
      params: { projectId, projectPath, commitOid },
    });
  },

  openAgentPanel: (agentId: string, title: string) => {
    const { dockviewApi } = get();
    if (!dockviewApi) return;

    const panelId = `agent-${agentId}`;

    // If already open, focus it
    const existing = dockviewApi.panels.find((p) => p.id === panelId);
    if (existing) {
      existing.api.setActive();
      return;
    }

    dockviewApi.addPanel({
      id: panelId,
      component: "agent-terminal",
      title,
      params: { agentId },
    });
  },
}));
