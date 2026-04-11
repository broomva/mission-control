import { useEffect, useRef } from "react";
import { SpawnAgentDialog } from "../components/SpawnAgentDialog";
import { TileGrid } from "../components/TileGrid";
import { WorkspaceWelcome } from "../components/WorkspaceWelcome";
import { useReviewEventListener } from "../hooks/useReviewEventListener";
import { ProjectDashboard } from "../panels/ProjectDashboard";
import { useAgentStore } from "../stores/agentStore";
import { useProjectStore } from "../stores/projectStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";

interface CenterPaneProps {
  showSpawnDialog: boolean;
  onOpenSpawnDialog: () => void;
  onCloseSpawnDialog: () => void;
}

export function CenterPane({
  showSpawnDialog,
  onOpenSpawnDialog,
  onCloseSpawnDialog,
}: CenterPaneProps) {
  const { activeProjectId } = useProjectStore();
  const { agents, fetchAgents, setupEventListeners } = useAgentStore();
  const { addToSplit } = useTileLayoutStore();

  // Wire agent file_write events to review queue
  useReviewEventListener();

  // Fetch agents when the active project changes
  useEffect(() => {
    if (activeProjectId) {
      fetchAgents(activeProjectId);
    }
  }, [activeProjectId, fetchAgents]);

  // Set up global agent event listeners
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    setupEventListeners().then((unsub) => {
      cleanup = unsub;
    });
    return () => {
      cleanup?.();
    };
  }, [setupEventListeners]);

  // Auto-add new agents to split layout (only when agents array changes)
  const prevAgentIdsRef = useRef<string[]>([]);
  useEffect(() => {
    if (!activeProjectId) return;
    const projectAgents = agents.filter(
      (a) => a.project_id === activeProjectId,
    );
    const currentIds = projectAgents.map((a) => a.id);
    const prevIds = prevAgentIdsRef.current;

    // Only process genuinely new agents (not already tracked)
    const newIds = currentIds.filter((id) => !prevIds.includes(id));
    prevAgentIdsRef.current = currentIds;

    for (const id of newIds) {
      const layout = useTileLayoutStore.getState().splitLayout;
      if (layout) {
        const existingIds = collectIds(layout);
        if (!existingIds.includes(id)) {
          addToSplit(id);
        }
      } else {
        addToSplit(id);
      }
    }
  }, [agents, activeProjectId, addToSplit]);

  // Filter agents by active project
  const projectAgents = activeProjectId
    ? agents.filter((a) => a.project_id === activeProjectId)
    : [];

  // If no project selected, show dashboard
  if (!activeProjectId) {
    return (
      <div className="center-pane">
        <ProjectDashboard />
        {showSpawnDialog && <SpawnAgentDialog onClose={onCloseSpawnDialog} />}
      </div>
    );
  }

  // If project selected but no agents, show welcome
  if (projectAgents.length === 0) {
    return (
      <div className="center-pane">
        <WorkspaceWelcome onSpawnAgent={onOpenSpawnDialog} />
        {showSpawnDialog && <SpawnAgentDialog onClose={onCloseSpawnDialog} />}
      </div>
    );
  }

  // Agents exist — show the draggable tile layout
  return (
    <div className="center-pane">
      <TileGrid agents={projectAgents} onSpawnAgent={onOpenSpawnDialog} />
      {showSpawnDialog && <SpawnAgentDialog onClose={onCloseSpawnDialog} />}
    </div>
  );
}

/** Collect all agent IDs from a layout tree */
function collectIds(
  node: import("../stores/tileLayoutStore").LayoutNode,
): string[] {
  if (node.type === "leaf") return [node.agentId];
  return [...collectIds(node.first), ...collectIds(node.second)];
}
