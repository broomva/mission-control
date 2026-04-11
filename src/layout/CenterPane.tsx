import { ProjectDashboard } from "../panels/ProjectDashboard";
import { useProjectStore } from "../stores/projectStore";

export function CenterPane() {
  const { activeProjectId } = useProjectStore();

  return (
    <div className="center-pane">
      {activeProjectId ? (
        <div className="empty-state">
          <p>Agents will appear here.</p>
          <p>Select an agent tile to get started.</p>
        </div>
      ) : (
        <ProjectDashboard />
      )}
    </div>
  );
}
