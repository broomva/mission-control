import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { AddProjectDialog } from "../components/AddProjectDialog";
import { AgentCard } from "../components/AgentCard";
import { FileTreeView } from "../components/FileTreeView";
import { GitGraph } from "../components/GitGraph";
import { SpawnAgentDialog } from "../components/SpawnAgentDialog";
import { WorktreeManager } from "../components/WorktreeManager";
import { useAgentStore } from "../stores/agentStore";
import { useGitStore } from "../stores/gitStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";
import { useSessionStore } from "../stores/sessionStore";

function formatRelativeTime(timestampMs: number): string {
  const now = Date.now();
  const diffMs = now - timestampMs;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(timestampMs).toLocaleDateString();
}

/** Show the last 2 meaningful path segments for a cwd. */
function shortenCwd(cwd: string): string {
  const home = "/Users/";
  let rel = cwd;
  // Strip /Users/<username>/ prefix
  if (rel.startsWith(home)) {
    const afterUser = rel.indexOf("/", home.length);
    if (afterUser !== -1) {
      rel = rel.slice(afterUser + 1);
    }
  }
  const parts = rel.split("/").filter(Boolean);
  if (parts.length <= 2) return parts.join("/");
  return parts.slice(-2).join("/");
}

interface WorkspaceSidebarProps {
  style?: CSSProperties;
}

export function WorkspaceSidebar({ style }: WorkspaceSidebarProps) {
  const { projects, activeProjectId, setActiveProject } = useProjectStore();
  const { sidebarTab, setSidebarTab } = useLayoutStore();
  const { fileStatuses, fetchStatus, startWatching, setupEventListeners } =
    useGitStore();
  const {
    agents,
    fetchAgents,
    setupEventListeners: setupAgentListeners,
  } = useAgentStore();
  const { sessions, fetchSessions } = useSessionStore();
  const { spawnAgent } = useAgentStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [historyExpanded, setHistoryExpanded] = useState(true);

  const project = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : null;

  const projectId = project?.id;
  const projectPath = project?.path;

  // Fetch Claude Code session history on mount
  useEffect(() => {
    fetchSessions(50);
  }, [fetchSessions]);

  // Re-fetch sessions when agents change (new spawn creates a session file)
  const agentCount = agents.length;
  useEffect(() => {
    if (agentCount > 0) {
      // Small delay to let Claude write the session file
      const timer = setTimeout(() => fetchSessions(50), 2000);
      return () => clearTimeout(timer);
    }
  }, [agentCount, fetchSessions]);

  // Watch git status for active project
  useEffect(() => {
    if (!projectId || !projectPath) return;
    startWatching(projectId, projectPath);
    fetchStatus(projectId, projectPath);
    setupEventListeners(projectId, projectPath);
  }, [projectId, projectPath, startWatching, fetchStatus, setupEventListeners]);

  // Fetch agents when project changes or tab switches to agents
  useEffect(() => {
    if (!projectId) return;
    if (sidebarTab === "agents") {
      fetchAgents(projectId);
    }
  }, [projectId, sidebarTab, fetchAgents]);

  // Set up agent event listeners
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    setupAgentListeners().then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [setupAgentListeners]);

  const handleRestoreSession = async (sessionId: string, cwd: string) => {
    // Find or use the active project
    const targetProject =
      project || projects.find((p) => cwd.startsWith(p.path));
    if (!targetProject) return;
    await spawnAgent(targetProject.id, "claude-code", null, cwd, sessionId);
  };

  const handleProjectClick = (proj: (typeof projects)[number]) => {
    if (activeProjectId === proj.id) {
      setActiveProject(null);
    } else {
      setActiveProject(proj.id);
    }
  };

  const statuses = project ? fileStatuses[project.id] : undefined;
  const projectAgents = project
    ? agents.filter((a) => a.project_id === project.id)
    : [];

  const filteredSessions = project
    ? sessions.filter((s) => s.cwd.startsWith(project.path))
    : sessions;

  const filteredProjects = searchQuery
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : projects;

  return (
    <>
      <aside className="workspace-sidebar" style={style}>
        {/* History section */}
        <div className="sidebar-history">
          <button
            type="button"
            className="sidebar-history-label"
            onClick={() => setHistoryExpanded(!historyExpanded)}
          >
            <span className="sidebar-history-toggle">
              {historyExpanded ? "\u25BE" : "\u25B8"}
            </span>
            History
            {filteredSessions.length > 0 && (
              <span className="sidebar-history-count">
                {filteredSessions.length}
              </span>
            )}
          </button>
          {historyExpanded && (
            <div className="sidebar-history-list">
              {filteredSessions.length === 0 ? (
                <div className="sidebar-history-empty">No recent sessions</div>
              ) : (
                filteredSessions.map((s) => (
                  <button
                    key={s.session_id}
                    type="button"
                    className="sidebar-history-item"
                    title={`Restore: ${s.cwd}`}
                    onClick={() => handleRestoreSession(s.session_id, s.cwd)}
                  >
                    <span className="sidebar-history-item-cwd">
                      {shortenCwd(s.cwd)}
                    </span>
                    <span className="sidebar-history-item-time">
                      {formatRelativeTime(s.started_at)}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Workspaces header with actions */}
        <div className="sidebar-header">
          <span className="sidebar-label">Workspaces</span>
          <div className="sidebar-header-actions">
            <button
              type="button"
              className="sidebar-header-icon-btn"
              title="Filter"
            >
              &#9707;
            </button>
            <button
              type="button"
              className="sidebar-header-icon-btn"
              title="Sort"
            >
              &#8693;
            </button>
            <button
              type="button"
              className="sidebar-header-icon-btn"
              onClick={() => setShowAddDialog(true)}
              title="Add Workspace"
            >
              +
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Projects list */}
        <nav className="sidebar-nav">
          {filteredProjects.map((proj) => (
            <button
              key={proj.id}
              type="button"
              className={`sidebar-item ${activeProjectId === proj.id ? "sidebar-item-active" : ""}`}
              onClick={() => handleProjectClick(proj)}
              title={proj.path}
            >
              <span className="sidebar-item-project-icon">
                {proj.name.charAt(0).toUpperCase()}
              </span>
              <span className="sidebar-item-name">{proj.name}</span>
            </button>
          ))}
          {filteredProjects.length === 0 && (
            <div className="sidebar-empty">
              {searchQuery ? "No matches" : "No projects"}
            </div>
          )}
        </nav>

        {/* Detail tabs — shown when a project is selected */}
        {project && (
          <div className="sidebar-detail">
            <div className="sidebar-detail-tabs">
              <button
                type="button"
                className={`sidebar-detail-tab ${sidebarTab === "files" ? "sidebar-detail-tab-active" : ""}`}
                onClick={() => setSidebarTab("files")}
              >
                Files
              </button>
              <button
                type="button"
                className={`sidebar-detail-tab ${sidebarTab === "git" ? "sidebar-detail-tab-active" : ""}`}
                onClick={() => setSidebarTab("git")}
              >
                Git
              </button>
              <button
                type="button"
                className={`sidebar-detail-tab ${sidebarTab === "worktrees" ? "sidebar-detail-tab-active" : ""}`}
                onClick={() => setSidebarTab("worktrees")}
              >
                Trees
              </button>
              <button
                type="button"
                className={`sidebar-detail-tab ${sidebarTab === "agents" ? "sidebar-detail-tab-active" : ""}`}
                onClick={() => setSidebarTab("agents")}
              >
                Agents
              </button>
            </div>
            <div className="sidebar-detail-body">
              {sidebarTab === "files" ? (
                <FileTreeView rootPath={project.path} gitStatuses={statuses} />
              ) : sidebarTab === "git" ? (
                <GitGraph projectId={project.id} projectPath={project.path} />
              ) : sidebarTab === "worktrees" ? (
                <WorktreeManager
                  projectId={project.id}
                  projectPath={project.path}
                />
              ) : (
                <div className="agents-tab">
                  <div className="agents-tab-header">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setShowSpawnDialog(true)}
                    >
                      Spawn Agent
                    </button>
                  </div>
                  {projectAgents.length === 0 ? (
                    <div className="empty-state">
                      <p>No agents running.</p>
                      <p>Spawn one to get started.</p>
                    </div>
                  ) : (
                    <div className="agents-list">
                      {projectAgents.map((agent) => (
                        <AgentCard key={agent.id} agent={agent} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom: help and settings icons */}
        <div className="sidebar-footer-icons">
          <button
            type="button"
            className="sidebar-footer-icon-btn"
            title="Help"
          >
            ?
          </button>
          <button
            type="button"
            className="sidebar-footer-icon-btn"
            title="Settings"
          >
            &#9881;
          </button>
        </div>
      </aside>
      {showAddDialog && (
        <AddProjectDialog onClose={() => setShowAddDialog(false)} />
      )}
      {showSpawnDialog && (
        <SpawnAgentDialog onClose={() => setShowSpawnDialog(false)} />
      )}
    </>
  );
}
