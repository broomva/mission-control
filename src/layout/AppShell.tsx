import { useEffect } from "react";
import { useProjectStore } from "../stores/projectStore";
import { ContextPanel } from "./ContextPanel";
import { DockviewWrapper } from "./DockviewWrapper";
import { Sidebar } from "./Sidebar";

export function AppShell() {
  const { fetchProjects } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="app-shell">
      <div className="toolbar">
        <span className="toolbar-title">Mission Control</span>
      </div>
      <div className="app-body">
        <Sidebar />
        <div className="dockview-container">
          <DockviewWrapper />
        </div>
        <ContextPanel />
      </div>
    </div>
  );
}
