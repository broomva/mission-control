import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../bindings", () => ({
  commands: {
    spawnAgent: vi.fn(),
    stopAgent: vi.fn(),
    resumeAgent: vi.fn(),
    writeAgent: vi.fn(),
    listAgents: vi.fn(),
    getTimeline: vi.fn(),
  },
  events: {
    agentStatusEvent: { listen: vi.fn().mockResolvedValue(() => {}) },
    agentExitEvent: { listen: vi.fn().mockResolvedValue(() => {}) },
  },
}));

import { commands } from "../../bindings";
import { useAgentStore } from "../agentStore";

const mockedCommands = vi.mocked(commands);

const mockAgent = {
  id: "agent-1",
  project_id: "proj-1",
  agent_type: "claude-code",
  status: "running",
  prompt: "Fix the bug",
  pid: 1234,
  session_id: null,
  token_usage: {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    cost_usd: 0,
  },
  started_at: "2024-01-01T00:00:00Z",
  cwd: "/test",
};

describe("agentStore", () => {
  beforeEach(() => {
    useAgentStore.setState({
      agents: [],
      timeline: [],
      loading: false,
    });
    vi.clearAllMocks();
  });

  describe("spawnAgent", () => {
    it("creates agent and updates store on success", async () => {
      mockedCommands.spawnAgent.mockResolvedValue({
        status: "ok",
        data: mockAgent,
      });

      const result = await useAgentStore
        .getState()
        .spawnAgent("proj-1", "claude-code", "Fix the bug", "/test");

      expect(result).toEqual(mockAgent);
      expect(useAgentStore.getState().agents).toHaveLength(1);
      expect(useAgentStore.getState().agents[0]?.id).toBe("agent-1");
    });

    it("returns null on error", async () => {
      mockedCommands.spawnAgent.mockResolvedValue({
        status: "error",
        error: { AgentError: "spawn failed" },
      });

      const result = await useAgentStore
        .getState()
        .spawnAgent("proj-1", "claude-code", null, "/test");

      expect(result).toBeNull();
      expect(useAgentStore.getState().agents).toHaveLength(0);
    });
  });

  describe("stopAgent", () => {
    it("calls stop command and updates status", async () => {
      useAgentStore.setState({ agents: [mockAgent] });
      mockedCommands.stopAgent.mockResolvedValue({
        status: "ok",
        data: null,
      });

      await useAgentStore.getState().stopAgent("agent-1");

      expect(mockedCommands.stopAgent).toHaveBeenCalledWith("agent-1");
      expect(useAgentStore.getState().agents[0]?.status).toBe("stopped");
    });
  });

  describe("fetchAgents", () => {
    it("populates agents array on success", async () => {
      mockedCommands.listAgents.mockResolvedValue({
        status: "ok",
        data: [mockAgent],
      });

      await useAgentStore.getState().fetchAgents("proj-1");

      expect(useAgentStore.getState().agents).toEqual([mockAgent]);
      expect(useAgentStore.getState().loading).toBe(false);
    });

    it("handles error gracefully", async () => {
      mockedCommands.listAgents.mockResolvedValue({
        status: "error",
        error: { AgentError: "list failed" },
      });

      await useAgentStore.getState().fetchAgents("proj-1");

      expect(useAgentStore.getState().agents).toEqual([]);
      expect(useAgentStore.getState().loading).toBe(false);
    });
  });

  describe("fetchTimeline", () => {
    it("populates timeline array on success", async () => {
      const mockEvent = {
        agent_id: "agent-1",
        project_id: "proj-1",
        timestamp: "2024-01-01T00:00:00Z",
        event_type: "tool_use",
        summary: "Using tool: Read",
        detail: null,
      };
      mockedCommands.getTimeline.mockResolvedValue({
        status: "ok",
        data: [mockEvent],
      });

      await useAgentStore.getState().fetchTimeline("proj-1");

      expect(useAgentStore.getState().timeline).toEqual([mockEvent]);
    });
  });
});
