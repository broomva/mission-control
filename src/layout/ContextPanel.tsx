import { useEffect, useState } from "react";
import { AgentCard } from "../components/AgentCard";
import { FileTreeView } from "../components/FileTreeView";
import { GitLogView } from "../components/GitLogView";
import { SpawnAgentDialog } from "../components/SpawnAgentDialog";
import { useAgentStore } from "../stores/agentStore";
import { useGitStore } from "../stores/gitStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useProjectStore } from "../stores/projectStore";

export function ContextPanel() {
  const { activeProjectId, projects } = useProjectStore();
  const { contextPanelTab, setContextPanelTab } = useLayoutStore();
  const { fileStatuses, fetchStatus, startWatching, setupEventListeners } =
    useGitStore();
  const {
    agents,
    fetchAgents,
    setupEventListeners: setupAgentListeners,
  } = useAgentStore();
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);

  const project = activeProjectId
    ? projects.find((p) => p.id === activeProjectId)
    : null;

  const projectId = project?.id;
  const projectPath = project?.path;

  useEffect(() => {
    if (!projectId || !projectPath) return;
    startWatching(projectId, projectPath);
    fetchStatus(projectId, projectPath);
    setupEventListeners(projectId, projectPath);
  }, [projectId, projectPath, startWatching, fetchStatus, setupEventListeners]);

  // Fetch agents when project changes or tab switches to agents
  useEffect(() => {
    if (!projectId) return;
    if (contextPanelTab === "agents") {
      fetchAgents(projectId);
    }
  }, [projectId, contextPanelTab, fetchAgents]);

  // Set up agent event listeners
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    setupAgentListeners().then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [setupAgentListeners]);

  if (!project) return null;

  const statuses = fileStatuses[project.id];
  const projectAgents = agents.filter((a) => a.project_id === project.id);

  return (
    <aside className="context-panel">
      <div className="context-panel-header">
        <div className="context-panel-tabs">
          <button
            type="button"
            className={`context-panel-tab ${contextPanelTab === "files" ? "context-panel-tab-active" : ""}`}
            onClick={() => setContextPanelTab("files")}
          >
            Files
          </button>
          <button
            type="button"
            className={`context-panel-tab ${contextPanelTab === "git" ? "context-panel-tab-active" : ""}`}
            onClick={() => setContextPanelTab("git")}
          >
            Git
          </button>
          <button
            type="button"
            className={`context-panel-tab ${contextPanelTab === "agents" ? "context-panel-tab-active" : ""}`}
            onClick={() => setContextPanelTab("agents")}
          >
            Agents
          </button>
        </div>
        <span className="context-panel-project-name">{project.name}</span>
      </div>
      <div className="context-panel-body">
        {contextPanelTab === "files" ? (
          <FileTreeView rootPath={project.path} gitStatuses={statuses} />
        ) : contextPanelTab === "git" ? (
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
      {showSpawnDialog && (
        <SpawnAgentDialog onClose={() => setShowSpawnDialog(false)} />
      )}
    </aside>
  );
}
