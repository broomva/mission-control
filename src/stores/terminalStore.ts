import { create } from "zustand";
import type { TerminalInfo } from "../bindings";
import { commands } from "../bindings";

interface TerminalState {
  terminals: TerminalInfo[];
  createTerminal: (
    projectId: string,
    cwd: string,
  ) => Promise<TerminalInfo | null>;
  closeTerminal: (id: string) => Promise<void>;
  removeTerminal: (id: string) => void;
  fetchProjectTerminals: (projectId: string) => Promise<TerminalInfo[]>;
  restoreTerminal: (
    id: string,
    cols?: number,
    rows?: number,
  ) => Promise<TerminalInfo | null>;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  terminals: [],

  createTerminal: async (projectId: string, cwd: string) => {
    const result = await commands.createTerminal(projectId, cwd, 80, 24);
    if (result.status === "ok") {
      set((state) => ({
        terminals: [...state.terminals, result.data],
      }));
      return result.data;
    }
    return null;
  },

  closeTerminal: async (id: string) => {
    await commands.closeTerminal(id);
    set((state) => ({
      terminals: state.terminals.filter((t) => t.id !== id),
    }));
  },

  removeTerminal: (id: string) => {
    set((state) => ({
      terminals: state.terminals.filter((t) => t.id !== id),
    }));
  },

  fetchProjectTerminals: async (projectId: string) => {
    const result = await commands.listProjectTerminals(projectId);
    if (result.status === "ok") {
      set((state) => {
        const otherTerminals = state.terminals.filter(
          (t) => t.project_id !== projectId,
        );
        return { terminals: [...otherTerminals, ...result.data] };
      });
      return result.data;
    }
    return [];
  },

  restoreTerminal: async (id: string, cols: number = 80, rows: number = 24) => {
    const result = await commands.restoreTerminal(id, cols, rows);
    if (result.status === "ok") {
      set((state) => ({
        terminals: [...state.terminals.filter((t) => t.id !== id), result.data],
      }));
      return result.data;
    }
    return null;
  },
}));
