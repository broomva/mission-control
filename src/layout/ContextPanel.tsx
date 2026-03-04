import { FileTreeView } from "../components/FileTreeView";
import { GitGraphPlaceholder } from "../components/GitGraphPlaceholder";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";

export function ContextPanel() {
  const { activeProjectId, projects } = useProjectStore();
  const { contextPanelTab, setContextPanelTab } = useLayoutStore();

  if (!activeProjectId) return null;

  const project = projects.find((p) => p.id === activeProjectId);
  if (!project) return null;

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
          <FileTreeView rootPath={project.path} />
        ) : (
          <GitGraphPlaceholder />
        )}
      </div>
    </aside>
  );
}
