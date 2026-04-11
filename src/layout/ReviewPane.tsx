import { CheckpointList } from "../components/CheckpointList";
import { ReviewQueue } from "../components/ReviewQueue";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";

export function ReviewPane() {
  const { rightPaneVisible, toggleRightPane } = useLayoutStore();
  const { projects, activeProjectId } = useProjectStore();

  if (!rightPaneVisible) return null;

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <aside className="review-pane">
      <div className="review-pane-header">
        <span className="review-pane-title">Review Queue</span>
        <button
          type="button"
          className="btn btn-toolbar review-pane-collapse-btn"
          onClick={toggleRightPane}
          title="Collapse review pane"
        >
          &rsaquo;
        </button>
      </div>
      <div className="review-pane-body">
        <ReviewQueue />
        {activeProject && (
          <CheckpointList
            projectId={activeProject.id}
            projectPath={activeProject.path}
          />
        )}
      </div>
    </aside>
  );
}
