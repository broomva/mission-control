import { useEffect } from "react";
import { StatusBar } from "../components/StatusBar";
import { useProjectStore } from "../stores/projectStore";
import { CenterPane } from "./CenterPane";
import { ReviewPane } from "./ReviewPane";
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
        <CenterPane />
        <ReviewPane />
      </div>
      <StatusBar />
    </div>
  );
}
