import { useMemo } from "react";
import type { AgentInfo } from "../bindings";
import { useTileLayoutStore } from "../stores/tileLayoutStore";
import { AgentTile } from "./AgentTile";
import { NewAgentTile } from "./NewAgentTile";

interface TileGridProps {
  agents: AgentInfo[];
  onSpawnAgent: () => void;
}

/**
 * Compute CSS Grid template for a given number of visible tiles (including the [+] tile).
 *
 * Layout rules:
 *   1 tile  -> 1x1
 *   2 tiles -> 2x1
 *   3 tiles -> 2x1 + 1 spanning full width
 *   4 tiles -> 2x2
 *   5-6     -> 3x2
 *   7-9     -> 3x3
 *   10+     -> 3-col scrollable
 */
function gridStyle(tileCount: number): React.CSSProperties {
  if (tileCount <= 0) {
    return { gridTemplateColumns: "1fr" };
  }
  if (tileCount === 1) {
    return { gridTemplateColumns: "1fr" };
  }
  if (tileCount === 2) {
    return { gridTemplateColumns: "1fr 1fr" };
  }
  if (tileCount === 3) {
    // 2 columns, the 3rd item spans both via CSS class
    return { gridTemplateColumns: "1fr 1fr" };
  }
  if (tileCount === 4) {
    return { gridTemplateColumns: "1fr 1fr" };
  }
  if (tileCount <= 6) {
    return { gridTemplateColumns: "1fr 1fr 1fr" };
  }
  if (tileCount <= 9) {
    return { gridTemplateColumns: "1fr 1fr 1fr" };
  }
  // 10+ -> scrollable 3-col
  return {
    gridTemplateColumns: "1fr 1fr 1fr",
    overflowY: "auto" as const,
  };
}

export function TileGrid({ agents, onSpawnAgent }: TileGridProps) {
  const { maximizedTileId, minimizedTileIds } = useTileLayoutStore();
  const { maximizeTile, restoreGrid } = useTileLayoutStore();

  // Filter out minimized agents for the grid
  const visibleAgents = useMemo(
    () => agents.filter((a) => !minimizedTileIds.includes(a.id)),
    [agents, minimizedTileIds],
  );

  // Maximized view: show only that agent
  const maximizedAgent = maximizedTileId
    ? agents.find((a) => a.id === maximizedTileId)
    : null;

  if (maximizedAgent) {
    return (
      <div className="tile-grid tile-grid-maximized">
        <AgentTile
          agent={maximizedAgent}
          onClose={() => restoreGrid()}
          onMaximize={() => restoreGrid()}
        />
      </div>
    );
  }

  // Total cells = visible agents + 1 for [+] tile
  const totalCells = visibleAgents.length + 1;
  const style = gridStyle(totalCells);

  // Check if the last item in a 3-tile layout needs to span
  const shouldSpanLast = totalCells === 3;

  return (
    <div className="tile-grid" style={style}>
      {visibleAgents.map((agent, index) => {
        const isLastInThreeLayout =
          shouldSpanLast && index === visibleAgents.length - 1;
        return (
          <div
            key={agent.id}
            className={`tile-grid-cell ${isLastInThreeLayout ? "tile-grid-cell-span" : ""}`}
          >
            <AgentTile
              agent={agent}
              onClose={() => {
                // Stop and remove from grid
                // The agent store handles lifecycle
              }}
              onMaximize={(id) => maximizeTile(id)}
            />
          </div>
        );
      })}
      <div
        className={`tile-grid-cell ${shouldSpanLast && visibleAgents.length === 2 ? "tile-grid-cell-span" : ""}`}
      >
        <NewAgentTile onSpawnAgent={onSpawnAgent} />
      </div>

      {/* Minimized status row */}
      {minimizedTileIds.length > 0 && (
        <div className="tile-minimized-row">
          {minimizedTileIds.map((id) => {
            const agent = agents.find((a) => a.id === id);
            if (!agent) return null;
            return (
              <button
                key={id}
                type="button"
                className="tile-minimized-chip"
                onClick={() => useTileLayoutStore.getState().restoreTile(id)}
              >
                <span
                  className={`agent-tile-status-dot ${agent.status === "running" ? "status-running" : agent.status === "waiting" ? "status-waiting" : agent.status === "error" ? "status-error" : "status-idle"}`}
                />
                <span>{agent.agent_type}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
