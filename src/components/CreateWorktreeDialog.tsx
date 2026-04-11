import { useState } from "react";
import { useGitStore } from "../stores/gitStore";

interface CreateWorktreeDialogProps {
  projectId: string;
  projectPath: string;
  onClose: () => void;
}

export function CreateWorktreeDialog({
  projectId,
  projectPath,
  onClose,
}: CreateWorktreeDialogProps) {
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createWorktree } = useGitStore();

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-fill branch from name if branch is empty or was auto-filled
    if (!branch || branch === name) {
      setBranch(value);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !branch.trim()) return;
    setCreating(true);
    setError(null);
    const result = await createWorktree(
      projectId,
      projectPath,
      name.trim(),
      branch.trim(),
    );
    setCreating(false);
    if (result) {
      onClose();
    } else {
      setError("Failed to create worktree. Check if the name is already in use.");
    }
  };

  return (
    <div
      className="dialog-overlay"
      role="none"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-label="Create Worktree"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h3>New Worktree</h3>
        <div className="dialog-field">
          <label htmlFor="wt-name">Worktree Name</label>
          <input
            id="wt-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="agent-task-123"
            autoFocus
          />
        </div>
        <div className="dialog-field">
          <label htmlFor="wt-branch">Branch</label>
          <input
            id="wt-branch"
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="feature/my-branch"
          />
        </div>
        {error && (
          <div className="worktree-error">{error}</div>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim() || !branch.trim() || creating}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
