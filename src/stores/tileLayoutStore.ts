import { create } from "zustand";

// --- Split Layout Tree Types ---

export type SplitDirection = "horizontal" | "vertical";

export interface SplitNode {
  type: "split";
  direction: SplitDirection;
  ratio: number; // 0.0 to 1.0, position of the divider
  first: LayoutNode;
  second: LayoutNode;
}

export interface LeafNode {
  type: "leaf";
  agentId: string;
}

export type LayoutNode = SplitNode | LeafNode;

// --- Helper functions for the split layout tree ---

/** Find the smallest leaf (by depth — deepest = smallest on screen) to split */
function findSmallestLeafPath(node: LayoutNode, path: number[] = []): number[] {
  if (node.type === "leaf") return path;
  const firstPath = findSmallestLeafPath(node.first, [...path, 0]);
  const secondPath = findSmallestLeafPath(node.second, [...path, 1]);
  // Prefer the second child (typically the smaller/newer one)
  return secondPath.length >= firstPath.length ? secondPath : firstPath;
}

/** Get a node at a given path */
function getNodeAtPath(
  root: LayoutNode,
  path: number[],
): LayoutNode | undefined {
  let current: LayoutNode = root;
  for (const idx of path) {
    if (current.type !== "split") return undefined;
    current = idx === 0 ? current.first : current.second;
  }
  return current;
}

/** Replace a node at a given path, returning a new tree */
function replaceAtPath(
  root: LayoutNode,
  path: number[],
  replacement: LayoutNode,
): LayoutNode {
  if (path.length === 0) return replacement;
  if (root.type !== "split") return root;

  const [head, ...rest] = path;
  if (head === 0) {
    return { ...root, first: replaceAtPath(root.first, rest, replacement) };
  }
  return { ...root, second: replaceAtPath(root.second, rest, replacement) };
}

/** Remove a leaf by agentId and collapse the tree */
function removeLeaf(node: LayoutNode, agentId: string): LayoutNode | null {
  if (node.type === "leaf") {
    return node.agentId === agentId ? null : node;
  }

  const firstResult = removeLeaf(node.first, agentId);
  const secondResult = removeLeaf(node.second, agentId);

  // If first child was removed, return the second
  if (firstResult === null) return secondResult;
  // If second child was removed, return the first
  if (secondResult === null) return firstResult;

  // If neither was removed but the subtree changed, return updated node
  if (firstResult !== node.first || secondResult !== node.second) {
    return { ...node, first: firstResult, second: secondResult };
  }

  return node;
}

/** Collect all agent IDs from the tree */
export function collectAgentIds(node: LayoutNode): string[] {
  if (node.type === "leaf") return [node.agentId];
  return [...collectAgentIds(node.first), ...collectAgentIds(node.second)];
}

// --- Store ---

interface TileLayoutState {
  maximizedTileId: string | null;
  minimizedTileIds: string[];
  focusedTileId: string | null;
  splitLayout: LayoutNode | null;

  maximizeTile: (id: string) => void;
  restoreGrid: () => void;
  minimizeTile: (id: string) => void;
  restoreTile: (id: string) => void;
  setFocusedTile: (id: string | null) => void;
  setSplitLayout: (layout: LayoutNode | null) => void;
  updateSplitRatio: (path: number[], ratio: number) => void;
  addToSplit: (agentId: string) => void;
  removeFromSplit: (agentId: string) => void;
  toggleSplitDirection: (path: number[]) => void;
}

export const useTileLayoutStore = create<TileLayoutState>((set) => ({
  maximizedTileId: null,
  minimizedTileIds: [],
  focusedTileId: null,
  splitLayout: null,

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

  setSplitLayout: (layout: LayoutNode | null) => {
    set({ splitLayout: layout });
  },

  updateSplitRatio: (path: number[], ratio: number) => {
    set((state) => {
      if (!state.splitLayout) return state;
      // Clamp ratio between 0.2 and 0.8 (min 20% per side)
      const clamped = Math.max(0.2, Math.min(0.8, ratio));
      const nodeAtPath = getNodeAtPath(state.splitLayout, path);
      if (!nodeAtPath || nodeAtPath.type !== "split") return state;
      const updated = replaceAtPath(state.splitLayout, path, {
        ...nodeAtPath,
        ratio: clamped,
      });
      return { splitLayout: updated };
    });
  },

  addToSplit: (agentId: string) => {
    set((state) => {
      const newLeaf: LeafNode = { type: "leaf", agentId };

      // No layout yet — create a single leaf
      if (!state.splitLayout) {
        return { splitLayout: newLeaf };
      }

      // If it's just a single leaf, create first split
      if (state.splitLayout.type === "leaf") {
        return {
          splitLayout: {
            type: "split",
            direction: "horizontal",
            ratio: 0.5,
            first: state.splitLayout,
            second: newLeaf,
          },
        };
      }

      // Find the smallest leaf to split
      const targetPath = findSmallestLeafPath(state.splitLayout);
      const targetNode = getNodeAtPath(state.splitLayout, targetPath);
      if (!targetNode || targetNode.type !== "leaf") return state;

      // Determine split direction: alternate from parent
      const parentPath = targetPath.slice(0, -1);
      const parentNode =
        parentPath.length > 0
          ? getNodeAtPath(state.splitLayout, parentPath)
          : state.splitLayout;
      const parentDirection =
        parentNode?.type === "split" ? parentNode.direction : "horizontal";
      const newDirection: SplitDirection =
        parentDirection === "horizontal" ? "vertical" : "horizontal";

      const newSplit: SplitNode = {
        type: "split",
        direction: newDirection,
        ratio: 0.5,
        first: targetNode,
        second: newLeaf,
      };

      const updated = replaceAtPath(state.splitLayout, targetPath, newSplit);
      return { splitLayout: updated };
    });
  },

  toggleSplitDirection: (path: number[]) => {
    set((state) => {
      if (!state.splitLayout) return state;
      const node = getNodeAtPath(state.splitLayout, path);
      if (!node || node.type !== "split") return state;
      const toggled = {
        ...node,
        direction: (node.direction === "horizontal" ? "vertical" : "horizontal") as SplitDirection,
      };
      const updated = replaceAtPath(state.splitLayout, path, toggled);
      return { splitLayout: updated };
    });
  },

  removeFromSplit: (agentId: string) => {
    set((state) => {
      if (!state.splitLayout) return state;
      const result = removeLeaf(state.splitLayout, agentId);
      return { splitLayout: result };
    });
  },
}));
