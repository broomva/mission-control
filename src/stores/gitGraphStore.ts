import { create } from "zustand";
import type { CommitDetail, GitGraphData } from "../bindings";
import { commands } from "../bindings";

interface GitGraphState {
  graphData: GitGraphData | null;
  selectedCommit: CommitDetail | null;
  loading: boolean;

  fetchGraph: (
    projectId: string,
    path: string,
    maxCount?: number,
  ) => Promise<void>;
  selectCommit: (
    projectId: string,
    path: string,
    sha: string,
  ) => Promise<void>;
  clearSelection: () => void;
}

export const useGitGraphStore = create<GitGraphState>((set) => ({
  graphData: null,
  selectedCommit: null,
  loading: false,

  fetchGraph: async (
    projectId: string,
    path: string,
    maxCount?: number,
  ) => {
    set({ loading: true });
    const result = await commands.gitGraph(
      projectId,
      path,
      maxCount ?? 500,
    );
    if (result.status === "ok") {
      set({ graphData: result.data, loading: false });
    } else {
      set({ graphData: null, loading: false });
    }
  },

  selectCommit: async (projectId: string, path: string, sha: string) => {
    const result = await commands.gitCommitDetail(projectId, path, sha);
    if (result.status === "ok") {
      set({ selectedCommit: result.data });
    }
  },

  clearSelection: () => {
    set({ selectedCommit: null });
  },
}));
