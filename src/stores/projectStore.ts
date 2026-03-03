import { create } from "zustand";
import type { Project } from "../bindings";
import { commands } from "../bindings";

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  loading: boolean;
  fetchProjects: () => Promise<void>;
  addProject: (name: string, path: string) => Promise<Project | null>;
  removeProject: (id: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProjectId: null,
  loading: false,

  fetchProjects: async () => {
    set({ loading: true });
    const result = await commands.listProjects();
    if (result.status === "ok") {
      set({ projects: result.data, loading: false });
    } else {
      set({ loading: false });
    }
  },

  addProject: async (name: string, path: string) => {
    const result = await commands.addProject(name, path);
    if (result.status === "ok") {
      set((state) => ({
        projects: [...state.projects, result.data],
      }));
      return result.data;
    }
    return null;
  },

  removeProject: async (id: string) => {
    const result = await commands.removeProject(id);
    if (result.status === "ok") {
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        activeProjectId:
          state.activeProjectId === id ? null : state.activeProjectId,
      }));
    }
  },

  setActiveProject: (id: string | null) => {
    set({ activeProjectId: id });
  },
}));
