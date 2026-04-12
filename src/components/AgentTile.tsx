import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentInfo } from "../bindings";
import { useTileDrag } from "../hooks/useTileDrag";
import { AgentTerminalPanel } from "../panels/AgentTerminalPanel";
import { useAgentStore } from "../stores/agentStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  custom: "Custom",
};

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
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { stopAgent } = useAgentStore();
  const { startDrag } = useTileDrag();

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
      {/* Header — draggable for rearranging (custom drag, works in WKWebView) */}
      <div
        className="agent-tile-header"
        role="toolbar"
        onMouseDown={(e) => {
          // Only start drag from left mouse button, not on buttons
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest("button")) return;
          startDrag(
            e,
            agent.id,
            AGENT_LABELS[agent.agent_type] ?? agent.agent_type,
          );
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

      {/* Content area */}
      <div className="agent-tile-content">
        <div className="agent-tile-terminal-container">
          <AgentTerminalPanel agentId={agent.id} />
        </div>
      </div>
    </div>
  );
}
