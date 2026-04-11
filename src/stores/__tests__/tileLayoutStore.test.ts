import { beforeEach, describe, expect, it } from "vitest";
import { collectAgentIds, useTileLayoutStore } from "../tileLayoutStore";
import type { LayoutNode } from "../tileLayoutStore";

describe("tileLayoutStore", () => {
  beforeEach(() => {
    useTileLayoutStore.setState({
      maximizedTileId: null,
      minimizedTileIds: [],
      focusedTileId: null,
      splitLayout: null,
    });
  });

  describe("initial state", () => {
    it("has no maximized tile", () => {
      expect(useTileLayoutStore.getState().maximizedTileId).toBeNull();
    });

    it("has no minimized tiles", () => {
      expect(useTileLayoutStore.getState().minimizedTileIds).toEqual([]);
    });

    it("has no focused tile", () => {
      expect(useTileLayoutStore.getState().focusedTileId).toBeNull();
    });

    it("has no split layout", () => {
      expect(useTileLayoutStore.getState().splitLayout).toBeNull();
    });
  });

  describe("maximizeTile", () => {
    it("sets the maximized tile id", () => {
      useTileLayoutStore.getState().maximizeTile("agent-1");
      expect(useTileLayoutStore.getState().maximizedTileId).toBe("agent-1");
    });

    it("also focuses the maximized tile", () => {
      useTileLayoutStore.getState().maximizeTile("agent-1");
      expect(useTileLayoutStore.getState().focusedTileId).toBe("agent-1");
    });

    it("replaces previous maximized tile", () => {
      useTileLayoutStore.getState().maximizeTile("agent-1");
      useTileLayoutStore.getState().maximizeTile("agent-2");
      expect(useTileLayoutStore.getState().maximizedTileId).toBe("agent-2");
    });
  });

  describe("restoreGrid", () => {
    it("clears the maximized tile", () => {
      useTileLayoutStore.getState().maximizeTile("agent-1");
      useTileLayoutStore.getState().restoreGrid();
      expect(useTileLayoutStore.getState().maximizedTileId).toBeNull();
    });

    it("does nothing when no tile is maximized", () => {
      useTileLayoutStore.getState().restoreGrid();
      expect(useTileLayoutStore.getState().maximizedTileId).toBeNull();
    });
  });

  describe("minimizeTile", () => {
    it("adds a tile to minimized list", () => {
      useTileLayoutStore.getState().minimizeTile("agent-1");
      expect(useTileLayoutStore.getState().minimizedTileIds).toEqual([
        "agent-1",
      ]);
    });

    it("does not duplicate if already minimized", () => {
      useTileLayoutStore.getState().minimizeTile("agent-1");
      useTileLayoutStore.getState().minimizeTile("agent-1");
      expect(useTileLayoutStore.getState().minimizedTileIds).toEqual([
        "agent-1",
      ]);
    });

    it("can minimize multiple tiles", () => {
      useTileLayoutStore.getState().minimizeTile("agent-1");
      useTileLayoutStore.getState().minimizeTile("agent-2");
      expect(useTileLayoutStore.getState().minimizedTileIds).toEqual([
        "agent-1",
        "agent-2",
      ]);
    });

    it("clears focus if the focused tile is minimized", () => {
      useTileLayoutStore.getState().setFocusedTile("agent-1");
      useTileLayoutStore.getState().minimizeTile("agent-1");
      expect(useTileLayoutStore.getState().focusedTileId).toBeNull();
    });

    it("preserves focus on a different tile", () => {
      useTileLayoutStore.getState().setFocusedTile("agent-2");
      useTileLayoutStore.getState().minimizeTile("agent-1");
      expect(useTileLayoutStore.getState().focusedTileId).toBe("agent-2");
    });

    it("un-maximizes the tile if it was maximized", () => {
      useTileLayoutStore.getState().maximizeTile("agent-1");
      useTileLayoutStore.getState().minimizeTile("agent-1");
      expect(useTileLayoutStore.getState().maximizedTileId).toBeNull();
    });
  });

  describe("restoreTile", () => {
    it("removes a tile from minimized list", () => {
      useTileLayoutStore.getState().minimizeTile("agent-1");
      useTileLayoutStore.getState().restoreTile("agent-1");
      expect(useTileLayoutStore.getState().minimizedTileIds).toEqual([]);
    });

    it("does nothing for a non-minimized tile", () => {
      useTileLayoutStore.getState().minimizeTile("agent-1");
      useTileLayoutStore.getState().restoreTile("agent-2");
      expect(useTileLayoutStore.getState().minimizedTileIds).toEqual([
        "agent-1",
      ]);
    });

    it("preserves other minimized tiles", () => {
      useTileLayoutStore.getState().minimizeTile("agent-1");
      useTileLayoutStore.getState().minimizeTile("agent-2");
      useTileLayoutStore.getState().restoreTile("agent-1");
      expect(useTileLayoutStore.getState().minimizedTileIds).toEqual([
        "agent-2",
      ]);
    });
  });

  describe("setFocusedTile", () => {
    it("sets the focused tile", () => {
      useTileLayoutStore.getState().setFocusedTile("agent-1");
      expect(useTileLayoutStore.getState().focusedTileId).toBe("agent-1");
    });

    it("can clear focused tile with null", () => {
      useTileLayoutStore.getState().setFocusedTile("agent-1");
      useTileLayoutStore.getState().setFocusedTile(null);
      expect(useTileLayoutStore.getState().focusedTileId).toBeNull();
    });

    it("replaces previous focused tile", () => {
      useTileLayoutStore.getState().setFocusedTile("agent-1");
      useTileLayoutStore.getState().setFocusedTile("agent-2");
      expect(useTileLayoutStore.getState().focusedTileId).toBe("agent-2");
    });
  });

  describe("addToSplit", () => {
    it("creates a single leaf when no layout exists", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      const layout = useTileLayoutStore.getState().splitLayout;
      expect(layout).toEqual({ type: "leaf", agentId: "agent-1" });
    });

    it("creates a horizontal split when adding a second agent", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      const layout = useTileLayoutStore.getState().splitLayout;
      expect(layout).not.toBeNull();
      expect(layout!.type).toBe("split");
      if (layout!.type === "split") {
        expect(layout!.direction).toBe("horizontal");
        expect(layout!.ratio).toBe(0.5);
        expect(layout!.first).toEqual({ type: "leaf", agentId: "agent-1" });
        expect(layout!.second).toEqual({ type: "leaf", agentId: "agent-2" });
      }
    });

    it("splits the smallest leaf when adding a third agent", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().addToSplit("agent-3");
      const layout = useTileLayoutStore.getState().splitLayout;
      expect(layout).not.toBeNull();

      // Should contain all three agents
      const ids = collectAgentIds(layout!);
      expect(ids).toContain("agent-1");
      expect(ids).toContain("agent-2");
      expect(ids).toContain("agent-3");
      expect(ids).toHaveLength(3);
    });

    it("alternates split direction for nested splits", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().addToSplit("agent-3");
      const layout = useTileLayoutStore.getState().splitLayout;
      expect(layout!.type).toBe("split");
      if (layout!.type === "split") {
        // Root is horizontal, nested split should be vertical
        expect(layout!.direction).toBe("horizontal");
        const nestedSplit =
          layout!.second.type === "split" ? layout!.second : layout!.first;
        if (nestedSplit.type === "split") {
          expect(nestedSplit.direction).toBe("vertical");
        }
      }
    });
  });

  describe("removeFromSplit", () => {
    it("removes the only leaf, resulting in null", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().removeFromSplit("agent-1");
      expect(useTileLayoutStore.getState().splitLayout).toBeNull();
    });

    it("collapses a split to a single leaf when one is removed", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().removeFromSplit("agent-1");
      const layout = useTileLayoutStore.getState().splitLayout;
      expect(layout).toEqual({ type: "leaf", agentId: "agent-2" });
    });

    it("does nothing when removing a non-existent agent", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      const before = useTileLayoutStore.getState().splitLayout;
      useTileLayoutStore.getState().removeFromSplit("agent-999");
      const after = useTileLayoutStore.getState().splitLayout;
      expect(after).toEqual(before);
    });

    it("handles removal from a three-agent layout", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().addToSplit("agent-3");
      useTileLayoutStore.getState().removeFromSplit("agent-2");
      const layout = useTileLayoutStore.getState().splitLayout;
      const ids = collectAgentIds(layout!);
      expect(ids).toContain("agent-1");
      expect(ids).toContain("agent-3");
      expect(ids).not.toContain("agent-2");
    });
  });

  describe("updateSplitRatio", () => {
    it("updates the ratio of the root split node", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().updateSplitRatio([], 0.7);
      const layout = useTileLayoutStore.getState().splitLayout;
      expect(layout!.type).toBe("split");
      if (layout!.type === "split") {
        expect(layout!.ratio).toBe(0.7);
      }
    });

    it("clamps ratio to minimum 0.2", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().updateSplitRatio([], 0.05);
      const layout = useTileLayoutStore.getState().splitLayout;
      if (layout!.type === "split") {
        expect(layout!.ratio).toBe(0.2);
      }
    });

    it("clamps ratio to maximum 0.8", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().updateSplitRatio([], 0.95);
      const layout = useTileLayoutStore.getState().splitLayout;
      if (layout!.type === "split") {
        expect(layout!.ratio).toBe(0.8);
      }
    });

    it("does nothing when splitLayout is null", () => {
      useTileLayoutStore.getState().updateSplitRatio([], 0.5);
      expect(useTileLayoutStore.getState().splitLayout).toBeNull();
    });

    it("does nothing when path points to a leaf", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      const before = useTileLayoutStore.getState().splitLayout;
      useTileLayoutStore.getState().updateSplitRatio([0], 0.3);
      const after = useTileLayoutStore.getState().splitLayout;
      // Path [0] points to the first leaf, not a split — should be unchanged
      expect(after).toEqual(before);
    });
  });

  describe("setSplitLayout", () => {
    it("sets the layout directly", () => {
      const layout: LayoutNode = {
        type: "split",
        direction: "horizontal",
        ratio: 0.6,
        first: { type: "leaf", agentId: "a" },
        second: { type: "leaf", agentId: "b" },
      };
      useTileLayoutStore.getState().setSplitLayout(layout);
      expect(useTileLayoutStore.getState().splitLayout).toEqual(layout);
    });

    it("can clear the layout with null", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().setSplitLayout(null);
      expect(useTileLayoutStore.getState().splitLayout).toBeNull();
    });
  });

  describe("draggedAgentId", () => {
    it("defaults to null", () => {
      expect(useTileLayoutStore.getState().draggedAgentId).toBeNull();
    });

    it("sets the dragged agent", () => {
      useTileLayoutStore.getState().setDraggedAgent("agent-1");
      expect(useTileLayoutStore.getState().draggedAgentId).toBe("agent-1");
    });

    it("clears the dragged agent with null", () => {
      useTileLayoutStore.getState().setDraggedAgent("agent-1");
      useTileLayoutStore.getState().setDraggedAgent(null);
      expect(useTileLayoutStore.getState().draggedAgentId).toBeNull();
    });
  });

  describe("moveToSplit", () => {
    it("does nothing when layout is null", () => {
      useTileLayoutStore.getState().moveToSplit("a", "b", "left");
      expect(useTileLayoutStore.getState().splitLayout).toBeNull();
    });

    it("does nothing when dragging onto itself", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      const before = useTileLayoutStore.getState().splitLayout;
      useTileLayoutStore.getState().moveToSplit("agent-1", "agent-1", "left");
      expect(useTileLayoutStore.getState().splitLayout).toEqual(before);
    });

    it("moves agent to the left of target (horizontal split)", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().addToSplit("agent-3");

      // Move agent-1 to the left of agent-3
      useTileLayoutStore.getState().moveToSplit("agent-1", "agent-3", "left");
      const layout = useTileLayoutStore.getState().splitLayout;
      const ids = collectAgentIds(layout!);
      expect(ids).toContain("agent-1");
      expect(ids).toContain("agent-2");
      expect(ids).toContain("agent-3");
      expect(ids).toHaveLength(3);
    });

    it("moves agent to the right of target (horizontal split)", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");

      useTileLayoutStore.getState().moveToSplit("agent-1", "agent-2", "right");
      const layout = useTileLayoutStore.getState().splitLayout;
      expect(layout).not.toBeNull();
      expect(layout!.type).toBe("split");
      if (layout!.type === "split") {
        expect(layout!.direction).toBe("horizontal");
        expect(layout!.first).toEqual({ type: "leaf", agentId: "agent-2" });
        expect(layout!.second).toEqual({ type: "leaf", agentId: "agent-1" });
      }
    });

    it("moves agent to the top of target (vertical split)", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");

      useTileLayoutStore.getState().moveToSplit("agent-1", "agent-2", "top");
      const layout = useTileLayoutStore.getState().splitLayout;
      expect(layout).not.toBeNull();
      expect(layout!.type).toBe("split");
      if (layout!.type === "split") {
        expect(layout!.direction).toBe("vertical");
        expect(layout!.first).toEqual({ type: "leaf", agentId: "agent-1" });
        expect(layout!.second).toEqual({ type: "leaf", agentId: "agent-2" });
      }
    });

    it("moves agent to the bottom of target (vertical split)", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");

      useTileLayoutStore.getState().moveToSplit("agent-1", "agent-2", "bottom");
      const layout = useTileLayoutStore.getState().splitLayout;
      expect(layout).not.toBeNull();
      expect(layout!.type).toBe("split");
      if (layout!.type === "split") {
        expect(layout!.direction).toBe("vertical");
        expect(layout!.first).toEqual({ type: "leaf", agentId: "agent-2" });
        expect(layout!.second).toEqual({ type: "leaf", agentId: "agent-1" });
      }
    });

    it("clears draggedAgentId after move", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().setDraggedAgent("agent-1");
      useTileLayoutStore.getState().moveToSplit("agent-1", "agent-2", "left");
      expect(useTileLayoutStore.getState().draggedAgentId).toBeNull();
    });

    it("creates correct split ratio of 0.5", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().moveToSplit("agent-1", "agent-2", "left");
      const layout = useTileLayoutStore.getState().splitLayout;
      if (layout!.type === "split") {
        expect(layout!.ratio).toBe(0.5);
      }
    });

    it("preserves all agents when moving in a three-agent layout", () => {
      useTileLayoutStore.getState().addToSplit("agent-1");
      useTileLayoutStore.getState().addToSplit("agent-2");
      useTileLayoutStore.getState().addToSplit("agent-3");

      useTileLayoutStore.getState().moveToSplit("agent-3", "agent-1", "bottom");
      const layout = useTileLayoutStore.getState().splitLayout;
      const ids = collectAgentIds(layout!);
      expect(ids.sort()).toEqual(["agent-1", "agent-2", "agent-3"]);
    });
  });

  describe("collectAgentIds", () => {
    it("returns a single id for a leaf", () => {
      expect(collectAgentIds({ type: "leaf", agentId: "a" })).toEqual(["a"]);
    });

    it("returns all ids from a nested tree", () => {
      const tree: LayoutNode = {
        type: "split",
        direction: "horizontal",
        ratio: 0.5,
        first: { type: "leaf", agentId: "a" },
        second: {
          type: "split",
          direction: "vertical",
          ratio: 0.5,
          first: { type: "leaf", agentId: "b" },
          second: { type: "leaf", agentId: "c" },
        },
      };
      const ids = collectAgentIds(tree);
      expect(ids).toEqual(["a", "b", "c"]);
    });
  });
});
