import { useMemo } from "react";
import type { AgentInfo } from "../bindings";
import { useAgentStore } from "../stores/agentStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";
import { AgentTile } from "./AgentTile";

interface TileGridProps {
  agents: AgentInfo[];
  onSpawnAgent: () => void;
}

const AGENT_LABELS: Record<string, string> = {
  "claude-code": "Claude",
  codex: "Codex",
  gemini: "Gemini",
  custom: "Custom",
};

function gridStyle(tileCount: number): React.CSSProperties {
  if (tileCount <= 1) return { gridTemplateColumns: "1fr" };
  if (tileCount <= 4) return { gridTemplateColumns: "1fr 1fr" };
  if (tileCount <= 9) return { gridTemplateColumns: "1fr 1fr 1fr" };
  return { gridTemplateColumns: "1fr 1fr 1fr", overflowY: "auto" as const };
}

export function TileGrid({ agents, onSpawnAgent }: TileGridProps) {
  const { maximizedTileId, minimizedTileIds, focusedTileId } =
    useTileLayoutStore();
  const { maximizeTile, restoreGrid, setFocusedTile } = useTileLayoutStore();
  const { stopAgent } = useAgentStore();

  const visibleAgents = useMemo(
    () => agents.filter((a) => !minimizedTileIds.includes(a.id)),
    [agents, minimizedTileIds],
  );

  const maximizedAgent = maximizedTileId
    ? agents.find((a) => a.id === maximizedTileId)
    : null;

  if (maximizedAgent) {
    return (
      <div className="tile-grid-wrapper">
        <div className="tile-grid-tabs">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`tile-grid-tab ${a.id === maximizedTileId ? "tile-grid-tab-active" : ""}`}
              onClick={() => maximizeTile(a.id)}
            >
              <span
                className={`tile-grid-tab-dot status-${a.status === "running" ? "running" : a.status === "waiting" ? "waiting" : a.status === "error" ? "error" : "idle"}`}
              />
              {AGENT_LABELS[a.agent_type] ?? a.agent_type}
            </button>
          ))}
          <button
            type="button"
            className="tile-grid-tab-add"
            onClick={onSpawnAgent}
            title="New agent"
          >
            +
          </button>
        </div>
        <div className="tile-grid tile-grid-maximized">
          <AgentTile
            agent={maximizedAgent}
            onClose={(id) => {
              restoreGrid();
              stopAgent(id);
            }}
            onMaximize={() => restoreGrid()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="tile-grid-wrapper">
      {/* Tab bar for split view — shows all agents + add button */}
      <div className="tile-grid-tabs">
        {agents.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`tile-grid-tab ${a.id === focusedTileId ? "tile-grid-tab-active" : ""} ${minimizedTileIds.includes(a.id) ? "tile-grid-tab-minimized" : ""}`}
            onClick={() => {
              if (minimizedTileIds.includes(a.id)) {
                useTileLayoutStore.getState().restoreTile(a.id);
              }
              setFocusedTile(a.id);
            }}
          >
            <span
              className={`tile-grid-tab-dot status-${a.status === "running" ? "running" : a.status === "waiting" ? "waiting" : a.status === "error" ? "error" : "idle"}`}
            />
            {AGENT_LABELS[a.agent_type] ?? a.agent_type}
          </button>
        ))}
        <button
          type="button"
          className="tile-grid-tab-add"
          onClick={onSpawnAgent}
          title="New agent"
        >
          +
        </button>
      </div>

      {/* Tile grid */}
      <div className="tile-grid" style={gridStyle(visibleAgents.length)}>
        {visibleAgents.map((agent) => (
          <div key={agent.id} className="tile-grid-cell">
            <AgentTile
              agent={agent}
              onClose={(id) => stopAgent(id)}
              onMaximize={(id) => maximizeTile(id)}
            />
          </div>
        ))}
      </div>

      {visibleAgents.length === 0 && (
        <div className="tile-grid-empty">
          <p>No agents in split view.</p>
          <button type="button" className="btn btn-primary" onClick={onSpawnAgent}>
            Spawn Agent
          </button>
        </div>
      )}
    </div>
  );
}
