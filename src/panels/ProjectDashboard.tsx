import { useEffect, useState } from "react";
import { AddProjectDialog } from "../components/AddProjectDialog";
import { ProjectCard } from "../components/ProjectCard";
import { useProjectStore } from "../stores/projectStore";
import { useTerminalStore } from "../stores/terminalStore";

export function ProjectDashboard() {
  const { projects, fetchProjects } = useProjectStore();
  const { createTerminal } = useTerminalStore();
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleOpenTerminal = async (_projectId: string, cwd: string) => {
    await createTerminal(_projectId, cwd);
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Projects</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowAddDialog(true)}
        >
          + Add Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <p>No projects yet.</p>
          <p>Add a project directory to get started.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowAddDialog(true)}
          >
            Add Your First Project
          </button>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpenTerminal={() =>
                handleOpenTerminal(project.id, project.path)
              }
            />
          ))}
        </div>
      )}

      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}
    </div>
  );
}
