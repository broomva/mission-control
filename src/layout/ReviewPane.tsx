import { ReviewQueue } from "../components/ReviewQueue";
import { useLayoutStore } from "../stores/layoutStore";

export function ReviewPane() {
  const { rightPaneVisible, toggleRightPane } = useLayoutStore();

  if (!rightPaneVisible) return null;

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
      </div>
    </aside>
  );
}
