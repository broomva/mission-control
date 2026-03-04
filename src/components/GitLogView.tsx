import { useEffect } from "react";
import { useGitStore } from "../stores/gitStore";
import { useLayoutStore } from "../stores/layoutStore";

interface GitLogViewProps {
  projectId: string;
  projectPath: string;
}

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

export function GitLogView({ projectId, projectPath }: GitLogViewProps) {
  const { commits, branches, loading, fetchLog, fetchBranches } = useGitStore();
  const { openDiffViewer } = useLayoutStore();

  useEffect(() => {
    fetchLog(projectId, projectPath);
    fetchBranches(projectId, projectPath);
  }, [projectId, projectPath, fetchLog, fetchBranches]);

  const headBranch = branches.find((b) => b.is_head);
  const branchCount = branches.length;

  const handleLoadMore = () => {
    fetchLog(projectId, projectPath, commits.length, 50);
  };

  return (
    <div className="git-log">
      <div className="git-log-header">
        <span className="git-log-branch">
          {headBranch ? headBranch.name : "detached"}
        </span>
        <span className="git-log-branch-count">
          {branchCount} branch{branchCount !== 1 ? "es" : ""}
        </span>
      </div>
      <div className="git-log-list">
        {commits.map((commit) => (
          <button
            type="button"
            key={commit.oid}
            className="commit-row"
            onClick={() =>
              openDiffViewer(
                projectId,
                projectPath,
                commit.oid,
                commit.message.split("\n")[0] ?? "",
              )
            }
          >
            <div className="commit-row-top">
              <span className="commit-oid">{commit.short_oid}</span>
              {commit.branch_refs.map((ref_name) => (
                <span key={ref_name} className="branch-badge">
                  {ref_name}
                </span>
              ))}
              <span className="commit-message">
                {commit.message.split("\n")[0]}
              </span>
            </div>
            <div className="commit-meta">
              <span>{commit.author}</span>
              <span>{formatRelativeTime(commit.timestamp)}</span>
            </div>
          </button>
        ))}
        {commits.length > 0 && (
          <button
            type="button"
            className="git-log-load-more"
            onClick={handleLoadMore}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        )}
        {commits.length === 0 && !loading && (
          <div className="empty-state">
            <p>No commits yet</p>
          </div>
        )}
        {loading && commits.length === 0 && (
          <div className="empty-state">
            <p>Loading commits...</p>
          </div>
        )}
      </div>
    </div>
  );
}
