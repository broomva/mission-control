import { useEffect } from "react";
import { events } from "../bindings";
import { useAgentStore } from "../stores/agentStore";
import { useReviewStore } from "../stores/reviewStore";

/**
 * Listens for agent file_write events and adds ReviewEntries
 * to the review queue.
 *
 * The HookServer emits AgentStatusEvent with event_type "file_write"
 * and a summary like "Write src/auth.rs".
 */
export function useReviewEventListener() {
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      const unlisten = await events.agentStatusEvent.listen((event) => {
        const agentEvent = event.payload.event;
        if (!agentEvent) return;
        if (agentEvent.event_type !== "file_write") return;

        const agentId = agentEvent.agent_id;
        const agents = useAgentStore.getState().agents;
        const agent = agents.find((a) => a.id === agentId);
        const agentName = agent
          ? `${agent.prompt?.slice(0, 30) ?? agent.id} (${agent.agent_type})`
          : agentId;

        // Parse file path from summary like "Write src/auth.rs"
        const summary = agentEvent.summary ?? "";
        const filePath = summary.replace(/^Write\s+/, "") || summary;

        // Parse additions/deletions from detail if available
        // Detail might contain diff-like info; default to 0
        let additions = 0;
        let deletions = 0;
        const detail = agentEvent.detail ?? "";
        const addMatch = detail.match(/\+(\d+)/);
        const delMatch = detail.match(/-(\d+)/);
        if (addMatch) additions = Number.parseInt(addMatch[1] as string, 10);
        if (delMatch) deletions = Number.parseInt(delMatch[1] as string, 10);

        useReviewStore.getState().addEntry({
          agentId,
          agentName,
          filePath,
          additions,
          deletions,
          timestamp: agentEvent.timestamp,
          diffContent: detail || undefined,
        });
      });

      cleanup = unlisten;
    };

    setup();

    return () => {
      cleanup?.();
    };
  }, []);
}
