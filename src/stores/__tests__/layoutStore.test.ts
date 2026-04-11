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

describe("layoutStore", () => {
  beforeEach(() => {
    useLayoutStore.setState({
      sidebarTab: "files",
      leftPaneVisible: true,
      rightPaneVisible: true,
    });
    vi.clearAllMocks();
  });

  describe("sidebarTab", () => {
    it("defaults to files", () => {
      expect(useLayoutStore.getState().sidebarTab).toBe("files");
    });

    it("can be set to git", () => {
      useLayoutStore.getState().setSidebarTab("git");
      expect(useLayoutStore.getState().sidebarTab).toBe("git");
    });

    it("can be set to agents", () => {
      useLayoutStore.getState().setSidebarTab("agents");
      expect(useLayoutStore.getState().sidebarTab).toBe("agents");
    });

    it("can be set back to files", () => {
      useLayoutStore.getState().setSidebarTab("git");
      useLayoutStore.getState().setSidebarTab("files");
      expect(useLayoutStore.getState().sidebarTab).toBe("files");
    });
  });

  describe("pane visibility", () => {
    it("left pane defaults to visible", () => {
      expect(useLayoutStore.getState().leftPaneVisible).toBe(true);
    });

    it("right pane defaults to visible", () => {
      expect(useLayoutStore.getState().rightPaneVisible).toBe(true);
    });

    it("toggleLeftPane hides the left pane", () => {
      useLayoutStore.getState().toggleLeftPane();
      expect(useLayoutStore.getState().leftPaneVisible).toBe(false);
    });

    it("toggleLeftPane toggles back to visible", () => {
      useLayoutStore.getState().toggleLeftPane();
      useLayoutStore.getState().toggleLeftPane();
      expect(useLayoutStore.getState().leftPaneVisible).toBe(true);
    });

    it("toggleRightPane hides the right pane", () => {
      useLayoutStore.getState().toggleRightPane();
      expect(useLayoutStore.getState().rightPaneVisible).toBe(false);
    });

    it("toggleRightPane toggles back to visible", () => {
      useLayoutStore.getState().toggleRightPane();
      useLayoutStore.getState().toggleRightPane();
      expect(useLayoutStore.getState().rightPaneVisible).toBe(true);
    });
  });

  describe("loadLayout", () => {
    it("returns layout string on success", async () => {
      mockedCommands.loadWorkspaceState.mockResolvedValue({
        status: "ok",
        data: {
          layout:
            '{"leftPaneVisible":true,"rightPaneVisible":true,"sidebarTab":"files"}',
          active_project_id: null,
        },
      });

      const result = await useLayoutStore.getState().loadLayout();

      expect(result).toBe(
        '{"leftPaneVisible":true,"rightPaneVisible":true,"sidebarTab":"files"}',
      );
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
});
