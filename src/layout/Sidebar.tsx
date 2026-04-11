import { useEffect, useState } from "react";
import { AddProjectDialog } from "../components/AddProjectDialog";
import { AgentCard } from "../components/AgentCard";
import { FileTreeView } from "../components/FileTreeView";
import { GitLogView } from "../components/GitLogView";
import { SpawnAgentDialog } from "../components/SpawnAgentDialog";
import { useAgentStore } from "../stores/agentStore";
import { useGitStore } from "../stores/gitStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";

export function Sidebar() {
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
      // Deselect — return to dashboard view
      setActiveProject(null);
    } else {
      setActiveProject(proj.id);
    }
  };

  const handleAllProjects = () => {
    setActiveProject(null);
  };

  const statuses = project ? fileStatuses[project.id] : undefined;
  const projectAgents = project
    ? agents.filter((a) => a.project_id === project.id)
    : [];

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-label">Projects</span>
          <button
            type="button"
            className="btn btn-toolbar sidebar-add-btn"
            onClick={() => setShowAddDialog(true)}
            title="Add Project"
          >
            +
          </button>
        </div>
        <nav className="sidebar-nav">
          {projects.map((proj) => (
            <button
              key={proj.id}
              type="button"
              className={`sidebar-item ${activeProjectId === proj.id ? "sidebar-item-active" : ""}`}
              onClick={() => handleProjectClick(proj)}
              title={proj.path}
            >
              <span className="sidebar-item-icon">
                {activeProjectId === proj.id ? "\u25C9" : "\u25CB"}
              </span>
              <span className="sidebar-item-name">{proj.name}</span>
            </button>
          ))}
          {projects.length === 0 && (
            <div className="sidebar-empty">No projects</div>
          )}
        </nav>

        {/* File tree / Git / Agents tabs — shown when a project is selected */}
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
                <GitLogView projectId={project.id} projectPath={project.path} />
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

        <div className="sidebar-footer">
          <button
            type="button"
            className="btn btn-toolbar sidebar-footer-btn"
            onClick={handleAllProjects}
          >
            All Projects
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
