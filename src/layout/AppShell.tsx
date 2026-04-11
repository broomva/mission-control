import { useCallback, useEffect, useState } from "react";
import { CredentialSettings } from "../components/CredentialSettings";
import { StatusBar } from "../components/StatusBar";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useAgentStore } from "../stores/agentStore";
import { useProjectStore } from "../stores/projectStore";
import { CenterPane } from "./CenterPane";
import { FileExplorer } from "./FileExplorer";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function AppShell() {
  const { fetchProjects } = useProjectStore();
  const { stopAgent } = useAgentStore();
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);
  const [showCredentialSettings, setShowCredentialSettings] = useState(false);

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
      <header className="app-header">
        <span className="app-header-title">Mission Control</span>
        <div className="app-header-actions">
          <button
            className="app-header-settings"
            onClick={() => setShowCredentialSettings(true)}
            title="Settings"
            type="button"
          >
            &#9881;
          </button>
        </div>
      </header>
      <div className="app-body">
        <WorkspaceSidebar />
        <CenterPane
          showSpawnDialog={showSpawnDialog}
          onOpenSpawnDialog={handleSpawnAgent}
          onCloseSpawnDialog={() => setShowSpawnDialog(false)}
        />
        <FileExplorer />
      </div>
      <StatusBar />
      {showCredentialSettings && (
        <CredentialSettings onClose={() => setShowCredentialSettings(false)} />
      )}
    </div>
  );
}
