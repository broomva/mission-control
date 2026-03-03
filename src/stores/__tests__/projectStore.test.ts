import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bindings", () => ({
  commands: {
    listProjects: vi.fn(),
    addProject: vi.fn(),
    removeProject: vi.fn(),
    getProject: vi.fn(),
  },
}));

import { commands } from "../../bindings";
import { useProjectStore } from "../projectStore";

const mockedCommands = vi.mocked(commands);

describe("projectStore", () => {
  beforeEach(() => {
    // Reset store state between tests
    useProjectStore.setState({
      projects: [],
      activeProjectId: null,
      loading: false,
    });
    vi.clearAllMocks();
  });

  describe("fetchProjects", () => {
    it("loads projects from backend", async () => {
      const mockProjects = [
        { id: "1", name: "alpha", path: "/alpha", created_at: "2024-01-01" },
      ];
      mockedCommands.listProjects.mockResolvedValue({
        status: "ok",
        data: mockProjects,
      });

      await useProjectStore.getState().fetchProjects();

      expect(useProjectStore.getState().projects).toEqual(mockProjects);
      expect(useProjectStore.getState().loading).toBe(false);
    });

    it("sets loading false on error", async () => {
      mockedCommands.listProjects.mockResolvedValue({
        status: "error",
        error: { IoError: "disk failed" },
      });

      await useProjectStore.getState().fetchProjects();

      expect(useProjectStore.getState().projects).toEqual([]);
      expect(useProjectStore.getState().loading).toBe(false);
    });
  });

  describe("addProject", () => {
    it("adds a project to state on success", async () => {
      const newProject = {
        id: "2",
        name: "beta",
        path: "/beta",
        created_at: "2024-01-02",
      };
      mockedCommands.addProject.mockResolvedValue({
        status: "ok",
        data: newProject,
      });

      const result = await useProjectStore
        .getState()
        .addProject("beta", "/beta");

      expect(result).toEqual(newProject);
      expect(useProjectStore.getState().projects).toHaveLength(1);
      expect(useProjectStore.getState().projects[0]?.name).toBe("beta");
    });

    it("returns null on error", async () => {
      mockedCommands.addProject.mockResolvedValue({
        status: "error",
        error: { ProjectAlreadyExists: "/beta" },
      });

      const result = await useProjectStore
        .getState()
        .addProject("beta", "/beta");

      expect(result).toBeNull();
      expect(useProjectStore.getState().projects).toHaveLength(0);
    });
  });

  describe("removeProject", () => {
    it("removes project from state", async () => {
      useProjectStore.setState({
        projects: [
          { id: "1", name: "alpha", path: "/alpha", created_at: "2024-01-01" },
        ],
        activeProjectId: "1",
      });
      mockedCommands.removeProject.mockResolvedValue({
        status: "ok",
        data: {
          id: "1",
          name: "alpha",
          path: "/alpha",
          created_at: "2024-01-01",
        },
      });

      await useProjectStore.getState().removeProject("1");

      expect(useProjectStore.getState().projects).toHaveLength(0);
      expect(useProjectStore.getState().activeProjectId).toBeNull();
    });
  });

  describe("setActiveProject", () => {
    it("sets the active project id", () => {
      useProjectStore.getState().setActiveProject("proj-42");
      expect(useProjectStore.getState().activeProjectId).toBe("proj-42");
    });

    it("clears active project when set to null", () => {
      useProjectStore.setState({ activeProjectId: "proj-42" });
      useProjectStore.getState().setActiveProject(null);
      expect(useProjectStore.getState().activeProjectId).toBeNull();
    });
  });
});
