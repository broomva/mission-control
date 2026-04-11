import { useCallback, useEffect, useState } from "react";
import { StatusBar } from "../components/StatusBar";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useAgentStore } from "../stores/agentStore";
import { useProjectStore } from "../stores/projectStore";
import { CenterPane } from "./CenterPane";
import { ReviewPane } from "./ReviewPane";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const { fetchProjects } = useProjectStore();
  const { stopAgent } = useAgentStore();
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleSpawnAgent = useCallback(() => {
    setShowSpawnDialog(true);
  }, []);

  const handleCloseAgent = useCallback(
    (id: string) => {
      stopAgent(id);
    },
    [stopAgent],
  );

  useKeyboardShortcuts({
    onSpawnAgent: handleSpawnAgent,
    onCloseAgent: handleCloseAgent,
  });

  return (
    <div className="app-shell">
      <div className="toolbar">
        <span className="toolbar-title">Mission Control</span>
      </div>
      <div className="app-body">
        <Sidebar />
        <CenterPane
          showSpawnDialog={showSpawnDialog}
          onOpenSpawnDialog={handleSpawnAgent}
          onCloseSpawnDialog={() => setShowSpawnDialog(false)}
        />
        <ReviewPane />
      </div>
      <StatusBar />
    </div>
  );
}
