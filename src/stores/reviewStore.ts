import { create } from "zustand";

export interface ReviewEntry {
  id: string;
  agentId: string;
  agentName: string;
  filePath: string;
  additions: number;
  deletions: number;
  timestamp: string;
  status: "pending" | "accepted" | "rejected";
  diffContent?: string;
}

interface ReviewState {
  entries: ReviewEntry[];
  expandedEntryId: string | null;

  addEntry: (entry: Omit<ReviewEntry, "id" | "status">) => void;
  acceptEntry: (id: string) => void;
  rejectEntry: (id: string) => void;
  acceptAllForAgent: (agentId: string) => void;
  rejectAllForAgent: (agentId: string) => void;
  setExpandedEntry: (id: string | null) => void;
  clearApplied: () => void;
}

let counter = 0;

export const useReviewStore = create<ReviewState>((set) => ({
  entries: [],
  expandedEntryId: null,

  addEntry: (entry) => {
    const id = `review-${Date.now()}-${counter++}`;
    set((state) => ({
      entries: [
        ...state.entries,
        { ...entry, id, status: "pending" as const },
      ],
    }));
  },

  acceptEntry: (id) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, status: "accepted" as const } : e,
      ),
    }));
  },

  rejectEntry: (id) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === id ? { ...e, status: "rejected" as const } : e,
      ),
    }));
  },

  acceptAllForAgent: (agentId) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.agentId === agentId && e.status === "pending"
          ? { ...e, status: "accepted" as const }
          : e,
      ),
    }));
  },

  rejectAllForAgent: (agentId) => {
    set((state) => ({
      entries: state.entries.map((e) =>
        e.agentId === agentId && e.status === "pending"
          ? { ...e, status: "rejected" as const }
          : e,
      ),
    }));
  },

  setExpandedEntry: (id) => {
    set({ expandedEntryId: id });
  },

  clearApplied: () => {
    set((state) => ({
      entries: state.entries.filter((e) => e.status === "pending"),
    }));
  },
}));
