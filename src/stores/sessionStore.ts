import { create } from "zustand";
import { type ClaudeSession, commands } from "../bindings";

interface SessionState {
  sessions: ClaudeSession[];
  loading: boolean;
  fetchSessions: (limit?: number) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  loading: false,

  fetchSessions: async (limit = 20) => {
    set({ loading: true });
    try {
      const result = await commands.listClaudeSessions(limit);
      if (result.status === "ok") {
        set({ sessions: result.data, loading: false });
      } else {
        console.error("[sessionStore] listClaudeSessions error:", result.error);
        set({ loading: false });
      }
    } catch (e) {
      console.error("[sessionStore] listClaudeSessions threw:", e);
      set({ loading: false });
    }
  },
}));
