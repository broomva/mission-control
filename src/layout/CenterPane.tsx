import { useEffect, useState } from "react";
import { ChatView } from "../components/ChatView";
import { SpawnAgentDialog } from "../components/SpawnAgentDialog";
import { TileGrid } from "../components/TileGrid";
import { useReviewEventListener } from "../hooks/useReviewEventListener";
import { AgentTerminalPanel } from "../panels/AgentTerminalPanel";
import { ProjectDashboard } from "../panels/ProjectDashboard";
import { useAgentStore } from "../stores/agentStore";
import { useProjectStore } from "../stores/projectStore";

interface CenterPaneProps {
  showSpawnDialog: boolean;
  onOpenSpawnDialog: () => void;
  onCloseSpawnDialog: () => void;
}

const AGENT_TYPE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  custom: "Custom",
};

const STATUS_COLORS: Record<string, string> = {
  running: "var(--agent-running)",
  starting: "var(--agent-running)",
  waiting: "var(--agent-waiting)",
  idle: "var(--agent-idle)",
  completed: "var(--agent-completed)",
  stopped: "var(--agent-idle)",
  error: "var(--agent-error)",
};

type ViewMode = "chat" | "terminal" | "split";

export function CenterPane({
  showSpawnDialog,
  onOpenSpawnDialog,
  onCloseSpawnDialog,
}: CenterPaneProps) {
  const { activeProjectId } = useProjectStore();
  const { agents, fetchAgents, setupEventListeners, timeline, fetchTimeline } =
    useAgentStore();
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("terminal");

  // Wire agent file_write events to review queue
  useReviewEventListener();

  // Fetch agents when the active project changes
  useEffect(() => {
    if (activeProjectId) {
      fetchAgents(activeProjectId);
    }
  }, [activeProjectId, fetchAgents]);

  // Set up global agent event listeners
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    setupEventListeners().then((unsub) => {
      cleanup = unsub;
    });

    return () => {
      cleanup?.();
    };
  }, [setupEventListeners]);

  // Filter agents by active project
  const projectAgents = activeProjectId
    ? agents.filter((a) => a.project_id === activeProjectId)
    : [];

  // Auto-select first agent or keep selection valid
  useEffect(() => {
    if (projectAgents.length > 0) {
      const first = projectAgents[0];
      if (
        first &&
        (!activeAgentId || !projectAgents.find((a) => a.id === activeAgentId))
      ) {
        setActiveAgentId(first.id);
      }
    } else {
      setActiveAgentId(null);
    }
  }, [projectAgents, activeAgentId]);

  // Fetch timeline for active agent
  useEffect(() => {
    if (activeProjectId && activeAgentId) {
      fetchTimeline(activeProjectId);
    }
  }, [activeProjectId, activeAgentId, fetchTimeline]);

  const activeAgent = activeAgentId
    ? projectAgents.find((a) => a.id === activeAgentId)
    : null;

  // If no project selected, show dashboard
  if (!activeProjectId) {
    return (
      <div className="center-pane">
        <ProjectDashboard />
        {showSpawnDialog && <SpawnAgentDialog onClose={onCloseSpawnDialog} />}
      </div>
    );
  }

  // If split view mode, show the tile grid
  if (viewMode === "split") {
    return (
      <div className="center-pane">
        <div className="agent-tab-bar">
          <div className="view-mode-toggle">
            <button
              type="button"
              className="view-mode-btn"
              onClick={() => setViewMode("chat")}
            >
              Chat
            </button>
            <button
              type="button"
              className="view-mode-btn"
              onClick={() => setViewMode("terminal")}
            >
              Terminal
            </button>
            <button
              type="button"
              className="view-mode-btn view-mode-btn-active"
              onClick={() => setViewMode("split")}
            >
              Split
            </button>
          </div>
        </div>
        <TileGrid agents={projectAgents} onSpawnAgent={onOpenSpawnDialog} />
        {showSpawnDialog && <SpawnAgentDialog onClose={onCloseSpawnDialog} />}
      </div>
    );
  }

  // Default: tabbed view with chat or terminal
  return (
    <div className="center-pane">
      {/* Agent Tab Bar */}
      <div className="agent-tab-bar">
        {projectAgents.map((agent) => {
          const label = AGENT_TYPE_LABELS[agent.agent_type] ?? agent.agent_type;
          const isActive = agent.id === activeAgentId;
          const statusColor =
            STATUS_COLORS[agent.status] ?? "var(--agent-idle)";

          return (
            <button
              key={agent.id}
              type="button"
              className={`agent-tab ${isActive ? "agent-tab-active" : ""}`}
              onClick={() => setActiveAgentId(agent.id)}
              title={`${label} - ${agent.status}`}
            >
              <span
                className="agent-tab-dot"
                style={{ background: statusColor }}
              />
              {label}
            </button>
          );
        })}
        <button
          type="button"
          className="agent-tab-add"
          onClick={onOpenSpawnDialog}
          title="Spawn new agent"
        >
          +
        </button>

        {/* View mode toggle */}
        <div className="view-mode-toggle">
          <button
            type="button"
            className={`view-mode-btn ${viewMode === "chat" ? "view-mode-btn-active" : ""}`}
            onClick={() => setViewMode("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            className={`view-mode-btn ${viewMode === "terminal" ? "view-mode-btn-active" : ""}`}
            onClick={() => setViewMode("terminal")}
          >
            Terminal
          </button>
          <button
            type="button"
            className="view-mode-btn"
            onClick={() => setViewMode("split")}
          >
            Split
          </button>
        </div>
      </div>

      {/* Content area */}
      {activeAgent ? (
        viewMode === "chat" ? (
          <ChatView agent={activeAgent} timeline={timeline} />
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            <AgentTerminalPanel agentId={activeAgent.id} />
          </div>
        )
      ) : (
        <div className="empty-state">
          <p>No agents running in this workspace.</p>
          <p>Spawn one to get started.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenSpawnDialog}
          >
            Spawn Agent
          </button>
        </div>
      )}

      {showSpawnDialog && <SpawnAgentDialog onClose={onCloseSpawnDialog} />}
    </div>
  );
}
