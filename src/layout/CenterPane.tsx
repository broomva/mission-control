import { useEffect } from "react";
import { SpawnAgentDialog } from "../components/SpawnAgentDialog";
import { TileGrid } from "../components/TileGrid";
import { ProjectDashboard } from "../panels/ProjectDashboard";
import { useAgentStore } from "../stores/agentStore";
import { useProjectStore } from "../stores/projectStore";

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

  // Filter agents by active project
  const projectAgents = activeProjectId
    ? agents.filter((a) => a.project_id === activeProjectId)
    : [];

  return (
    <div className="center-pane">
      {activeProjectId ? (
        <TileGrid agents={projectAgents} onSpawnAgent={onOpenSpawnDialog} />
      ) : (
        <ProjectDashboard />
      )}

      {showSpawnDialog && <SpawnAgentDialog onClose={onCloseSpawnDialog} />}
    </div>
  );
}
