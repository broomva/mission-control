import { useEffect, useState } from "react";
import { AddProjectDialog } from "../components/AddProjectDialog";
import { ProjectCard } from "../components/ProjectCard";
import { useProjectStore } from "../stores/projectStore";

export function ProjectDashboard() {
  const { projects, activeProjectId, fetchProjects, setActiveProject, removeProject } =
    useProjectStore();
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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
          {projects.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              isActive={activeProjectId === project.id}
              onClick={() => setActiveProject(project.id)}
              onRemove={() => removeProject(project.id)}
              style={{ animationDelay: `${index * 50}ms` }}
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
