import { useState } from "react";
import { type ReviewEntry, useReviewStore } from "../stores/reviewStore";

export function ReviewQueue() {
  const {
    entries,
    expandedEntryId,
    acceptEntry,
    rejectEntry,
    acceptAllForAgent,
    rejectAllForAgent,
    setExpandedEntry,
    clearApplied,
  } = useReviewStore();

  const [pendingOpen, setPendingOpen] = useState(true);
  const [appliedOpen, setAppliedOpen] = useState(false);

  const pending = entries.filter((e) => e.status === "pending");
  const applied = entries.filter(
    (e) => e.status === "accepted" || e.status === "rejected",
  );

  // Group pending entries by agent
  const pendingByAgent = new Map<
    string,
    { agentName: string; entries: ReviewEntry[] }
  >();
  for (const entry of pending) {
    const group = pendingByAgent.get(entry.agentId);
    if (group) {
      group.entries.push(entry);
    } else {
      pendingByAgent.set(entry.agentId, {
        agentName: entry.agentName,
        entries: [entry],
      });
    }
  }

  const handleViewDiff = (id: string) => {
    setExpandedEntry(expandedEntryId === id ? null : id);
  };

  return (
    <div className="review-queue">
      {/* Pending Section */}
      <div className="review-section">
        <button
          type="button"
          className="review-section-header"
          onClick={() => setPendingOpen(!pendingOpen)}
        >
          <span className="review-section-toggle">
            {pendingOpen ? "\u25BE" : "\u25B8"}
          </span>
          <span>Pending</span>
          <span className="review-section-count">{pending.length}</span>
        </button>

        {pendingOpen && (
          <div className="review-section-body">
            {pending.length === 0 ? (
              <div className="review-empty">
                <p>No pending changes.</p>
                <p>Agent diffs will appear here for review.</p>
              </div>
            ) : (
              Array.from(pendingByAgent.entries()).map(
                ([agentId, group]) => (
                  <div key={agentId} className="review-agent-group">
                    <div className="review-agent-header">
                      <span className="review-agent-name">
                        {group.agentName}
                      </span>
                      <div className="review-batch-actions">
                        <button
                          type="button"
                          className="btn btn-toolbar review-batch-btn"
                          onClick={() => acceptAllForAgent(agentId)}
                          title="Accept all for this agent"
                        >
                          Accept All
                        </button>
                        <button
                          type="button"
                          className="btn btn-toolbar review-batch-btn"
                          onClick={() => rejectAllForAgent(agentId)}
                          title="Reject all for this agent"
                        >
                          Reject All
                        </button>
                      </div>
                    </div>

                    {group.entries.map((entry) => (
                      <div key={entry.id} className="review-entry">
                        <div className="review-entry-row">
                          <span className="review-entry-path">
                            {entry.filePath}
                          </span>
                          <span className="review-entry-stats">
                            <span className="review-entry-add">
                              +{entry.additions}
                            </span>
                            <span className="review-entry-del">
                              -{entry.deletions}
                            </span>
                          </span>
                        </div>
                        <div className="review-entry-actions">
                          <button
                            type="button"
                            className="btn btn-toolbar"
                            onClick={() => handleViewDiff(entry.id)}
                          >
                            {expandedEntryId === entry.id
                              ? "Hide Diff"
                              : "View Diff"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary review-action-accept"
                            onClick={() => acceptEntry(entry.id)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger review-action-reject"
                            onClick={() => rejectEntry(entry.id)}
                          >
                            Reject
                          </button>
                        </div>

                        {expandedEntryId === entry.id && (
                          <div className="review-entry-diff">
                            {entry.diffContent ? (
                              <pre className="review-diff-content">
                                {entry.diffContent
                                  .split("\n")
                                  .map((line, i) => (
                                    <div
                                      key={`${entry.id}-line-${i}`}
                                      className={
                                        line.startsWith("+")
                                          ? "diff-line diff-line-add"
                                          : line.startsWith("-")
                                            ? "diff-line diff-line-del"
                                            : "diff-line diff-line-context"
                                      }
                                    >
                                      <span className="diff-line-origin">
                                        {line.charAt(0) || " "}
                                      </span>
                                      <span className="diff-line-content">
                                        {line.slice(1)}
                                      </span>
                                    </div>
                                  ))}
                              </pre>
                            ) : (
                              <p className="review-diff-empty">
                                No diff content available.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ),
              )
            )}
          </div>
        )}
      </div>

      {/* Applied Section */}
      <div className="review-section">
        <button
          type="button"
          className="review-section-header"
          onClick={() => setAppliedOpen(!appliedOpen)}
        >
          <span className="review-section-toggle">
            {appliedOpen ? "\u25BE" : "\u25B8"}
          </span>
          <span>Applied</span>
          <span className="review-section-count">{applied.length}</span>
        </button>

        {appliedOpen && (
          <div className="review-section-body">
            {applied.length === 0 ? (
              <div className="review-empty">
                <p>No reviewed changes yet.</p>
              </div>
            ) : (
              <>
                {applied.map((entry) => (
                  <div
                    key={entry.id}
                    className={`review-entry review-entry-${entry.status}`}
                  >
                    <div className="review-entry-row">
                      <span className="review-entry-path">
                        {entry.filePath}
                      </span>
                      <span className="review-entry-stats">
                        <span className="review-entry-add">
                          +{entry.additions}
                        </span>
                        <span className="review-entry-del">
                          -{entry.deletions}
                        </span>
                        <span className="review-entry-status-icon">
                          {entry.status === "accepted" ? "\u2713" : "\u2717"}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
                <div className="review-clear-actions">
                  <button
                    type="button"
                    className="btn btn-toolbar"
                    onClick={clearApplied}
                  >
                    Clear Applied
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
