import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bindings", () => ({
  commands: {
    gitStatus: vi.fn(),
    gitLog: vi.fn(),
    gitBranches: vi.fn(),
    gitDiff: vi.fn(),
    watchProject: vi.fn(),
  },
  events: {
    fsChangeEvent: { listen: vi.fn(() => Promise.resolve(() => {})) },
    gitRefChangedEvent: { listen: vi.fn(() => Promise.resolve(() => {})) },
  },
}));

import { commands } from "../../bindings";
import { useGitStore } from "../gitStore";

const mockedCommands = vi.mocked(commands);

describe("gitStore", () => {
  beforeEach(() => {
    useGitStore.setState({
      fileStatuses: {},
      commits: [],
      branches: [],
      loading: false,
      watchedProjects: new Set(),
      unlisteners: [],
    });
    vi.clearAllMocks();
  });

  describe("fetchStatus", () => {
    it("loads git status for a project", async () => {
      const mockStatuses = [
        { path: "src/main.ts", status: "modified" },
        { path: "new-file.txt", status: "untracked" },
      ];
      mockedCommands.gitStatus.mockResolvedValue({
        status: "ok",
        data: mockStatuses,
      });

      await useGitStore.getState().fetchStatus("proj-1", "/path/to/project");

      expect(mockedCommands.gitStatus).toHaveBeenCalledWith(
        "proj-1",
        "/path/to/project",
      );
      expect(useGitStore.getState().fileStatuses["proj-1"]).toEqual(
        mockStatuses,
      );
    });

    it("does not update on error", async () => {
      mockedCommands.gitStatus.mockResolvedValue({
        status: "error",
        error: { GitError: "not a repo" },
      });

      await useGitStore.getState().fetchStatus("proj-1", "/path");

      expect(useGitStore.getState().fileStatuses["proj-1"]).toBeUndefined();
    });
  });

  describe("fetchLog", () => {
    it("loads commits", async () => {
      const mockCommits = [
        {
          oid: "abc123def456",
          short_oid: "abc123d",
          message: "first commit",
          author: "Test",
          author_email: "test@test.com",
          timestamp: 1700000000,
          parents: [],
          branch_refs: ["main"],
        },
      ];
      mockedCommands.gitLog.mockResolvedValue({
        status: "ok",
        data: mockCommits,
      });

      await useGitStore.getState().fetchLog("proj-1", "/path", 0, 50);

      expect(mockedCommands.gitLog).toHaveBeenCalledWith(
        "proj-1",
        "/path",
        0,
        50,
      );
      expect(useGitStore.getState().commits).toEqual(mockCommits);
      expect(useGitStore.getState().loading).toBe(false);
    });

    it("appends commits when offset > 0", async () => {
      const existing = [
        {
          oid: "first",
          short_oid: "first",
          message: "first",
          author: "A",
          author_email: "",
          timestamp: 1700000000,
          parents: [],
          branch_refs: [],
        },
      ];
      useGitStore.setState({ commits: existing });

      const newCommits = [
        {
          oid: "second",
          short_oid: "second",
          message: "second",
          author: "B",
          author_email: "",
          timestamp: 1699999000,
          parents: [],
          branch_refs: [],
        },
      ];
      mockedCommands.gitLog.mockResolvedValue({
        status: "ok",
        data: newCommits,
      });

      await useGitStore.getState().fetchLog("proj-1", "/path", 1, 50);

      const { commits } = useGitStore.getState();
      expect(commits).toHaveLength(2);
      expect(commits[0]!.oid).toBe("first");
      expect(commits[1]!.oid).toBe("second");
    });
  });

  describe("fetchBranches", () => {
    it("loads branches", async () => {
      const mockBranches = [
        { name: "main", is_head: true, upstream: null, oid: "abc123" },
        {
          name: "feature",
          is_head: false,
          upstream: "origin/feature",
          oid: "def456",
        },
      ];
      mockedCommands.gitBranches.mockResolvedValue({
        status: "ok",
        data: mockBranches,
      });

      await useGitStore.getState().fetchBranches("proj-1", "/path");

      expect(useGitStore.getState().branches).toEqual(mockBranches);
    });
  });

  describe("startWatching", () => {
    it("calls watchProject and tracks project", async () => {
      mockedCommands.watchProject.mockResolvedValue({
        status: "ok",
        data: null,
      });

      await useGitStore.getState().startWatching("proj-1", "/path");

      expect(mockedCommands.watchProject).toHaveBeenCalledWith(
        "proj-1",
        "/path",
      );
      expect(useGitStore.getState().watchedProjects.has("proj-1")).toBe(true);
    });

    it("does not re-watch already watched project", async () => {
      useGitStore.setState({ watchedProjects: new Set(["proj-1"]) });

      await useGitStore.getState().startWatching("proj-1", "/path");

      expect(mockedCommands.watchProject).not.toHaveBeenCalled();
    });
  });
});
