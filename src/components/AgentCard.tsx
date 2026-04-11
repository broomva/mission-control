import type { AgentInfo } from "../bindings";
import { useAgentStore } from "../stores/agentStore";

interface AgentCardProps {
  agent: AgentInfo;
}

const STATUS_COLORS: Record<string, string> = {
  running: "var(--agent-running)",
  starting: "var(--agent-running)",
  waiting: "var(--agent-waiting)",
  idle: "var(--agent-idle)",
  completed: "var(--agent-completed)",
  stopped: "var(--agent-idle)",
  error: "var(--agent-error)",
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  custom: "Custom",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export function AgentCard({ agent }: AgentCardProps) {
  const { stopAgent } = useAgentStore();

  const isRunning = agent.status === "running" || agent.status === "starting";
  const statusColor = STATUS_COLORS[agent.status] ?? "var(--agent-idle)";

  return (
    <div className="agent-card">
      <div className="agent-card-header">
        <span
          className="agent-status-badge"
          style={{ "--status-color": statusColor } as React.CSSProperties}
        >
          <span className="agent-status-dot" />
          {agent.status}
        </span>
        <span className="agent-type-label">
          {AGENT_TYPE_LABELS[agent.agent_type] ?? agent.agent_type}
        </span>
      </div>

      {agent.prompt && (
        <p className="agent-prompt-preview">
          {agent.prompt.length > 80
            ? `${agent.prompt.slice(0, 80)}...`
            : agent.prompt}
        </p>
      )}

      <div className="agent-token-usage">
        <span title="Input tokens">
          {formatTokens(agent.token_usage.input_tokens)} in
        </span>
        <span title="Output tokens">
          {formatTokens(agent.token_usage.output_tokens)} out
        </span>
        <span className="agent-cost" title="Estimated cost">
          ${agent.token_usage.cost_usd.toFixed(4)}
        </span>
      </div>

      <div className="agent-card-footer">
        <span className="agent-time">{relativeTime(agent.started_at)}</span>
        <div className="agent-actions">
          {isRunning && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => stopAgent(agent.id)}
            >
              Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
