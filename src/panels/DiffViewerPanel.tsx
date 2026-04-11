import { useEffect, useState } from "react";
import type { DiffInfo } from "../bindings";
import { commands } from "../bindings";

interface DiffViewerPanelProps {
  projectId: string;
  projectPath: string;
  commitOid: string;
}

export function DiffViewerPanel({
  projectId,
  projectPath,
  commitOid,
}: DiffViewerPanelProps) {
  const [diff, setDiff] = useState<DiffInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      const result = await commands.gitDiff(projectId, projectPath, commitOid);
      if (result.status === "ok") {
        setDiff(result.data);
        // Expand all files by default
        const paths = new Set(result.data.files.map((f) => f.path));
        setExpandedFiles(paths);
      } else {
        setError("Failed to load diff");
      }
    }
    load();
  }, [projectId, projectPath, commitOid]);

  const toggleFile = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (error) {
    return (
      <div className="diff-viewer">
        <div className="empty-state">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="diff-viewer">
        <div className="empty-state">
          <p>Loading diff...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <span className="diff-header-oid">{commitOid.slice(0, 7)}</span>
        <div className="diff-stats">
          <span className="diff-stats-files">
            {diff.stats.files_changed} file
            {diff.stats.files_changed !== 1 ? "s" : ""}
          </span>
          <span className="diff-stats-add">+{diff.stats.insertions}</span>
          <span className="diff-stats-del">-{diff.stats.deletions}</span>
        </div>
      </div>

      <div className="diff-files">
        {diff.files.map((file) => (
          <div key={file.path} className="diff-file">
            <button
              type="button"
              className="diff-file-header"
              onClick={() => toggleFile(file.path)}
            >
              <span className="diff-file-toggle">
                {expandedFiles.has(file.path) ? "\u25BE" : "\u25B8"}
              </span>
              <span
                className={`diff-file-status diff-file-status-${file.status}`}
              >
                {file.status.charAt(0).toUpperCase()}
              </span>
              <span className="diff-file-path">{file.path}</span>
              {file.old_path && (
                <span className="diff-file-old-path">
                  &larr; {file.old_path}
                </span>
              )}
            </button>

            {expandedFiles.has(file.path) && (
              <div className="diff-file-hunks">
                {file.hunks.map((hunk, hunkIdx) => (
                  <div
                    key={`${file.path}-hunk-${hunkIdx}`}
                    className="diff-hunk"
                  >
                    <div className="diff-hunk-header">{hunk.header}</div>
                    <pre className="diff-hunk-lines">
                      {hunk.lines.map((line, lineIdx) => (
                        <div
                          key={`${file.path}-${hunkIdx}-${lineIdx}`}
                          className={`diff-line ${
                            line.origin === "+"
                              ? "diff-line-add"
                              : line.origin === "-"
                                ? "diff-line-del"
                                : "diff-line-context"
                          }`}
                        >
                          <span className="diff-line-number">
                            {line.old_lineno ?? " "}
                          </span>
                          <span className="diff-line-number">
                            {line.new_lineno ?? " "}
                          </span>
                          <span className="diff-line-origin">
                            {line.origin}
                          </span>
                          <span className="diff-line-content">
                            {line.content}
                          </span>
                        </div>
                      ))}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
