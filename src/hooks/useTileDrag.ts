import { useCallback, useEffect, useRef } from "react";
import type { DropPosition } from "../stores/tileLayoutStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";

const DRAG_THRESHOLD = 5; // px before drag starts

interface DragState {
  agentId: string;
  startX: number;
  startY: number;
  isDragging: boolean;
  ghost: HTMLDivElement | null;
}

/**
 * Custom drag implementation using mouse events.
 * Works in WKWebView (Tauri) where HTML5 DnD is unreliable.
 */
export function useTileDrag() {
  const dragState = useRef<DragState | null>(null);
  const { setDraggedAgent, moveToSplit } = useTileLayoutStore();

  const startDrag = useCallback(
    (e: React.MouseEvent, agentId: string, label: string) => {
      e.preventDefault();
      dragState.current = {
        agentId,
        startX: e.clientX,
        startY: e.clientY,
        isDragging: false,
        ghost: null,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        const state = dragState.current;
        if (!state) return;

        const dx = ev.clientX - state.startX;
        const dy = ev.clientY - state.startY;

        // Check threshold before starting drag
        if (!state.isDragging) {
          if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
            return;
          }
          // Start dragging
          state.isDragging = true;
          setDraggedAgent(state.agentId);
          document.body.style.userSelect = "none";
          document.body.style.cursor = "grabbing";

          // Create ghost
          const ghost = document.createElement("div");
          ghost.style.cssText = `
            position: fixed;
            padding: 6px 16px;
            background: #2a2a27;
            color: #e8e4e0;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            font-family: inherit;
            border: 1px solid rgba(45, 212, 168, 0.5);
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            pointer-events: none;
            z-index: 9999;
            white-space: nowrap;
          `;
          ghost.textContent = label;
          document.body.appendChild(ghost);
          state.ghost = ghost;
        }

        // Update ghost position
        if (state.ghost) {
          state.ghost.style.left = `${ev.clientX + 12}px`;
          state.ghost.style.top = `${ev.clientY - 12}px`;
        }

        // Find drop zone under cursor
        const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
        // Clear all previous highlights
        document.querySelectorAll(".tile-drop-zone.drag-over").forEach((el) => {
          el.classList.remove("drag-over");
        });
        // Find and highlight the drop zone
        for (const el of elements) {
          if (el.classList.contains("tile-drop-zone")) {
            el.classList.add("drag-over");
            break;
          }
        }
      };

      const handleMouseUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";

        const state = dragState.current;
        if (!state) return;

        // Clean up ghost
        if (state.ghost) {
          state.ghost.remove();
        }

        if (state.isDragging) {
          // Find the drop zone under cursor
          const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
          for (const el of elements) {
            if (el.classList.contains("tile-drop-zone")) {
              const targetId = el.getAttribute("data-target-agent");
              const position = el.getAttribute("data-position") as DropPosition;
              if (targetId && position && targetId !== state.agentId) {
                moveToSplit(state.agentId, targetId, position);
              }
              break;
            }
          }

          // Clear all highlights
          document.querySelectorAll(".tile-drop-zone.drag-over").forEach((el) => {
            el.classList.remove("drag-over");
          });
        }

        setDraggedAgent(null);
        dragState.current = null;
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [setDraggedAgent, moveToSplit],
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (dragState.current?.ghost) {
        dragState.current.ghost.remove();
      }
    };
  }, []);

  return { startDrag };
}
