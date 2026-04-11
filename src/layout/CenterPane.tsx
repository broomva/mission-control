import { useCallback, useEffect, useState } from "react";
import { SpawnAgentDialog } from "../components/SpawnAgentDialog";
import { TileGrid } from "../components/TileGrid";
import { ProjectDashboard } from "../panels/ProjectDashboard";
import { useAgentStore } from "../stores/agentStore";
import { useProjectStore } from "../stores/projectStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";

export function CenterPane() {
  const { activeProjectId } = useProjectStore();
  const { agents, fetchAgents, setupEventListeners } = useAgentStore();
  const { maximizedTileId, restoreGrid } = useTileLayoutStore();
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);

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

  // Escape key exits maximized view
  useEffect(() => {
    if (!maximizedTileId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        restoreGrid();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [maximizedTileId, restoreGrid]);

  const handleSpawnAgent = useCallback(() => {
    setShowSpawnDialog(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setShowSpawnDialog(false);
  }, []);

  // Filter agents by active project
  const projectAgents = activeProjectId
    ? agents.filter((a) => a.project_id === activeProjectId)
    : [];

  return (
    <div className="center-pane">
      {activeProjectId ? (
        <TileGrid agents={projectAgents} onSpawnAgent={handleSpawnAgent} />
      ) : (
        <ProjectDashboard />
      )}

      {showSpawnDialog && <SpawnAgentDialog onClose={handleCloseDialog} />}
    </div>
  );
}
