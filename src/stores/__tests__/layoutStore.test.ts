import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bindings", () => ({
  commands: {
    saveWorkspaceState: vi.fn(),
    loadWorkspaceState: vi.fn(),
    createTerminal: vi.fn(),
    listProjectTerminals: vi.fn(),
    getTerminalScrollback: vi.fn(),
    restoreTerminal: vi.fn(),
  },
}));

import { commands } from "../../bindings";
import { useLayoutStore } from "../layoutStore";

const mockedCommands = vi.mocked(commands);

function makeMockApi(overrides: Record<string, unknown> = {}) {
  return { toJSON: vi.fn(), panels: [], addPanel: vi.fn(), ...overrides };
}

describe("layoutStore", () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useLayoutStore.setState({
      dockviewApi: null as any,
      contextPanelTab: "files",
    });
    vi.clearAllMocks();
  });

  describe("setDockviewApi", () => {
    it("stores the dockview api reference", () => {
      const mockApi = makeMockApi();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useLayoutStore.getState().setDockviewApi(mockApi as any);

      expect(useLayoutStore.getState().dockviewApi).toBe(mockApi);
    });
  });

  describe("contextPanelTab", () => {
    it("defaults to files", () => {
      expect(useLayoutStore.getState().contextPanelTab).toBe("files");
    });

    it("can be set to git", () => {
      useLayoutStore.getState().setContextPanelTab("git");
      expect(useLayoutStore.getState().contextPanelTab).toBe("git");
    });

    it("can be set back to files", () => {
      useLayoutStore.getState().setContextPanelTab("git");
      useLayoutStore.getState().setContextPanelTab("files");
      expect(useLayoutStore.getState().contextPanelTab).toBe("files");
    });
  });

  describe("loadLayout", () => {
    it("returns layout string on success", async () => {
      mockedCommands.loadWorkspaceState.mockResolvedValue({
        status: "ok",
        data: {
          layout: '{"grid":{}}',
          active_project_id: null,
        },
      });

      const result = await useLayoutStore.getState().loadLayout();

      expect(result).toBe('{"grid":{}}');
    });

    it("returns null when no layout saved", async () => {
      mockedCommands.loadWorkspaceState.mockResolvedValue({
        status: "ok",
        data: {
          layout: null,
          active_project_id: null,
        },
      });

      const result = await useLayoutStore.getState().loadLayout();

      expect(result).toBeNull();
    });

    it("returns null on error", async () => {
      mockedCommands.loadWorkspaceState.mockResolvedValue({
        status: "error",
        error: { IoError: "read failed" },
      });

      const result = await useLayoutStore.getState().loadLayout();

      expect(result).toBeNull();
    });
  });

  describe("addTerminalPanel", () => {
    it("does nothing without dockview api", () => {
      useLayoutStore.getState().addTerminalPanel("term-1", "Terminal 1");
    });

    it("calls addPanel on dockview api", () => {
      const mockApi = makeMockApi();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useLayoutStore.setState({ dockviewApi: mockApi as any });

      useLayoutStore.getState().addTerminalPanel("term-1", "Terminal 1");

      expect(mockApi.addPanel).toHaveBeenCalledWith({
        id: "terminal-term-1",
        component: "terminal",
        title: "Terminal 1",
        params: { terminalId: "term-1" },
      });
    });

    it("passes extra params for restored sessions", () => {
      const mockApi = makeMockApi();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useLayoutStore.setState({ dockviewApi: mockApi as any });

      useLayoutStore.getState().addTerminalPanel("term-1", "Terminal 1", {
        restoredSession: true,
      });

      expect(mockApi.addPanel).toHaveBeenCalledWith({
        id: "terminal-term-1",
        component: "terminal",
        title: "Terminal 1",
        params: { terminalId: "term-1", restoredSession: true },
      });
    });
  });

  describe("addDashboardPanel", () => {
    it("does nothing without dockview api", () => {
      useLayoutStore.getState().addDashboardPanel();
    });

    it("activates existing dashboard instead of creating duplicate", () => {
      const setActive = vi.fn();
      const mockApi = makeMockApi({
        panels: [{ id: "project-dashboard", api: { setActive } }],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useLayoutStore.setState({ dockviewApi: mockApi as any });

      useLayoutStore.getState().addDashboardPanel();

      expect(setActive).toHaveBeenCalled();
      expect(mockApi.addPanel).not.toHaveBeenCalled();
    });

    it("creates dashboard panel when none exists", () => {
      const mockApi = makeMockApi();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useLayoutStore.setState({ dockviewApi: mockApi as any });

      useLayoutStore.getState().addDashboardPanel();

      expect(mockApi.addPanel).toHaveBeenCalledWith({
        id: "project-dashboard",
        component: "dashboard",
        title: "Projects",
      });
    });
  });

  describe("openProjectWorkspace", () => {
    it("does nothing without dockview api", async () => {
      await useLayoutStore
        .getState()
        .openProjectWorkspace("p1", "TestProject", "/tmp/test");
      expect(mockedCommands.listProjectTerminals).not.toHaveBeenCalled();
    });

    it("creates fresh terminal when no persisted sessions exist", async () => {
      const mockApi = makeMockApi();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useLayoutStore.setState({ dockviewApi: mockApi as any });

      mockedCommands.listProjectTerminals.mockResolvedValue({
        status: "ok",
        data: [],
      });
      mockedCommands.createTerminal.mockResolvedValue({
        status: "ok",
        data: {
          id: "new-term",
          project_id: "p1",
          title: "Terminal",
          cols: 80,
          rows: 24,
          cwd: "/tmp/test",
          created_at: "2024-01-01T00:00:00Z",
          status: "running",
          scrollback_path: null,
        },
      });

      await useLayoutStore
        .getState()
        .openProjectWorkspace("p1", "TestProject", "/tmp/test");

      expect(mockedCommands.createTerminal).toHaveBeenCalledWith(
        "p1",
        "/tmp/test",
        80,
        24,
      );
      expect(mockApi.addPanel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "terminal-new-term",
          component: "terminal",
          title: "TestProject - Terminal",
        }),
      );
    });

    it("restores exited sessions from persisted data", async () => {
      const mockApi = makeMockApi();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useLayoutStore.setState({ dockviewApi: mockApi as any });

      mockedCommands.listProjectTerminals.mockResolvedValue({
        status: "ok",
        data: [
          {
            id: "old-term",
            project_id: "p1",
            title: "Terminal",
            cols: 80,
            rows: 24,
            cwd: "/tmp/test",
            created_at: "2024-01-01T00:00:00Z",
            status: "exited",
            scrollback_path: "/some/path",
          },
        ],
      });

      await useLayoutStore
        .getState()
        .openProjectWorkspace("p1", "TestProject", "/tmp/test");

      // Should not create a new terminal
      expect(mockedCommands.createTerminal).not.toHaveBeenCalled();
      // Should add panel with restoredSession flag
      expect(mockApi.addPanel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "terminal-old-term",
          params: expect.objectContaining({ restoredSession: true }),
        }),
      );
    });
  });
});
