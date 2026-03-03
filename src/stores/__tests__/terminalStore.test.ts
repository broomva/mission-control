import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bindings", () => ({
  commands: {
    createTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    listTerminals: vi.fn(),
  },
}));

import { commands } from "../../bindings";
import { useTerminalStore } from "../terminalStore";

const mockedCommands = vi.mocked(commands);

describe("terminalStore", () => {
  beforeEach(() => {
    useTerminalStore.setState({ terminals: [] });
    vi.clearAllMocks();
  });

  describe("createTerminal", () => {
    it("creates a terminal and adds to state", async () => {
      const termInfo = {
        id: "term-1",
        project_id: "proj-1",
        title: "Terminal",
        cols: 80,
        rows: 24,
      };
      mockedCommands.createTerminal.mockResolvedValue({
        status: "ok",
        data: termInfo,
      });

      const result = await useTerminalStore
        .getState()
        .createTerminal("proj-1", "/home");

      expect(result).toEqual(termInfo);
      expect(useTerminalStore.getState().terminals).toHaveLength(1);
      expect(useTerminalStore.getState().terminals[0]?.id).toBe("term-1");
    });

    it("returns null on error", async () => {
      mockedCommands.createTerminal.mockResolvedValue({
        status: "error",
        error: { TerminalError: "spawn failed" },
      });

      const result = await useTerminalStore
        .getState()
        .createTerminal("proj-1", "/home");

      expect(result).toBeNull();
      expect(useTerminalStore.getState().terminals).toHaveLength(0);
    });
  });

  describe("closeTerminal", () => {
    it("removes terminal from state", async () => {
      useTerminalStore.setState({
        terminals: [
          {
            id: "term-1",
            project_id: "proj-1",
            title: "Terminal",
            cols: 80,
            rows: 24,
          },
        ],
      });
      mockedCommands.closeTerminal.mockResolvedValue({
        status: "ok",
        data: null,
      });

      await useTerminalStore.getState().closeTerminal("term-1");

      expect(useTerminalStore.getState().terminals).toHaveLength(0);
    });
  });

  describe("removeTerminal", () => {
    it("removes terminal from state without backend call", () => {
      useTerminalStore.setState({
        terminals: [
          {
            id: "term-1",
            project_id: "proj-1",
            title: "Terminal",
            cols: 80,
            rows: 24,
          },
        ],
      });

      useTerminalStore.getState().removeTerminal("term-1");

      expect(useTerminalStore.getState().terminals).toHaveLength(0);
      expect(mockedCommands.closeTerminal).not.toHaveBeenCalled();
    });
  });
});
