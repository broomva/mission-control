import { useCallback, useMemo, useRef, useState } from "react";
import type { AgentInfo } from "../bindings";
import { useAgentStore } from "../stores/agentStore";
import type { SplitDirection } from "../stores/tileLayoutStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";
import { AgentTile } from "./AgentTile";
import { SplitContainer } from "./SplitContainer";

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
  const {
    maximizedTileId,
    minimizedTileIds,
    focusedTileId,
    splitLayout,
  } = useTileLayoutStore();
  const { maximizeTile, restoreGrid, setFocusedTile } = useTileLayoutStore();
  const { stopAgent, removeAgent } = useAgentStore();
  const [tabMenuId, setTabMenuId] = useState<string | null>(null);
  const tabMenuRef = useRef<HTMLDivElement>(null);

  // Close tab context menu on outside click
  const handleTabContextMenu = useCallback((e: React.MouseEvent, agentId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setTabMenuId(tabMenuId === agentId ? null : agentId);
  }, [tabMenuId]);

  const handleSplitTab = useCallback((_direction: SplitDirection) => {
    setTabMenuId(null);
    onSpawnAgent();
  }, [onSpawnAgent]);

  const handleCloseAgent = async (id: string) => {
    useTileLayoutStore.getState().removeFromSplit(id);
    await stopAgent(id);
    removeAgent(id);
  };

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
              handleCloseAgent(id);
            }}
            onMaximize={() => restoreGrid()}
          />
        </div>
      </div>
    );
  }

  // Use SplitContainer when a split layout exists
  const useSplitLayout = splitLayout !== null;

  return (
    <div className="tile-grid-wrapper">
      {/* Tab bar for split view — shows all agents + add button */}
      <div className="tile-grid-tabs">
        {agents.map((a) => (
          <div key={a.id} className="tile-grid-tab-wrapper">
            <button
              type="button"
              className={`tile-grid-tab ${a.id === focusedTileId ? "tile-grid-tab-active" : ""} ${minimizedTileIds.includes(a.id) ? "tile-grid-tab-minimized" : ""}`}
              onClick={() => {
                if (minimizedTileIds.includes(a.id)) {
                  useTileLayoutStore.getState().restoreTile(a.id);
                }
                setFocusedTile(a.id);
                setTabMenuId(null);
              }}
              onContextMenu={(e) => handleTabContextMenu(e, a.id)}
            >
              <span
                className={`tile-grid-tab-dot status-${a.status === "running" ? "running" : a.status === "waiting" ? "waiting" : a.status === "error" ? "error" : "idle"}`}
            />
            {AGENT_LABELS[a.agent_type] ?? a.agent_type}
            <span
              className="tile-grid-tab-close"
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleCloseAgent(a.id);
              }}
              onKeyDown={() => {}}
            >
              ×
            </span>
          </button>
          {tabMenuId === a.id && (
            <div className="tile-tab-context-menu" ref={tabMenuRef}>
              <button type="button" onClick={() => handleSplitTab("horizontal")}>
                Split Right ⬌
              </button>
              <button type="button" onClick={() => handleSplitTab("vertical")}>
                Split Down ⬍
              </button>
              <button type="button" onClick={() => { setTabMenuId(null); handleCloseAgent(a.id); }}>
                Close
              </button>
            </div>
          )}
          </div>
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

      {/* Draggable split layout */}
      {useSplitLayout && (
        <SplitContainer
          layout={splitLayout}
          agents={visibleAgents}
          onClose={handleCloseAgent}
          onMaximize={(id) => maximizeTile(id)}
        />
      )}

      {/* Fallback: CSS Grid layout */}
      {!useSplitLayout && visibleAgents.length > 0 && (
        <div className="tile-grid" style={gridStyle(visibleAgents.length)}>
          {visibleAgents.map((agent) => (
            <div key={agent.id} className="tile-grid-cell">
              <AgentTile
                agent={agent}
                onClose={handleCloseAgent}
                onMaximize={(id) => maximizeTile(id)}
              />
            </div>
          ))}
        </div>
      )}

      {!useSplitLayout && visibleAgents.length === 0 && (
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
