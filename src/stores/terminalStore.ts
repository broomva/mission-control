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
}));
