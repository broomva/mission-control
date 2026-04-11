import { useEffect } from "react";
import { useAgentStore } from "../stores/agentStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useTileLayoutStore } from "../stores/tileLayoutStore";

export interface KeyboardShortcutConfig {
  onSpawnAgent: () => void;
  onCloseAgent: (id: string) => void;
}

/**
 * Global keyboard shortcut handler for tile grid navigation.
 *
 * Shortcuts:
 *   Cmd+N           — open SpawnAgentDialog
 *   Cmd+W           — close focused agent tile
 *   Cmd+1..9        — focus agent tile N (by index)
 *   Cmd+Shift+D     — toggle right pane
 *   Cmd+Shift+F     — toggle left pane
 *   Cmd+.           — stop agent in focused tile
 *   Escape          — restore grid view if maximized
 *   Cmd+Shift+M     — minimize focused tile
 */
export function useKeyboardShortcuts(config: KeyboardShortcutConfig) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Don't intercept when user is typing in an input/textarea/contenteditable
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Escape — restore grid view if a tile is maximized
      if (event.key === "Escape") {
        const { maximizedTileId, restoreGrid } =
          useTileLayoutStore.getState();
        if (maximizedTileId) {
          event.preventDefault();
          restoreGrid();
        }
        return;
      }

      // All remaining shortcuts require Cmd (metaKey on Mac)
      if (!event.metaKey) return;

      // Cmd+Shift+<key> shortcuts
      if (event.shiftKey) {
        switch (event.key.toUpperCase()) {
          case "D": {
            // Cmd+Shift+D — toggle right pane
            event.preventDefault();
            useLayoutStore.getState().toggleRightPane();
            return;
          }
          case "F": {
            // Cmd+Shift+F — toggle left pane
            event.preventDefault();
            useLayoutStore.getState().toggleLeftPane();
            return;
          }
          case "M": {
            // Cmd+Shift+M — minimize focused tile
            event.preventDefault();
            const { focusedTileId, minimizeTile } =
              useTileLayoutStore.getState();
            if (focusedTileId) {
              minimizeTile(focusedTileId);
            }
            return;
          }
        }
        return;
      }

      // Cmd+<key> shortcuts (no shift)
      switch (event.key.toLowerCase()) {
        case "n": {
          // Cmd+N — spawn new agent
          event.preventDefault();
          config.onSpawnAgent();
          return;
        }
        case "w": {
          // Cmd+W — close focused agent tile
          event.preventDefault();
          const { focusedTileId } = useTileLayoutStore.getState();
          if (focusedTileId) {
            config.onCloseAgent(focusedTileId);
          }
          return;
        }
        case ".": {
          // Cmd+. — stop agent in focused tile
          event.preventDefault();
          const { focusedTileId } = useTileLayoutStore.getState();
          if (focusedTileId) {
            useAgentStore.getState().stopAgent(focusedTileId);
          }
          return;
        }
      }

      // Cmd+1 through Cmd+9 — focus agent tile by index
      const digit = Number.parseInt(event.key, 10);
      if (digit >= 1 && digit <= 9) {
        event.preventDefault();
        const agents = useAgentStore.getState().agents;
        const index = digit - 1;
        const agent = agents[index];
        if (agent) {
          useTileLayoutStore.getState().setFocusedTile(agent.id);
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [config]);
}
