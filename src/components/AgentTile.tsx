import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentInfo } from "../bindings";
import { AgentTerminalPanel } from "../panels/AgentTerminalPanel";
import { useAgentStore } from "../stores/agentStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  custom: "Custom",
};

type InternalTab = "terminal" | "chat" | "diff";

interface AgentTileProps {
  agent: AgentInfo;
  onClose: (id: string) => void;
  onMaximize: (id: string) => void;
}

function statusClass(status: string): string {
  switch (status) {
    case "running":
      return "status-running";
    case "waiting":
      return "status-waiting";
    case "error":
      return "status-error";
    case "stopped":
      return "status-stopped";
    case "completed":
      return "status-completed";
    default:
      return "status-idle";
  }
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function AgentTile({ agent, onClose, onMaximize }: AgentTileProps) {
  const [activeTab, setActiveTab] = useState<InternalTab>("terminal");
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { stopAgent } = useAgentStore();

  const handleDoubleClick = useCallback(() => {
    onMaximize(agent.id);
  }, [agent.id, onMaximize]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenuOpen(!contextMenuOpen);
    },
    [contextMenuOpen],
  );

  const isTerminated =
    agent.status === "stopped" || agent.status === "completed";

  const handleStopAgent = useCallback(async () => {
    setContextMenuOpen(false);
    if (!isTerminated) {
      await stopAgent(agent.id);
    }
  }, [agent.id, stopAgent, isTerminated]);

  const handleMinimize = useCallback(() => {
    setContextMenuOpen(false);
    useTileLayoutStore.getState().minimizeTile(agent.id);
  }, [agent.id]);

  const handleCloseFromMenu = useCallback(() => {
    setContextMenuOpen(false);
    onClose(agent.id);
  }, [agent.id, onClose]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenuOpen]);

  const isWaiting = agent.status === "waiting";
  const totalTokens =
    agent.token_usage.input_tokens + agent.token_usage.output_tokens;

  return (
    <div
      className={`agent-tile ${isWaiting ? "agent-tile-notification" : ""}`}
      data-agent-id={agent.id}
    >
      {/* Header — draggable for rearranging */}
      <div
        className="agent-tile-header"
        role="toolbar"
        draggable="true"
        onDragStart={(e) => {
          e.dataTransfer.setData("agent-id", agent.id);
          e.dataTransfer.effectAllowed = "move";
          useTileLayoutStore.getState().setDraggedAgent(agent.id);
          // Custom drag image with agent name
          const ghost = document.createElement("div");
          ghost.className = "drag-ghost";
          ghost.textContent = AGENT_LABELS[agent.agent_type] ?? agent.agent_type;
          ghost.style.cssText = "position:fixed;top:-100px;padding:6px 16px;background:#2a2a27;color:#e8e4e0;border-radius:6px;font-size:13px;font-weight:500;border:1px solid rgba(45,212,168,0.4);pointer-events:none;z-index:9999";
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, 60, 16);
          requestAnimationFrame(() => ghost.remove());
        }}
        onDragEnd={() => {
          useTileLayoutStore.getState().setDraggedAgent(null);
        }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        style={{ cursor: "grab" }}
      >
        <div className="agent-tile-header-left">
          <span
            className={`agent-tile-status-dot ${statusClass(agent.status)}`}
          />
          <span className="agent-tile-name">{agent.agent_type}</span>
          <span className="agent-tile-model-badge">{agent.status}</span>
        </div>
        <div className="agent-tile-header-right">
          {totalTokens > 0 && (
            <span className="agent-tile-tokens">
              {formatTokens(totalTokens)} tok
            </span>
          )}
          {agent.token_usage.cost_usd > 0 && (
            <span className="agent-tile-cost">
              {formatCost(agent.token_usage.cost_usd)}
            </span>
          )}
          <button
            type="button"
            className="agent-tile-close-btn"
            onClick={() => onClose(agent.id)}
            aria-label="Close agent tile"
          >
            &times;
          </button>
        </div>

        {/* Context menu */}
        {contextMenuOpen && (
          <div className="agent-tile-context-menu" ref={contextMenuRef}>
            <button
              type="button"
              onClick={handleStopAgent}
              disabled={isTerminated}
            >
              Stop Agent
            </button>
            <button type="button" onClick={handleMinimize}>
              Minimize
            </button>
            <button type="button" onClick={handleCloseFromMenu}>
              Close
            </button>
          </div>
        )}
      </div>

      {/* Notification badge */}
      {isWaiting && <div className="tile-notification-badge">!</div>}

      {/* Internal tab bar */}
      <div className="agent-tile-tabs">
        {(["terminal", "chat", "diff"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`agent-tile-tab ${activeTab === tab ? "agent-tile-tab-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="agent-tile-content">
        {activeTab === "terminal" && (
          <div className="agent-tile-terminal-container">
            <AgentTerminalPanel agentId={agent.id} />
          </div>
        )}
        {activeTab === "chat" && (
          <div className="agent-tile-placeholder">
            Structured chat view coming soon
          </div>
        )}
        {activeTab === "diff" && (
          <div className="agent-tile-placeholder">
            Agent diffs will appear here
          </div>
        )}
      </div>
    </div>
  );
}
