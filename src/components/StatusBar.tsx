import { useEffect, useState } from "react";
import type { AgentInfo } from "../bindings";
import { useAgentStore } from "../stores/agentStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";

const STATUS_COLORS: Record<string, string> = {
  running: "var(--agent-running)",
  starting: "var(--agent-running)",
  waiting: "var(--agent-waiting)",
  idle: "var(--agent-idle)",
  completed: "var(--agent-completed)",
  stopped: "var(--agent-idle)",
  error: "var(--agent-error)",
};

const STATUS_CLASS: Record<string, string> = {
  running: "status-bar-dot-running",
  starting: "status-bar-dot-running",
  waiting: "status-bar-dot-waiting",
  error: "status-bar-dot-error",
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  custom: "Custom",
};

function formatElapsed(startedAt: string): string {
  const diff = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const totalSecs = Math.floor(diff / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h${remainMins}m`;
  }
  if (mins > 0) return `${mins}m`;
  return `${secs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function AgentBadge({ agent }: { agent: AgentInfo }) {
  const { setFocusedTile } = useTileLayoutStore();
  const statusColor = STATUS_COLORS[agent.status] ?? "var(--agent-idle)";
  const dotClass = STATUS_CLASS[agent.status] ?? "";
  const label = AGENT_TYPE_LABELS[agent.agent_type] ?? agent.agent_type;
  const isActive = agent.status === "running" || agent.status === "starting";

  return (
    <button
      type="button"
      className="status-bar-agent"
      onClick={() => setFocusedTile(agent.id)}
      title={`${label} - ${agent.status}`}
    >
      <span
        className={`status-bar-dot ${dotClass}`}
        style={{ "--status-color": statusColor } as React.CSSProperties}
      />
      <span className="status-bar-agent-label">
        {label}
        {isActive ? ` ${formatElapsed(agent.started_at)}` : ""}
        {agent.status === "waiting" ? " waiting" : ""}
        {agent.status === "error" ? " error" : ""}
        {agent.status === "idle" || agent.status === "stopped" ? " idle" : ""}
        {agent.status === "completed" ? " done" : ""}
      </span>
    </button>
  );
}

export function StatusBar() {
  const { agents } = useAgentStore();
  const [, setTick] = useState(0);

  // 1-second timer for elapsed time updates
  const hasActiveAgent = agents.some(
    (a) => a.status === "running" || a.status === "starting",
  );

  useEffect(() => {
    if (!hasActiveAgent) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasActiveAgent]);

  // Cumulative totals
  const totalCost = agents.reduce((sum, a) => sum + a.token_usage.cost_usd, 0);
  const totalTokens = agents.reduce(
    (sum, a) => sum + a.token_usage.input_tokens + a.token_usage.output_tokens,
    0,
  );

  return (
    <div className="status-bar">
      {agents.length === 0 ? (
        <span className="status-bar-empty">No agents</span>
      ) : (
        <>
          <div className="status-bar-agents">
            {agents.map((agent, i) => (
              <span key={agent.id} className="status-bar-badge-group">
                <AgentBadge agent={agent} />
                {i < agents.length - 1 && (
                  <span className="status-bar-separator" />
                )}
              </span>
            ))}
          </div>
          <div className="status-bar-totals">
            <span className="status-bar-cost">
              ${totalCost.toFixed(2)} session
            </span>
            <span className="status-bar-separator" />
            <span className="status-bar-tokens">
              {formatTokens(totalTokens)} tokens
            </span>
          </div>
        </>
      )}
    </div>
  );
}
