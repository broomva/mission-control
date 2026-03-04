import type { Project } from "../bindings";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";

interface ProjectCardProps {
  project: Project;
  onOpenTerminal: () => void;
}

export function ProjectCard({ project, onOpenTerminal }: ProjectCardProps) {
  const { removeProject } = useProjectStore();
  const { openProjectWorkspace } = useLayoutStore();

  return (
    <div className="project-card">
      <div className="project-card-header">
        <h3>{project.name}</h3>
      </div>
      <p className="project-path">{project.path}</p>
      <div className="project-card-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            openProjectWorkspace(project.id, project.name, project.path)
          }
        >
          Open
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onOpenTerminal}
        >
          + Terminal
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => removeProject(project.id)}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
