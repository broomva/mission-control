import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../bindings";

interface ProjectCardProps {
  project: Project;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
  style?: React.CSSProperties;
}

function shortenPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, "~");
}

export function ProjectCard({
  project,
  isActive,
  onClick,
  onRemove,
  style,
}: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleMenuClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setMenuOpen((prev) => !prev);
    },
    [],
  );

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setMenuOpen(false);
      onRemove();
    },
    [onRemove],
  );

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const cardClass = `project-card${isActive ? " project-card-active" : ""}`;

  return (
    <div
      className={cardClass}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      role="button"
      tabIndex={0}
      style={style}
    >
      <div className="project-card-name">{project.name}</div>
      <div className="project-card-path">{shortenPath(project.path)}</div>
      <div className="project-card-meta">
        <span className="project-card-branch">main</span>
        <span className="project-card-info">&middot;</span>
        <span className="project-card-info">
          {new Date(project.created_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      {/* Ellipsis menu — visible on hover only (via CSS) */}
      <div ref={menuRef}>
        <button
          type="button"
          className="project-card-menu"
          onClick={handleMenuClick}
          aria-label="Project actions"
        >
          &#8942;
        </button>

        {menuOpen && (
          <div className="project-card-context-menu">
            <button type="button" onClick={handleRemove}>
              <span style={{ color: "var(--color-error)" }}>Remove</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
