import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentInfo } from "../bindings";
import type { LayoutNode } from "../stores/tileLayoutStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";
import { AgentTile } from "./AgentTile";

interface SplitContainerProps {
  layout: LayoutNode;
  agents: AgentInfo[];
  path?: number[];
  onClose: (id: string) => void;
  onMaximize: (id: string) => void;
}

export function SplitContainer({
  layout,
  agents,
  path = [],
  onClose,
  onMaximize,
}: SplitContainerProps) {
  if (layout.type === "leaf") {
    const agent = agents.find((a) => a.id === layout.agentId);
    if (!agent) return null;
    return (
      <div className="split-pane">
        <AgentTile agent={agent} onClose={onClose} onMaximize={onMaximize} />
      </div>
    );
  }

  return (
    <SplitPane
      layout={layout}
      agents={agents}
      path={path}
      onClose={onClose}
      onMaximize={onMaximize}
    />
  );
}

interface SplitPaneProps {
  layout: LayoutNode & { type: "split" };
  agents: AgentInfo[];
  path: number[];
  onClose: (id: string) => void;
  onMaximize: (id: string) => void;
}

function SplitPane({
  layout,
  agents,
  path,
  onClose,
  onMaximize,
}: SplitPaneProps) {
  const { updateSplitRatio, toggleSplitDirection } = useTileLayoutStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isHorizontal = layout.direction === "horizontal";

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    },
    [],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      let newRatio: number;

      if (isHorizontal) {
        newRatio = (e.clientX - rect.left) / rect.width;
      } else {
        newRatio = (e.clientY - rect.top) / rect.height;
      }

      updateSplitRatio(path, newRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isHorizontal, path, updateSplitRatio]);

  const firstStyle: React.CSSProperties = {
    flexBasis: `${layout.ratio * 100}%`,
    flexGrow: 0,
    flexShrink: 0,
  };

  const secondStyle: React.CSSProperties = {
    flexBasis: `${(1 - layout.ratio) * 100}%`,
    flexGrow: 0,
    flexShrink: 0,
  };

  const dividerClass = isHorizontal
    ? "split-divider-h"
    : "split-divider-v";

  return (
    <div
      ref={containerRef}
      className={`split-container ${isHorizontal ? "split-horizontal" : "split-vertical"}`}
    >
      <div className="split-pane" style={firstStyle}>
        <SplitContainer
          layout={layout.first}
          agents={agents}
          path={[...path, 0]}
          onClose={onClose}
          onMaximize={onMaximize}
        />
      </div>
      <div
        className={`${dividerClass}${isDragging ? " split-divider-active" : ""}`}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => toggleSplitDirection(path)}
        role="separator"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-label="Resize split pane (double-click to toggle direction)"
        title="Drag to resize · Double-click to toggle direction"
      />
      <div className="split-pane" style={secondStyle}>
        <SplitContainer
          layout={layout.second}
          agents={agents}
          path={[...path, 1]}
          onClose={onClose}
          onMaximize={onMaximize}
        />
      </div>
    </div>
  );
}
