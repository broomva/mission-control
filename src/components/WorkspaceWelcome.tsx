import { useCallback, useRef, useState } from "react";
import { useAgentStore } from "../stores/agentStore";
import { useGitStore } from "../stores/gitStore";
import { useProjectStore } from "../stores/projectStore";

interface WorkspaceWelcomeProps {
  onSpawnAgent: () => void;
}

const QUICK_ACTIONS = [
  { label: "Run security audit", prompt: "Run a security audit on this codebase" },
  { label: "Improve CLAUDE.md", prompt: "Review and improve CLAUDE.md" },
  { label: "Explain codebase", prompt: "Explain this codebase architecture" },
  { label: "Start coding", prompt: null },
];

export function WorkspaceWelcome({ onSpawnAgent }: WorkspaceWelcomeProps) {
  const { projects, activeProjectId } = useProjectStore();
  const { agents } = useAgentStore();
  const { branches } = useGitStore();
  const [message, setMessage] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const project = projects.find((p) => p.id === activeProjectId);
  if (!project) return null;

  const projectAgents = agents.filter((a) => a.project_id === activeProjectId);
  const currentBranch = branches.find((b) => b.is_head);
  const agentTypes = new Set(projectAgents.map((a) => a.agent_type));
  const agentTypeList = Array.from(agentTypes).length > 0
    ? Array.from(agentTypes).join(", ")
    : "Claude, Codex, Gemini";

  // Shorten the path for display
  const displayPath = project.path.replace(/^\/Users\/[^/]+/, "~");

  const handleSend = useCallback(() => {
    const text = message.trim();
    if (!text) {
      onSpawnAgent();
      return;
    }
    // For now, spawn agent dialog — in future, auto-spawn with prompt
    onSpawnAgent();
  }, [message, onSpawnAgent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const handleQuickAction = (prompt: string | null) => {
    if (prompt) {
      setMessage(prompt);
    }
    onSpawnAgent();
  };

  const isCommand = message.startsWith("/");

  return (
    <div className="workspace-welcome">
      <div className="workspace-welcome-inner">
        {/* Banner */}
        <div className="welcome-banner">
          <div className="welcome-banner-text">
            <span className="welcome-banner-icon">&#9670;</span>
            You're working on {project.name}
          </div>
        </div>

        {/* Info rows */}
        <div className="welcome-info-rows">
          <div className="welcome-row">
            <span className="welcome-row-icon">&#8601;</span>
            <span>
              Located at{" "}
              <span className="welcome-row-highlight">{displayPath}</span>
            </span>
          </div>
          <div className="welcome-row">
            <span className="welcome-row-icon">&#9881;</span>
            <span>
              <span className="welcome-row-highlight">
                {projectAgents.length || 4} agents
              </span>{" "}
              available ({agentTypeList})
            </span>
          </div>
          <div className="welcome-row">
            <span className="welcome-row-icon">&#9678;</span>
            <span>
              Git:{" "}
              <span className="welcome-row-highlight">
                {currentBranch?.name || "main"}
              </span>{" "}
              branch
            </span>
          </div>
        </div>

        {/* Quick action pills */}
        <div className="quick-action-pills">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="quick-action-pill"
              onClick={() => handleQuickAction(action.prompt)}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Input bar */}
        <div className="message-input-wrapper">
          <div className="message-input-bar">
            <div className="message-input-field-container">
              <textarea
                ref={textareaRef}
                className={`message-input-field${isCommand ? " message-input-command" : ""}`}
                value={message}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="/ask-anything..."
                rows={1}
              />
              {!isFocused && !message && (
                <span className="message-input-hint">&#8984;L to focus</span>
              )}
            </div>
            <div className="message-input-actions">
              <button
                type="button"
                className="message-input-btn"
                title="Attach file"
              >
                +
              </button>
              <button
                type="button"
                className="message-input-btn message-input-send"
                onClick={handleSend}
                title="Send message"
              >
                &uarr;
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
