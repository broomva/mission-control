import { useState } from "react";
import { AddProjectDialog } from "../components/AddProjectDialog";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";

export function Sidebar() {
  const { projects, activeProjectId, setActiveProject } = useProjectStore();
  const { addDashboardPanel, openProjectWorkspace } = useLayoutStore();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleProjectClick = (project: (typeof projects)[number]) => {
    if (activeProjectId === project.id) {
      // Deselect — hides context panel
      setActiveProject(null);
    } else {
      setActiveProject(project.id);
      openProjectWorkspace(project.id, project.name, project.path);
    }
  };

  const handleAllProjects = () => {
    setActiveProject(null);
    addDashboardPanel();
  };

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-label">Projects</span>
          <button
            type="button"
            className="btn btn-toolbar sidebar-add-btn"
            onClick={() => setShowAddDialog(true)}
            title="Add Project"
          >
            +
          </button>
        </div>
        <nav className="sidebar-nav">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={`sidebar-item ${activeProjectId === project.id ? "sidebar-item-active" : ""}`}
              onClick={() => handleProjectClick(project)}
              title={project.path}
            >
              <span className="sidebar-item-icon">
                {activeProjectId === project.id ? "\u25C9" : "\u25CB"}
              </span>
              <span className="sidebar-item-name">{project.name}</span>
            </button>
          ))}
          {projects.length === 0 && (
            <div className="sidebar-empty">No projects</div>
          )}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="btn btn-toolbar sidebar-footer-btn"
            onClick={handleAllProjects}
          >
            All Projects
          </button>
        </div>
      </aside>
      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}
    </>
  );
}
