import { create } from "zustand";

interface TileLayoutState {
  maximizedTileId: string | null;
  minimizedTileIds: string[];
  focusedTileId: string | null;

  maximizeTile: (id: string) => void;
  restoreGrid: () => void;
  minimizeTile: (id: string) => void;
  restoreTile: (id: string) => void;
  setFocusedTile: (id: string | null) => void;
}

export const useTileLayoutStore = create<TileLayoutState>((set) => ({
  maximizedTileId: null,
  minimizedTileIds: [],
  focusedTileId: null,

  maximizeTile: (id: string) => {
    set({ maximizedTileId: id, focusedTileId: id });
  },

  restoreGrid: () => {
    set({ maximizedTileId: null });
  },

  minimizeTile: (id: string) => {
    set((state) => ({
      minimizedTileIds: state.minimizedTileIds.includes(id)
        ? state.minimizedTileIds
        : [...state.minimizedTileIds, id],
      // If this was the focused tile, clear focus
      focusedTileId: state.focusedTileId === id ? null : state.focusedTileId,
      // If this was maximized, un-maximize
      maximizedTileId:
        state.maximizedTileId === id ? null : state.maximizedTileId,
    }));
  },

  restoreTile: (id: string) => {
    set((state) => ({
      minimizedTileIds: state.minimizedTileIds.filter((tid) => tid !== id),
    }));
  },

  setFocusedTile: (id: string | null) => {
    set({ focusedTileId: id });
  },
}));
