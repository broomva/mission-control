import { beforeEach, describe, expect, it } from "vitest";
import { useReviewStore } from "../reviewStore";

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  agentId: "agent-1",
  agentName: "auth-fix (claude)",
  filePath: "src/auth.rs",
  additions: 12,
  deletions: 3,
  timestamp: "2024-01-01T00:00:00Z",
  ...overrides,
});

describe("reviewStore", () => {
  beforeEach(() => {
    useReviewStore.setState({
      entries: [],
      expandedEntryId: null,
    });
  });

  describe("addEntry", () => {
    it("adds entry to pending", () => {
      useReviewStore.getState().addEntry(makeEntry());

      const { entries } = useReviewStore.getState();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.status).toBe("pending");
      expect(entries[0]?.filePath).toBe("src/auth.rs");
      expect(entries[0]?.id).toBeTruthy();
    });

    it("assigns unique ids to each entry", () => {
      useReviewStore.getState().addEntry(makeEntry());
      useReviewStore.getState().addEntry(makeEntry({ filePath: "src/api.ts" }));

      const { entries } = useReviewStore.getState();
      expect(entries).toHaveLength(2);
      expect(entries[0]?.id).not.toBe(entries[1]?.id);
    });
  });

  describe("acceptEntry", () => {
    it("moves entry to accepted", () => {
      useReviewStore.getState().addEntry(makeEntry());
      const id = useReviewStore.getState().entries[0]?.id as string;

      useReviewStore.getState().acceptEntry(id);

      expect(useReviewStore.getState().entries[0]?.status).toBe("accepted");
    });

    it("does not affect other entries", () => {
      useReviewStore.getState().addEntry(makeEntry());
      useReviewStore.getState().addEntry(makeEntry({ filePath: "src/api.ts" }));
      const id = useReviewStore.getState().entries[0]?.id as string;

      useReviewStore.getState().acceptEntry(id);

      expect(useReviewStore.getState().entries[0]?.status).toBe("accepted");
      expect(useReviewStore.getState().entries[1]?.status).toBe("pending");
    });
  });

  describe("rejectEntry", () => {
    it("moves entry to rejected", () => {
      useReviewStore.getState().addEntry(makeEntry());
      const id = useReviewStore.getState().entries[0]?.id as string;

      useReviewStore.getState().rejectEntry(id);

      expect(useReviewStore.getState().entries[0]?.status).toBe("rejected");
    });
  });

  describe("acceptAllForAgent", () => {
    it("accepts all pending entries for a specific agent", () => {
      useReviewStore.getState().addEntry(makeEntry());
      useReviewStore.getState().addEntry(makeEntry({ filePath: "src/api.ts" }));
      useReviewStore.getState().addEntry(
        makeEntry({
          agentId: "agent-2",
          agentName: "tests (codex)",
          filePath: "test/auth.test.rs",
        }),
      );

      useReviewStore.getState().acceptAllForAgent("agent-1");

      const { entries } = useReviewStore.getState();
      expect(entries[0]?.status).toBe("accepted");
      expect(entries[1]?.status).toBe("accepted");
      expect(entries[2]?.status).toBe("pending");
    });

    it("does not affect already-rejected entries", () => {
      useReviewStore.getState().addEntry(makeEntry());
      useReviewStore.getState().addEntry(makeEntry({ filePath: "src/api.ts" }));
      const firstId = useReviewStore.getState().entries[0]?.id as string;

      useReviewStore.getState().rejectEntry(firstId);
      useReviewStore.getState().acceptAllForAgent("agent-1");

      const { entries } = useReviewStore.getState();
      expect(entries[0]?.status).toBe("rejected");
      expect(entries[1]?.status).toBe("accepted");
    });
  });

  describe("rejectAllForAgent", () => {
    it("rejects all pending entries for a specific agent", () => {
      useReviewStore.getState().addEntry(makeEntry());
      useReviewStore.getState().addEntry(
        makeEntry({
          agentId: "agent-2",
          agentName: "tests (codex)",
          filePath: "test/auth.test.rs",
        }),
      );

      useReviewStore.getState().rejectAllForAgent("agent-1");

      const { entries } = useReviewStore.getState();
      expect(entries[0]?.status).toBe("rejected");
      expect(entries[1]?.status).toBe("pending");
    });
  });

  describe("setExpandedEntry", () => {
    it("sets the expanded entry id", () => {
      useReviewStore.getState().setExpandedEntry("review-123");
      expect(useReviewStore.getState().expandedEntryId).toBe("review-123");
    });

    it("clears expanded entry when set to null", () => {
      useReviewStore.getState().setExpandedEntry("review-123");
      useReviewStore.getState().setExpandedEntry(null);
      expect(useReviewStore.getState().expandedEntryId).toBeNull();
    });
  });

  describe("clearApplied", () => {
    it("removes accepted and rejected entries, keeps pending", () => {
      useReviewStore.getState().addEntry(makeEntry());
      useReviewStore.getState().addEntry(makeEntry({ filePath: "src/api.ts" }));
      useReviewStore.getState().addEntry(makeEntry({ filePath: "src/lib.rs" }));

      const entries = useReviewStore.getState().entries;
      useReviewStore.getState().acceptEntry(entries[0]?.id as string);
      useReviewStore.getState().rejectEntry(entries[1]?.id as string);

      useReviewStore.getState().clearApplied();

      const remaining = useReviewStore.getState().entries;
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.filePath).toBe("src/lib.rs");
      expect(remaining[0]?.status).toBe("pending");
    });

    it("is a no-op when no applied entries exist", () => {
      useReviewStore.getState().addEntry(makeEntry());
      useReviewStore.getState().clearApplied();
      expect(useReviewStore.getState().entries).toHaveLength(1);
    });
  });
});
