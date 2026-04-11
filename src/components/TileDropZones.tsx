import type { DropPosition } from "../stores/tileLayoutStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";

interface TileDropZonesProps {
  targetAgentId: string;
}

const POSITIONS: DropPosition[] = ["top", "bottom", "left", "right"];

export function TileDropZones({ targetAgentId }: TileDropZonesProps) {
  const draggedAgentId = useTileLayoutStore((s) => s.draggedAgentId);

  // Only show drop zones when dragging a different tile
  if (!draggedAgentId || draggedAgentId === targetAgentId) return null;

  return (
    <div className="tile-drop-zones">
      {POSITIONS.map((position) => (
        <div
          key={position}
          className={`tile-drop-zone tile-drop-${position}`}
          data-target-agent={targetAgentId}
          data-position={position}
        />
      ))}
    </div>
  );
}
