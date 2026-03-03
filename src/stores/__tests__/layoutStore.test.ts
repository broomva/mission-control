import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bindings", () => ({
  commands: {
    saveWorkspaceState: vi.fn(),
    loadWorkspaceState: vi.fn(),
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
    useLayoutStore.setState({ dockviewApi: null as any });
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
});
