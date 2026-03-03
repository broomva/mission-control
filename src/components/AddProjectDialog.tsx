import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useProjectStore } from "../stores/projectStore";

interface AddProjectDialogProps {
  onClose: () => void;
}

export function AddProjectDialog({ onClose }: AddProjectDialogProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const { addProject } = useProjectStore();

  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Project Directory",
    });
    if (selected) {
      setPath(selected);
      if (!name) {
        const parts = selected.split("/");
        const dirName = parts[parts.length - 1];
        if (dirName) setName(dirName);
      }
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !path.trim()) return;
    await addProject(name.trim(), path.trim());
    onClose();
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
        aria-label="Add Project"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h3>Add Project</h3>
        <div className="dialog-field">
          <label htmlFor="project-path">Directory</label>
          <div className="dialog-browse">
            <input
              id="project-path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/project"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleBrowse}
            >
              Browse
            </button>
          </div>
        </div>
        <div className="dialog-field">
          <label htmlFor="project-name">Name</label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Project"
          />
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim() || !path.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
