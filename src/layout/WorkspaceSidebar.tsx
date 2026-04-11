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

export function WorkspaceSidebar() {
  const { projects, activeProjectId, setActiveProject } = useProjectStore();
  const { sidebarTab, setSidebarTab } = useLayoutStore();
  const { fileStatuses, fetchStatus, startWatching, setupEventListeners } =
    useGitStore();
  const {
    agents,
    fetchAgents,
    setupEventListeners: setupAgentListeners,
  } = useAgentStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const project = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : null;

  const projectId = project?.id;
  const projectPath = project?.path;

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

  const filteredProjects = searchQuery
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : projects;

  return (
    <>
      <aside className="workspace-sidebar">
        {/* History section */}
        <div className="sidebar-history">
          <div className="sidebar-history-label">
            <span className="sidebar-history-icon">&#9201;</span>
            History
          </div>
          <div className="sidebar-history-empty">No recent sessions</div>
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
