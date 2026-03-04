import { useEffect } from "react";
import { FileTreeView } from "../components/FileTreeView";
import { GitLogView } from "../components/GitLogView";
import { useGitStore } from "../stores/gitStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";

export function ContextPanel() {
  const { activeProjectId, projects } = useProjectStore();
  const { contextPanelTab, setContextPanelTab } = useLayoutStore();
  const { fileStatuses, fetchStatus, startWatching, setupEventListeners } =
    useGitStore();

  const project = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : null;

  const projectId = project?.id;
  const projectPath = project?.path;

  useEffect(() => {
    if (!projectId || !projectPath) return;
    startWatching(projectId, projectPath);
    fetchStatus(projectId, projectPath);
    setupEventListeners(projectId, projectPath);
  }, [projectId, projectPath, startWatching, fetchStatus, setupEventListeners]);

  if (!project) return null;

  const statuses = fileStatuses[project.id];

  return (
    <aside className="context-panel">
      <div className="context-panel-header">
        <div className="context-panel-tabs">
          <button
            type="button"
            className={`context-panel-tab ${contextPanelTab === "files" ? "context-panel-tab-active" : ""}`}
            onClick={() => setContextPanelTab("files")}
          >
            Files
          </button>
          <button
            type="button"
            className={`context-panel-tab ${contextPanelTab === "git" ? "context-panel-tab-active" : ""}`}
            onClick={() => setContextPanelTab("git")}
          >
            Git
          </button>
        </div>
        <span className="context-panel-project-name">{project.name}</span>
      </div>
      <div className="context-panel-body">
        {contextPanelTab === "files" ? (
          <FileTreeView rootPath={project.path} gitStatuses={statuses} />
        ) : (
          <GitLogView projectId={project.id} projectPath={project.path} />
        )}
      </div>
    </aside>
  );
}
