import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bindings", () => ({
  commands: {
    createTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    listTerminals: vi.fn(),
    listProjectTerminals: vi.fn(),
    restoreTerminal: vi.fn(),
  },
}));

import { commands } from "../../bindings";
import { useTerminalStore } from "../terminalStore";

const mockedCommands = vi.mocked(commands);

function makeTerminalInfo(overrides: Record<string, unknown> = {}) {
  return {
    id: "term-1",
    project_id: "proj-1",
    title: "Terminal",
    cols: 80,
    rows: 24,
    cwd: "/home",
    created_at: "2024-01-01T00:00:00Z",
    status: "running",
    scrollback_path: null,
    ...overrides,
  };
}

describe("terminalStore", () => {
  beforeEach(() => {
    useTerminalStore.setState({ terminals: [] });
    vi.clearAllMocks();
  });

  describe("createTerminal", () => {
    it("creates a terminal and adds to state", async () => {
      const termInfo = makeTerminalInfo();
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
        terminals: [makeTerminalInfo()],
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
        terminals: [makeTerminalInfo()],
      });

      useTerminalStore.getState().removeTerminal("term-1");

      expect(useTerminalStore.getState().terminals).toHaveLength(0);
      expect(mockedCommands.closeTerminal).not.toHaveBeenCalled();
    });
  });

  describe("fetchProjectTerminals", () => {
    it("fetches and stores terminals for a project", async () => {
      mockedCommands.listProjectTerminals.mockResolvedValue({
        status: "ok",
        data: [
          makeTerminalInfo({ id: "t1", status: "running" }),
          makeTerminalInfo({ id: "t2", status: "exited" }),
        ],
      });

      const result = await useTerminalStore
        .getState()
        .fetchProjectTerminals("proj-1");

      expect(result).toHaveLength(2);
      expect(useTerminalStore.getState().terminals).toHaveLength(2);
    });

    it("returns empty array on error", async () => {
      mockedCommands.listProjectTerminals.mockResolvedValue({
        status: "error",
        error: { IoError: "failed" },
      });

      const result = await useTerminalStore
        .getState()
        .fetchProjectTerminals("proj-1");

      expect(result).toHaveLength(0);
    });
  });

  describe("restoreTerminal", () => {
    it("restores a terminal and updates state", async () => {
      useTerminalStore.setState({
        terminals: [makeTerminalInfo({ id: "old-term", status: "exited" })],
      });

      const restored = makeTerminalInfo({ id: "new-term", status: "running" });
      mockedCommands.restoreTerminal.mockResolvedValue({
        status: "ok",
        data: restored,
      });

      const result = await useTerminalStore
        .getState()
        .restoreTerminal("old-term");

      expect(result).toEqual(restored);
      // Old terminal (old-term) is replaced by the restored one (new-term)
      expect(useTerminalStore.getState().terminals).toHaveLength(1);
      expect(useTerminalStore.getState().terminals[0]?.id).toBe("new-term");
    });

    it("returns null on error", async () => {
      mockedCommands.restoreTerminal.mockResolvedValue({
        status: "error",
        error: { TerminalNotFound: "old-term" },
      });

      const result = await useTerminalStore
        .getState()
        .restoreTerminal("old-term");

      expect(result).toBeNull();
    });
  });
});
