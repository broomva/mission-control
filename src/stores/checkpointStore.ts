import { create } from "zustand";
import type { CheckpointInfo } from "../bindings";
import { commands } from "../bindings";

interface CheckpointState {
  checkpoints: CheckpointInfo[];
  loading: boolean;

  fetchCheckpoints: (projectId: string, path: string) => Promise<void>;
  createCheckpoint: (
    projectId: string,
    path: string,
    description: string,
  ) => Promise<CheckpointInfo | null>;
  rollbackToCheckpoint: (
    projectId: string,
    path: string,
    checkpointId: string,
  ) => Promise<boolean>;
  deleteCheckpoint: (
    projectId: string,
    path: string,
    checkpointId: string,
  ) => Promise<boolean>;
}

export const useCheckpointStore = create<CheckpointState>((set, get) => ({
  checkpoints: [],
  loading: false,

  fetchCheckpoints: async (projectId: string, path: string) => {
    set({ loading: true });
    const result = await commands.listCheckpoints(projectId, path);
    if (result.status === "ok") {
      set({ checkpoints: result.data, loading: false });
    } else {
      set({ loading: false });
    }
  },

  createCheckpoint: async (
    projectId: string,
    path: string,
    description: string,
  ) => {
    const result = await commands.createCheckpoint(
      projectId,
      path,
      description,
      null,
    );
    if (result.status === "ok") {
      get().fetchCheckpoints(projectId, path);
      return result.data;
    }
    return null;
  },

  rollbackToCheckpoint: async (
    projectId: string,
    path: string,
    checkpointId: string,
  ) => {
    const result = await commands.rollbackToCheckpoint(
      projectId,
      path,
      checkpointId,
    );
    if (result.status === "ok") {
      get().fetchCheckpoints(projectId, path);
      return true;
    }
    return false;
  },

  deleteCheckpoint: async (
    projectId: string,
    path: string,
    checkpointId: string,
  ) => {
    const result = await commands.deleteCheckpoint(
      projectId,
      path,
      checkpointId,
    );
    if (result.status === "ok") {
      get().fetchCheckpoints(projectId, path);
      return true;
    }
    return false;
  },
}));
