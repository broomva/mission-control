import { useState } from "react";
import { useAgentStore } from "../stores/agentStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";

interface SpawnAgentDialogProps {
  onClose: () => void;
}

const AGENT_TYPES = [
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "custom", label: "Custom" },
];

export function SpawnAgentDialog({ onClose }: SpawnAgentDialogProps) {
  const [agentType, setAgentType] = useState("claude-code");
  const [prompt, setPrompt] = useState("");
  const { spawnAgent } = useAgentStore();
  const { openAgentPanel } = useLayoutStore();
  const { activeProjectId, projects } = useProjectStore();

  const project = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : null;

  const handleSubmit = async () => {
    if (!project) return;
    const agent = await spawnAgent(
      project.id,
      agentType,
      prompt.trim() || null,
      project.path,
    );
    if (agent) {
      openAgentPanel(
        agent.id,
        `${AGENT_TYPES.find((t) => t.value === agentType)?.label ?? "Agent"} — ${project.name}`,
      );
      onClose();
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
        className="dialog spawn-agent-dialog"
        role="dialog"
        aria-label="Spawn Agent"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h3>Spawn Agent</h3>

        <div className="dialog-field">
          <label htmlFor="agent-type">Agent Type</label>
          <select
            id="agent-type"
            className="agent-type-select"
            value={agentType}
            onChange={(e) => setAgentType(e.target.value)}
          >
            {AGENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="dialog-field">
          <label htmlFor="agent-prompt">
            {agentType === "custom" ? "Command" : "Prompt (optional)"}
          </label>
          <textarea
            id="agent-prompt"
            className="agent-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              agentType === "custom"
                ? "e.g. python my_agent.py"
                : "Describe the task..."
            }
            rows={4}
          />
        </div>

        <div className="dialog-field">
          <label htmlFor="agent-cwd">Working Directory</label>
          <input
            id="agent-cwd"
            type="text"
            value={project?.path ?? ""}
            readOnly
            style={{ opacity: 0.6 }}
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
            disabled={!project}
          >
            Spawn
          </button>
        </div>
      </div>
    </div>
  );
}
