import { create } from "zustand";
import type {
  BranchInfo,
  CommitInfo,
  FileStatusEntry,
  WorktreeInfo,
} from "../bindings";
import { commands, events } from "../bindings";

interface GitState {
  fileStatuses: Record<string, FileStatusEntry[]>;
  commits: CommitInfo[];
  branches: BranchInfo[];
  worktrees: Record<string, WorktreeInfo[]>;
  loading: boolean;
  watchedProjects: Set<string>;
  unlisteners: Array<() => void>;

  fetchStatus: (projectId: string, path: string) => Promise<void>;
  fetchLog: (
    projectId: string,
    path: string,
    offset?: number,
    limit?: number,
  ) => Promise<void>;
  fetchBranches: (projectId: string, path: string) => Promise<void>;
  fetchWorktrees: (projectId: string, path: string) => Promise<void>;
  createWorktree: (
    projectId: string,
    path: string,
    name: string,
    branch: string,
  ) => Promise<WorktreeInfo | null>;
  removeWorktree: (
    projectId: string,
    path: string,
    name: string,
  ) => Promise<boolean>;
  startWatching: (projectId: string, path: string) => Promise<void>;
  setupEventListeners: (projectId: string, path: string) => Promise<void>;
  cleanup: () => void;
}

export const useGitStore = create<GitState>((set, get) => ({
  fileStatuses: {},
  commits: [],
  branches: [],
  worktrees: {},
  loading: false,
  watchedProjects: new Set(),
  unlisteners: [],

  fetchStatus: async (projectId: string, path: string) => {
    const result = await commands.gitStatus(projectId, path);
    if (result.status === "ok") {
      set((state) => ({
        fileStatuses: {
          ...state.fileStatuses,
          [projectId]: result.data,
        },
      }));
    }
  },

  fetchLog: async (projectId: string, path: string, offset = 0, limit = 50) => {
    set({ loading: true });
    const result = await commands.gitLog(projectId, path, offset, limit);
    if (result.status === "ok") {
      set((state) => ({
        commits:
          offset === 0 ? result.data : [...state.commits, ...result.data],
        loading: false,
      }));
    } else {
      set({ loading: false });
    }
  },

  fetchBranches: async (projectId: string, path: string) => {
    const result = await commands.gitBranches(projectId, path);
    if (result.status === "ok") {
      set({ branches: result.data });
    }
  },

  fetchWorktrees: async (projectId: string, path: string) => {
    const result = await commands.listWorktrees(projectId, path);
    if (result.status === "ok") {
      set((state) => ({
        worktrees: {
          ...state.worktrees,
          [projectId]: result.data,
        },
      }));
    }
  },

  createWorktree: async (
    projectId: string,
    path: string,
    name: string,
    branch: string,
  ) => {
    const result = await commands.createWorktree(projectId, path, name, branch);
    if (result.status === "ok") {
      // Refresh the worktree list
      get().fetchWorktrees(projectId, path);
      return result.data;
    }
    return null;
  },

  removeWorktree: async (
    projectId: string,
    path: string,
    name: string,
  ) => {
    const result = await commands.removeWorktree(projectId, path, name);
    if (result.status === "ok") {
      // Refresh the worktree list
      get().fetchWorktrees(projectId, path);
      return true;
    }
    return false;
  },

  startWatching: async (projectId: string, path: string) => {
    const { watchedProjects } = get();
    if (watchedProjects.has(projectId)) return;

    await commands.watchProject(projectId, path);
    set((state) => {
      const newWatched = new Set(state.watchedProjects);
      newWatched.add(projectId);
      return { watchedProjects: newWatched };
    });
  },

  setupEventListeners: async (projectId: string, path: string) => {
    const { unlisteners } = get();

    // Clean up previous listeners
    for (const unlisten of unlisteners) {
      unlisten();
    }

    const newUnlisteners: Array<() => void> = [];

    const unlistenFs = await events.fsChangeEvent.listen((event) => {
      if (event.payload.project_id === projectId) {
        get().fetchStatus(projectId, path);
      }
    });
    newUnlisteners.push(unlistenFs);

    const unlistenRef = await events.gitRefChangedEvent.listen((event) => {
      if (event.payload.project_id === projectId) {
        get().fetchStatus(projectId, path);
        get().fetchLog(projectId, path);
        get().fetchBranches(projectId, path);
      }
    });
    newUnlisteners.push(unlistenRef);

    set({ unlisteners: newUnlisteners });
  },

  cleanup: () => {
    const { unlisteners } = get();
    for (const unlisten of unlisteners) {
      unlisten();
    }
    set({ unlisteners: [] });
  },
}));
