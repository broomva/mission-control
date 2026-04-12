import { useCallback, useEffect, useState } from "react";
import { CredentialSettings } from "../components/CredentialSettings";
import { ResizableSplitter } from "../components/ResizableSplitter";
import { StatusBar } from "../components/StatusBar";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useAgentStore } from "../stores/agentStore";
import { useGitStore } from "../stores/gitStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";
import { CenterPane } from "./CenterPane";
import { FileExplorer } from "./FileExplorer";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function AppShell() {
  const { fetchProjects, projects, activeProjectId } = useProjectStore();
  const { branches } = useGitStore();
  const { stopAgent } = useAgentStore();
  const {
    sidebarWidth,
    fileExplorerWidth,
    leftPaneVisible,
    rightPaneVisible,
    toggleRightPane,
    setSidebarWidth,
    setFileExplorerWidth,
    saveLayout,
  } = useLayoutStore();
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

  const handleSidebarResize = useCallback(
    (delta: number) => {
      setSidebarWidth(sidebarWidth + delta);
      saveLayout();
    },
    [sidebarWidth, setSidebarWidth, saveLayout],
  );

  const handleExplorerResize = useCallback(
    (delta: number) => {
      // Negative delta = moving left = wider explorer
      setFileExplorerWidth(fileExplorerWidth - delta);
      saveLayout();
    },
    [fileExplorerWidth, setFileExplorerWidth, saveLayout],
  );

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const currentBranch = branches.find((b) => b.is_head);

  return (
    <div className="app-shell">
      <header className="app-header">
        {activeProject ? (
          <div className="app-header-breadcrumb">
            <span className="breadcrumb-icon">&#8601;</span>
            <span className="breadcrumb-project">{activeProject.name}</span>
            <span className="breadcrumb-separator">&gt;</span>
            <button type="button" className="breadcrumb-branch">
              {currentBranch?.name || "main"}
              <span className="breadcrumb-chevron">&#711;</span>
            </button>
          </div>
        ) : (
          <span className="app-header-title">Mission Control</span>
        )}
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
        <WorkspaceSidebar style={{ width: sidebarWidth }} />
        {leftPaneVisible && (
          <ResizableSplitter position="left" onResize={handleSidebarResize} />
        )}
        <CenterPane
          showSpawnDialog={showSpawnDialog}
          onOpenSpawnDialog={handleSpawnAgent}
          onCloseSpawnDialog={() => setShowSpawnDialog(false)}
        />
        {rightPaneVisible ? (
          <>
            <ResizableSplitter
              position="right"
              onResize={handleExplorerResize}
            />
            <FileExplorer style={{ width: fileExplorerWidth }} />
          </>
        ) : (
          <button
            type="button"
            className="pane-toggle-rail"
            onClick={toggleRightPane}
            title="Show explorer"
            aria-label="Show explorer"
          >
            &#8249;
          </button>
        )}
      </div>
      <StatusBar />
      {showCredentialSettings && (
        <CredentialSettings onClose={() => setShowCredentialSettings(false)} />
      )}
    </div>
  );
}
