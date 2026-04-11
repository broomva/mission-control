import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bindings", () => ({
  commands: {
    listCheckpoints: vi.fn(),
    createCheckpoint: vi.fn(),
    rollbackToCheckpoint: vi.fn(),
    deleteCheckpoint: vi.fn(),
  },
}));

import { commands } from "../../bindings";
import { useCheckpointStore } from "../checkpointStore";

const mockedCommands = vi.mocked(commands);

const makeCheckpoint = (overrides: Record<string, unknown> = {}) => ({
  id: "cp-1",
  project_id: "proj-1",
  agent_id: null as string | null,
  description: "Before Write: auth.rs",
  commit_oid: "abc1234def5678",
  timestamp: "2026-04-10T10:42:00Z",
  ...overrides,
});

describe("checkpointStore", () => {
  beforeEach(() => {
    useCheckpointStore.setState({
      checkpoints: [],
      loading: false,
    });
    vi.clearAllMocks();
  });

  describe("fetchCheckpoints", () => {
    it("loads checkpoints for a project", async () => {
      const mockCheckpoints = [makeCheckpoint()];
      mockedCommands.listCheckpoints.mockResolvedValue({
        status: "ok",
        data: mockCheckpoints,
      });

      await useCheckpointStore
        .getState()
        .fetchCheckpoints("proj-1", "/path/to/project");

      expect(mockedCommands.listCheckpoints).toHaveBeenCalledWith(
        "proj-1",
        "/path/to/project",
      );
      expect(useCheckpointStore.getState().checkpoints).toEqual(
        mockCheckpoints,
      );
      expect(useCheckpointStore.getState().loading).toBe(false);
    });

    it("does not update on error", async () => {
      mockedCommands.listCheckpoints.mockResolvedValue({
        status: "error",
        error: { GitError: "not a repo" },
      });

      await useCheckpointStore.getState().fetchCheckpoints("proj-1", "/path");

      expect(useCheckpointStore.getState().checkpoints).toEqual([]);
      expect(useCheckpointStore.getState().loading).toBe(false);
    });
  });

  describe("createCheckpoint", () => {
    it("creates a checkpoint and refreshes list", async () => {
      const newCp = makeCheckpoint({ id: "cp-new" });
      mockedCommands.createCheckpoint.mockResolvedValue({
        status: "ok",
        data: newCp,
      });
      mockedCommands.listCheckpoints.mockResolvedValue({
        status: "ok",
        data: [newCp],
      });

      const result = await useCheckpointStore
        .getState()
        .createCheckpoint("proj-1", "/path", "manual checkpoint");

      expect(mockedCommands.createCheckpoint).toHaveBeenCalledWith(
        "proj-1",
        "/path",
        "manual checkpoint",
        null,
      );
      expect(result).toEqual(newCp);
    });

    it("returns null on error", async () => {
      mockedCommands.createCheckpoint.mockResolvedValue({
        status: "error",
        error: { GitError: "failed" },
      });

      const result = await useCheckpointStore
        .getState()
        .createCheckpoint("proj-1", "/path", "test");

      expect(result).toBeNull();
    });
  });

  describe("rollbackToCheckpoint", () => {
    it("calls rollback and refreshes list", async () => {
      mockedCommands.rollbackToCheckpoint.mockResolvedValue({
        status: "ok",
        data: null,
      });
      mockedCommands.listCheckpoints.mockResolvedValue({
        status: "ok",
        data: [],
      });

      const result = await useCheckpointStore
        .getState()
        .rollbackToCheckpoint("proj-1", "/path", "cp-1");

      expect(mockedCommands.rollbackToCheckpoint).toHaveBeenCalledWith(
        "proj-1",
        "/path",
        "cp-1",
      );
      expect(result).toBe(true);
    });

    it("returns false on error", async () => {
      mockedCommands.rollbackToCheckpoint.mockResolvedValue({
        status: "error",
        error: { GitError: "not found" },
      });

      const result = await useCheckpointStore
        .getState()
        .rollbackToCheckpoint("proj-1", "/path", "nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("deleteCheckpoint", () => {
    it("deletes a checkpoint and refreshes list", async () => {
      useCheckpointStore.setState({
        checkpoints: [makeCheckpoint()],
      });

      mockedCommands.deleteCheckpoint.mockResolvedValue({
        status: "ok",
        data: null,
      });
      mockedCommands.listCheckpoints.mockResolvedValue({
        status: "ok",
        data: [],
      });

      const result = await useCheckpointStore
        .getState()
        .deleteCheckpoint("proj-1", "/path", "cp-1");

      expect(mockedCommands.deleteCheckpoint).toHaveBeenCalledWith(
        "proj-1",
        "/path",
        "cp-1",
      );
      expect(result).toBe(true);
    });

    it("returns false on error", async () => {
      mockedCommands.deleteCheckpoint.mockResolvedValue({
        status: "error",
        error: { GitError: "not found" },
      });

      const result = await useCheckpointStore
        .getState()
        .deleteCheckpoint("proj-1", "/path", "nonexistent");

      expect(result).toBe(false);
    });
  });
});
