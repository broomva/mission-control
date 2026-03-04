import { useCallback, useEffect, useState } from "react";
import type { DirectoryEntry } from "../bindings";
import { commands } from "../bindings";

interface FileTreeViewProps {
  rootPath: string;
}

interface TreeNode extends DirectoryEntry {
  children?: TreeNode[];
  expanded?: boolean;
  loading?: boolean;
  depth: number;
}

export function FileTreeView({ rootPath }: FileTreeViewProps) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const loadDirectory = useCallback(async (path: string, depth: number) => {
    const result = await commands.readDirectory(path);
    if (result.status === "ok") {
      return result.data.map(
        (entry): TreeNode => ({
          ...entry,
          depth,
          expanded: false,
          loading: false,
        }),
      );
    }
    return [];
  }, []);

  useEffect(() => {
    if (!rootPath) return;
    setError(null);
    loadDirectory(rootPath, 0).then((entries) => {
      if (entries.length > 0) {
        setNodes(entries);
      } else {
        setError("Empty directory");
      }
    });
  }, [rootPath, loadDirectory]);

  const toggleExpand = useCallback(
    async (targetPath: string) => {
      setNodes((prev) => {
        const update = (items: TreeNode[]): TreeNode[] =>
          items.map((node) => {
            if (node.path === targetPath) {
              if (node.expanded) {
                return { ...node, expanded: false };
              }
              return { ...node, loading: true, expanded: true };
            }
            if (node.children) {
              return { ...node, children: update(node.children) };
            }
            return node;
          });
        return update(prev);
      });

      const findNode = (items: TreeNode[]): TreeNode | null => {
        for (const item of items) {
          if (item.path === targetPath) return item;
          if (item.children) {
            const found = findNode(item.children);
            if (found) return found;
          }
        }
        return null;
      };

      const node = findNode(nodes);
      if (node && node.is_dir && !node.children) {
        const children = await loadDirectory(targetPath, node.depth + 1);
        setNodes((prev) => {
          const update = (items: TreeNode[]): TreeNode[] =>
            items.map((n) => {
              if (n.path === targetPath) {
                return { ...n, children, loading: false, expanded: true };
              }
              if (n.children) {
                return { ...n, children: update(n.children) };
              }
              return n;
            });
          return update(prev);
        });
      } else {
        setNodes((prev) => {
          const update = (items: TreeNode[]): TreeNode[] =>
            items.map((n) => {
              if (n.path === targetPath) {
                return { ...n, loading: false };
              }
              if (n.children) {
                return { ...n, children: update(n.children) };
              }
              return n;
            });
          return update(prev);
        });
      }
    },
    [nodes, loadDirectory],
  );

  const renderNode = (node: TreeNode): React.ReactNode => {
    if (!showHidden && node.is_hidden) return null;

    const indent = node.depth * 16;

    return (
      <div key={node.path}>
        <button
          type="button"
          className={`file-tree-item ${node.is_dir ? "file-tree-dir" : "file-tree-file"}`}
          style={{ paddingLeft: `${indent + 8}px` }}
          onClick={() => {
            if (node.is_dir) toggleExpand(node.path);
          }}
        >
          <span className="file-tree-icon">
            {node.is_dir ? (node.expanded ? "\u25BE" : "\u25B8") : "\u00B7"}
          </span>
          <span className="file-tree-name">{node.name}</span>
        </button>
        {node.expanded && node.children && (
          <div className="file-tree-children">
            {node.children.map(renderNode)}
          </div>
        )}
        {node.expanded && node.loading && (
          <div
            className="file-tree-loading"
            style={{ paddingLeft: `${indent + 24}px` }}
          >
            Loading...
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="file-tree-panel">
      <div className="file-tree-toolbar">
        <span className="file-tree-root-name">
          {rootPath.split("/").pop() || rootPath}
        </span>
        <button
          type="button"
          className="btn btn-toolbar"
          onClick={() => setShowHidden((v) => !v)}
          title={showHidden ? "Hide hidden files" : "Show hidden files"}
        >
          {showHidden ? "H" : "."}
        </button>
      </div>
      <div className="file-tree-list">
        {error && <div className="file-tree-error">{error}</div>}
        {nodes.map(renderNode)}
      </div>
    </div>
  );
}
