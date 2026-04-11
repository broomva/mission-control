import { useEffect, useState } from "react";
import type { WorktreeInfo } from "../bindings";
import { useGitStore } from "../stores/gitStore";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";

interface WorktreeManagerProps {
  projectId: string;
  projectPath: string;
}

export function WorktreeManager({
  projectId,
  projectPath,
}: WorktreeManagerProps) {
  const { worktrees, fetchWorktrees, removeWorktree } = useGitStore();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const projectWorktrees = worktrees[projectId] ?? [];

  useEffect(() => {
    fetchWorktrees(projectId, projectPath);
  }, [projectId, projectPath, fetchWorktrees]);

  const handleDelete = async (name: string) => {
    await removeWorktree(projectId, projectPath, name);
    setConfirmDelete(null);
  };

  return (
    <>
      <div className="worktree-manager">
        <div className="worktree-header">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateDialog(true)}
          >
            New Worktree
          </button>
        </div>
        {projectWorktrees.length === 0 ? (
          <div className="empty-state">
            <p>No worktrees found.</p>
          </div>
        ) : (
          <div className="worktree-list">
            {projectWorktrees.map((wt: WorktreeInfo) => (
              <WorktreeRow
                key={wt.name}
                worktree={wt}
                confirmDelete={confirmDelete}
                onConfirmDelete={setConfirmDelete}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
      {showCreateDialog && (
        <CreateWorktreeDialog
          projectId={projectId}
          projectPath={projectPath}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </>
  );
}

function WorktreeRow({
  worktree,
  confirmDelete,
  onConfirmDelete,
  onDelete,
}: {
  worktree: WorktreeInfo;
  confirmDelete: string | null;
  onConfirmDelete: (name: string | null) => void;
  onDelete: (name: string) => void;
}) {
  const isConfirming = confirmDelete === worktree.name;

  return (
    <div className="worktree-row">
      <div className="worktree-row-info">
        <div className="worktree-row-name">
          <span>{worktree.name}</span>
          {worktree.is_main && (
            <span className="branch-badge">main</span>
          )}
        </div>
        {worktree.branch && (
          <div className="worktree-row-branch">{worktree.branch}</div>
        )}
        <div className="worktree-row-path" title={worktree.path}>
          {worktree.path}
        </div>
      </div>
      {!worktree.is_main && (
        <div className="worktree-row-actions">
          {isConfirming ? (
            <>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => onDelete(worktree.name)}
              >
                Confirm
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onConfirmDelete(null)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-toolbar"
              onClick={() => onConfirmDelete(worktree.name)}
              title="Remove worktree"
            >
              &times;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
