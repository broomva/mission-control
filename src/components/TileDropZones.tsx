import { useCallback, useState } from "react";
import type { DropPosition } from "../stores/tileLayoutStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";

interface TileDropZonesProps {
  targetAgentId: string;
}

const POSITIONS: DropPosition[] = ["top", "bottom", "left", "right"];

export function TileDropZones({ targetAgentId }: TileDropZonesProps) {
  const draggedAgentId = useTileLayoutStore((s) => s.draggedAgentId);
  const moveToSplit = useTileLayoutStore((s) => s.moveToSplit);
  const [activeZone, setActiveZone] = useState<DropPosition | null>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent, position: DropPosition) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setActiveZone(position);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.stopPropagation();
      setActiveZone(null);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, position: DropPosition) => {
      e.preventDefault();
      e.stopPropagation();
      setActiveZone(null);

      const agentId = e.dataTransfer.getData("agent-id") || draggedAgentId;
      if (agentId && agentId !== targetAgentId) {
        moveToSplit(agentId, targetAgentId, position);
      }
    },
    [draggedAgentId, targetAgentId, moveToSplit],
  );

  // Only show drop zones when a tab is being dragged and it's not over itself
  if (!draggedAgentId || draggedAgentId === targetAgentId) return null;

  return (
    <div className="tile-drop-zones">
      {POSITIONS.map((position) => (
        <div
          key={position}
          className={`tile-drop-zone tile-drop-${position}${activeZone === position ? " drag-over" : ""}`}
          onDragOver={(e) => handleDragOver(e, position)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, position)}
        />
      ))}
    </div>
  );
}
