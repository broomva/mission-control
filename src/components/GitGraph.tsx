import { useCallback, useEffect, useRef } from "react";
import type { CommitDetail, GraphCommit, GraphEdge } from "../bindings";
import { useGitGraphStore } from "../stores/gitGraphStore";

const ROW_HEIGHT = 32;
const LANE_WIDTH = 20;
const GRAPH_PADDING = 16;
const COMMIT_RADIUS = 5;

const LANE_COLORS = [
  "#007aff",
  "#30d158",
  "#ff453a",
  "#ffd60a",
  "#6BCB77",
  "#4D96FF",
  "#FF8C42",
  "#C147E9",
];

interface GitGraphProps {
  projectId: string;
  projectPath: string;
  onSelectCommitOid?: (oid: string) => void;
}

export function GitGraph({
  projectId,
  projectPath,
  onSelectCommitOid,
}: GitGraphProps) {
  const {
    graphData,
    selectedCommit,
    loading,
    fetchGraph,
    selectCommit,
    clearSelection,
  } = useGitGraphStore();

  useEffect(() => {
    fetchGraph(projectId, projectPath);
  }, [projectId, projectPath, fetchGraph]);

  const handleSelectCommit = useCallback(
    (sha: string) => {
      selectCommit(projectId, projectPath, sha);
      onSelectCommitOid?.(sha);
    },
    [projectId, projectPath, selectCommit, onSelectCommitOid],
  );

  if (loading && !graphData) {
    return (
      <div className="git-graph-empty">
        <p>Loading git graph...</p>
      </div>
    );
  }

  if (!graphData || graphData.commits.length === 0) {
    return (
      <div className="git-graph-empty">
        <p>No commits found</p>
      </div>
    );
  }

  return (
    <div className="git-graph">
      {/* Main graph area */}
      <div className="git-graph-main">
        <GraphCanvas
          commits={graphData.commits}
          edges={graphData.edges}
          maxLanes={graphData.max_lanes}
          selectedSha={selectedCommit?.sha ?? null}
          onSelectCommit={handleSelectCommit}
        />
      </div>

      {/* Commit detail sidebar */}
      {selectedCommit && (
        <CommitDetailPanel commit={selectedCommit} onClose={clearSelection} />
      )}
    </div>
  );
}

function CommitDetailPanel({
  commit,
  onClose,
}: {
  commit: CommitDetail;
  onClose: () => void;
}) {
  return (
    <div className="git-graph-detail">
      <div className="git-graph-detail-header">
        <span className="git-graph-detail-title">Commit Detail</span>
        <button
          type="button"
          className="btn btn-toolbar git-graph-detail-close"
          onClick={onClose}
        >
          x
        </button>
      </div>

      <div className="git-graph-detail-sha">{commit.sha.slice(0, 12)}</div>

      <p className="git-graph-detail-message">{commit.message}</p>

      <div className="git-graph-detail-author">{commit.author}</div>
      <div className="git-graph-detail-time">
        {new Date(commit.timestamp * 1000).toLocaleString()}
      </div>

      {commit.files_changed.length > 0 && (
        <div className="git-graph-detail-files">
          <div className="git-graph-detail-files-title">
            Files Changed ({commit.files_changed.length})
          </div>
          <div className="git-graph-detail-files-list">
            {commit.files_changed.map((file) => (
              <div key={file.path} className="git-graph-detail-file">
                <span
                  className={`git-graph-detail-file-status git-graph-detail-file-status-${file.status}`}
                >
                  {file.status === "added"
                    ? "+"
                    : file.status === "deleted"
                      ? "-"
                      : "~"}
                </span>
                <span className="git-graph-detail-file-path">{file.path}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GraphCanvas({
  commits,
  edges,
  maxLanes,
  selectedSha,
  onSelectCommit,
}: {
  commits: GraphCommit[];
  edges: GraphEdge[];
  maxLanes: number;
  selectedSha: string | null;
  onSelectCommit: (sha: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const graphWidth = (maxLanes + 1) * LANE_WIDTH + GRAPH_PADDING * 2;

  // Build a map from SHA to row index
  const shaToRow = new Map<string, number>();
  commits.forEach((c, i) => shaToRow.set(c.sha, i));

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = graphWidth * dpr;
    canvas.height = commits.length * ROW_HEIGHT * dpr;
    canvas.style.width = `${graphWidth}px`;
    canvas.style.height = `${commits.length * ROW_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, graphWidth, commits.length * ROW_HEIGHT);

    // Draw edges
    ctx.lineWidth = 2;
    for (const edge of edges) {
      const fromRow = shaToRow.get(edge.from_sha);
      const toRow = shaToRow.get(edge.to_sha);
      if (fromRow === undefined || toRow === undefined) continue;

      const x1 = GRAPH_PADDING + edge.from_lane * LANE_WIDTH + LANE_WIDTH / 2;
      const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = GRAPH_PADDING + edge.to_lane * LANE_WIDTH + LANE_WIDTH / 2;
      const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

      ctx.strokeStyle =
        LANE_COLORS[edge.from_lane % LANE_COLORS.length] ?? "#007aff";
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);

      if (x1 === x2) {
        ctx.lineTo(x2, y2);
      } else {
        const midY = (y1 + y2) / 2;
        ctx.bezierCurveTo(x1, midY, x2, midY, x2, y2);
      }

      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw commit nodes
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i]!;
      const x = GRAPH_PADDING + commit.lane * LANE_WIDTH + LANE_WIDTH / 2;
      const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
      const color = LANE_COLORS[commit.lane % LANE_COLORS.length] ?? "#007aff";

      ctx.beginPath();
      ctx.arc(x, y, COMMIT_RADIUS, 0, Math.PI * 2);

      if (commit.sha === selectedSha) {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      } else if (commit.parent_shas.length > 1) {
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }, [commits, edges, graphWidth, selectedSha, shaToRow]);

  useEffect(() => {
    drawGraph();
  }, [drawGraph]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top + e.currentTarget.scrollTop;
    const row = Math.floor(y / ROW_HEIGHT);
    const commit = row >= 0 && row < commits.length ? commits[row] : undefined;
    if (commit) {
      onSelectCommit(commit.sha);
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="git-graph-canvas-container"
    >
      {commits.map((commit, i) => (
        <div
          key={commit.sha}
          className={`git-graph-row ${commit.sha === selectedSha ? "git-graph-row-selected" : ""}`}
          style={{
            height: ROW_HEIGHT,
            background:
              commit.sha === selectedSha
                ? "var(--glass-bg-hover)"
                : i % 2 === 0
                  ? "transparent"
                  : "rgba(255,255,255,0.02)",
          }}
        >
          {/* Graph lane area (canvas overlays this) */}
          <div className="git-graph-lane-area" style={{ width: graphWidth }}>
            {i === 0 && (
              <canvas
                ref={canvasRef}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  pointerEvents: "none",
                }}
              />
            )}
          </div>

          {/* Commit info */}
          <div className="git-graph-commit-info">
            {/* Ref labels */}
            {commit.refs.map((ref) => (
              <span
                key={ref.name}
                className={`git-graph-ref git-graph-ref-${ref.kind}`}
              >
                {ref.name}
              </span>
            ))}

            {/* SHA */}
            <span className="git-graph-sha">{commit.short_sha}</span>

            {/* Message */}
            <span className="git-graph-message">{commit.message}</span>

            {/* Author */}
            <span className="git-graph-author">{commit.author}</span>

            {/* Time */}
            <span className="git-graph-time">
              {formatRelativeTime(commit.timestamp)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatRelativeTime(unixSeconds: number): string {
  const now = Date.now() / 1000;
  const diff = now - unixSeconds;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;

  return new Date(unixSeconds * 1000).toLocaleDateString();
}
