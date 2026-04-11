import { beforeEach, describe, expect, it } from "vitest";
import { useTileLayoutStore } from "../tileLayoutStore";

describe("tileLayoutStore", () => {
  beforeEach(() => {
    useTileLayoutStore.setState({
      maximizedTileId: null,
      minimizedTileIds: [],
      focusedTileId: null,
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
});
