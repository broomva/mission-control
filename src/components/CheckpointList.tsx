import { useEffect, useState } from "react";
import { useCheckpointStore } from "../stores/checkpointStore";
import { useGitStore } from "../stores/gitStore";

interface CheckpointListProps {
  projectId: string;
  projectPath: string;
}

export function CheckpointList({ projectId, projectPath }: CheckpointListProps) {
  const {
    checkpoints,
    loading,
    fetchCheckpoints,
    rollbackToCheckpoint,
    deleteCheckpoint,
  } = useCheckpointStore();

  const { fetchStatus, fetchLog } = useGitStore();

  const [open, setOpen] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);

  useEffect(() => {
    if (projectId && projectPath) {
      fetchCheckpoints(projectId, projectPath);
    }
  }, [projectId, projectPath, fetchCheckpoints]);

  const handleRollback = async (checkpointId: string) => {
    const success = await rollbackToCheckpoint(
      projectId,
      projectPath,
      checkpointId,
    );
    setConfirmRollback(null);
    if (success) {
      // Refresh git state after rollback
      fetchStatus(projectId, projectPath);
      fetchLog(projectId, projectPath);
    }
  };

  const handleDelete = async (checkpointId: string) => {
    await deleteCheckpoint(projectId, projectPath, checkpointId);
  };

  const formatTime = (timestamp: string): string => {
    if (!timestamp) return "";
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="checkpoint-section">
      <button
        type="button"
        className="review-section-header"
        onClick={() => setOpen(!open)}
      >
        <span className="review-section-toggle">
          {open ? "\u25BE" : "\u25B8"}
        </span>
        <span>Checkpoints</span>
        <span className="review-section-count">{checkpoints.length}</span>
      </button>

      {open && (
        <div className="checkpoint-section-body">
          {loading ? (
            <div className="checkpoint-empty">
              <p>Loading checkpoints...</p>
            </div>
          ) : checkpoints.length === 0 ? (
            <div className="checkpoint-empty">
              <p>No checkpoints yet.</p>
              <p>Checkpoints are created automatically before agent tool use.</p>
            </div>
          ) : (
            <div className="checkpoint-list">
              {checkpoints.map((cp) => (
                <div key={cp.id} className="checkpoint-entry">
                  <div className="checkpoint-entry-row">
                    <span className="checkpoint-entry-desc">
                      {cp.description || "Checkpoint"}
                    </span>
                    <span className="checkpoint-entry-time">
                      {formatTime(cp.timestamp)}
                    </span>
                  </div>
                  <div className="checkpoint-entry-meta">
                    <span className="checkpoint-entry-oid">
                      {cp.commit_oid.slice(0, 7)}
                    </span>
                    {cp.agent_id && (
                      <span className="checkpoint-entry-agent">
                        {cp.agent_id.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  <div className="checkpoint-entry-actions">
                    {confirmRollback === cp.id ? (
                      <>
                        <span className="checkpoint-confirm-text">
                          Rollback? This will discard uncommitted changes.
                        </span>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => handleRollback(cp.id)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="btn btn-toolbar"
                          onClick={() => setConfirmRollback(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-toolbar"
                          onClick={() => setConfirmRollback(cp.id)}
                        >
                          Rollback
                        </button>
                        <button
                          type="button"
                          className="btn btn-toolbar"
                          onClick={() => handleDelete(cp.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
