import { useEffect, useState } from "react";
import { CheckpointList } from "../components/CheckpointList";
import { FileTreeView } from "../components/FileTreeView";
import { ReviewQueue } from "../components/ReviewQueue";
import { useGitStore } from "../stores/gitStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";

type ExplorerTab = "changes" | "files" | "checks";
type BottomPanelTab = "setup" | "run" | "terminal";

export function FileExplorer() {
  const { rightPaneVisible, toggleRightPane } = useLayoutStore();
  const { projects, activeProjectId } = useProjectStore();
  const { fileStatuses, branches, fetchBranches } = useGitStore();
  const [activeTab, setActiveTab] = useState<ExplorerTab>("changes");
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomPanelTab>("run");

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const statuses = activeProject ? fileStatuses[activeProject.id] : undefined;

  // Fetch branches for active project
  useEffect(() => {
    if (activeProject) {
      fetchBranches(activeProject.id, activeProject.path);
    }
  }, [activeProject, fetchBranches]);

  if (!rightPaneVisible) return null;

  const currentBranch = branches.find((b) => b.is_head);

  return (
    <aside className="file-explorer">
      <div className="file-explorer-header">
        <span className="file-explorer-title">Explorer</span>
        <button
          type="button"
          className="btn btn-toolbar file-explorer-collapse-btn"
          onClick={toggleRightPane}
          title="Collapse explorer"
        >
          &rsaquo;
        </button>
      </div>

      {/* Branch selector */}
      {currentBranch && (
        <div className="file-explorer-branch">
          <span className="file-explorer-branch-icon">&darr;</span>
          {currentBranch.name}
        </div>
      )}

      {/* Tabs: Changes | All Files | Checks */}
      <div className="file-explorer-tabs">
        <button
          type="button"
          className={`file-explorer-tab ${activeTab === "changes" ? "file-explorer-tab-active" : ""}`}
          onClick={() => setActiveTab("changes")}
        >
          Changes{statuses && statuses.length > 0 ? ` ${statuses.length}` : ""}
        </button>
        <button
          type="button"
          className={`file-explorer-tab ${activeTab === "files" ? "file-explorer-tab-active" : ""}`}
          onClick={() => setActiveTab("files")}
        >
          All Files
        </button>
        <button
          type="button"
          className={`file-explorer-tab ${activeTab === "checks" ? "file-explorer-tab-active" : ""}`}
          onClick={() => setActiveTab("checks")}
        >
          Checks
        </button>
      </div>

      {/* Tab content */}
      <div className="file-explorer-body">
        {activeTab === "changes" ? (
          <div>
            {/* Changed files from git status */}
            {statuses && statuses.length > 0 ? (
              statuses.map((s) => (
                <div
                  key={s.path}
                  className="changed-file"
                  title={`${s.status}: ${s.path}`}
                >
                  <span
                    className={`changed-file-status changed-file-status-${s.status}`}
                  >
                    {s.status === "modified"
                      ? "M"
                      : s.status === "staged"
                        ? "A"
                        : s.status === "untracked"
                          ? "?"
                          : s.status === "deleted"
                            ? "D"
                            : s.status === "conflicted"
                              ? "!"
                              : s.status === "renamed"
                                ? "R"
                                : "?"}
                  </span>
                  <span className="changed-file-name">{s.path}</span>
                </div>
              ))
            ) : (
              <div className="review-empty">
                <p>No changes detected.</p>
              </div>
            )}

            {/* Review queue items below changes */}
            <ReviewQueue />

            {/* Checkpoints */}
            {activeProject && (
              <CheckpointList
                projectId={activeProject.id}
                projectPath={activeProject.path}
              />
            )}
          </div>
        ) : activeTab === "files" ? (
          activeProject ? (
            <FileTreeView
              rootPath={activeProject.path}
              gitStatuses={statuses}
            />
          ) : (
            <div className="review-empty">
              <p>Select a project to browse files.</p>
            </div>
          )
        ) : (
          <div className="review-empty">
            <p>CI checks coming soon.</p>
          </div>
        )}
      </div>

      {/* Collapsible Bottom Panel */}
      <div className="file-explorer-bottom-panel">
        <div className="file-explorer-bottom-handle">
          <button
            type="button"
            className={`file-explorer-bottom-tab ${bottomTab === "setup" ? "file-explorer-bottom-tab-active" : ""}`}
            onClick={() => { setBottomTab("setup"); setBottomPanelOpen(true); }}
          >
            Setup
          </button>
          <button
            type="button"
            className={`file-explorer-bottom-tab ${bottomTab === "run" ? "file-explorer-bottom-tab-active" : ""}`}
            onClick={() => { setBottomTab("run"); setBottomPanelOpen(true); }}
          >
            Run
          </button>
          <button
            type="button"
            className={`file-explorer-bottom-tab ${bottomTab === "terminal" ? "file-explorer-bottom-tab-active" : ""}`}
            onClick={() => { setBottomTab("terminal"); setBottomPanelOpen(true); }}
          >
            Terminal
          </button>
          <button
            type="button"
            className="file-explorer-bottom-add"
            title="Add panel"
          >
            +
          </button>
          <button
            type="button"
            className="file-explorer-bottom-toggle"
            onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
            title={bottomPanelOpen ? "Collapse" : "Expand"}
          >
            {bottomPanelOpen ? "\u02C5" : "\u02C4"}
          </button>
        </div>

        {bottomPanelOpen && (
          <div className="file-explorer-bottom-content">
            {bottomTab === "setup" && (
              <>
                <p style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
                  Workspace configuration
                </p>
                <p>Configure project settings and environment.</p>
              </>
            )}
            {bottomTab === "run" && (
              <>
                <button type="button" className="btn btn-secondary">
                  Add run script
                </button>
                <p>Run tests or a dev server to test changes</p>
              </>
            )}
            {bottomTab === "terminal" && (
              <p>Quick terminal coming soon.</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
