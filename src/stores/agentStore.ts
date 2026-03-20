import { create } from "zustand";
import { type AgentEvent, type AgentInfo, commands, events } from "../bindings";

interface AgentState {
  agents: AgentInfo[];
  timeline: AgentEvent[];
  loading: boolean;

  spawnAgent: (
    projectId: string,
    agentType: string,
    prompt: string | null,
    cwd: string,
  ) => Promise<AgentInfo | null>;
  stopAgent: (agentId: string) => Promise<void>;
  resumeAgent: (agentId: string) => Promise<AgentInfo | null>;
  writeAgent: (agentId: string, data: number[]) => Promise<void>;
  fetchAgents: (projectId?: string) => Promise<void>;
  fetchTimeline: (
    projectId: string,
    offset?: number,
    limit?: number,
  ) => Promise<void>;
  setupEventListeners: () => Promise<() => void>;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  timeline: [],
  loading: false,

  spawnAgent: async (projectId, agentType, prompt, cwd) => {
    const result = await commands.spawnAgent(projectId, agentType, prompt, cwd);
    if (result.status === "ok") {
      set((state) => ({ agents: [...state.agents, result.data] }));
      return result.data;
    }
    return null;
  },

  stopAgent: async (agentId) => {
    await commands.stopAgent(agentId);
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, status: "stopped" } : a,
      ),
    }));
  },

  resumeAgent: async (agentId) => {
    const result = await commands.resumeAgent(agentId);
    if (result.status === "ok") {
      set((state) => ({ agents: [...state.agents, result.data] }));
      return result.data;
    }
    return null;
  },

  writeAgent: async (agentId, data) => {
    await commands.writeAgent(agentId, data);
  },

  fetchAgents: async (projectId) => {
    set({ loading: true });
    const result = await commands.listAgents(projectId ?? null);
    if (result.status === "ok") {
      set({ agents: result.data, loading: false });
    } else {
      set({ loading: false });
    }
  },

  fetchTimeline: async (projectId, offset = 0, limit = 200) => {
    const result = await commands.getTimeline(projectId, offset, limit);
    if (result.status === "ok") {
      set({ timeline: result.data });
    }
  },

  setupEventListeners: async () => {
    const unlisteners: (() => void)[] = [];

    const unlistenStatus = await events.agentStatusEvent.listen((event) => {
      const {
        agent_id,
        status,
        event: agentEvent,
        token_usage,
      } = event.payload;

      // Update agent status and token_usage
      set((state) => ({
        agents: state.agents.map((a) => {
          if (a.id !== agent_id) return a;
          const updates: Partial<AgentInfo> = { status };
          if (token_usage) {
            updates.token_usage = token_usage;
          }
          return { ...a, ...updates };
        }),
      }));

      // Append event to timeline if present
      if (agentEvent) {
        set((state) => ({
          timeline: [...state.timeline, agentEvent],
        }));
      }
    });
    unlisteners.push(unlistenStatus);

    const unlistenExit = await events.agentExitEvent.listen((event) => {
      const { agent_id } = event.payload;
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id
            ? {
                ...a,
                status: a.status === "stopped" ? "stopped" : "completed",
              }
            : a,
        ),
      }));
    });
    unlisteners.push(unlistenExit);

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  },
}));
