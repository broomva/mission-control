import { useLayoutStore } from "../stores/layoutStore";
import { DockviewWrapper } from "./DockviewWrapper";

export function AppShell() {
  const { addDashboardPanel } = useLayoutStore();

  return (
    <div className="app-shell">
      <div className="toolbar">
        <span className="toolbar-title">Mission Control</span>
        <div className="toolbar-actions">
          <button
            type="button"
            className="btn btn-toolbar"
            onClick={addDashboardPanel}
          >
            Projects
          </button>
        </div>
      </div>
      <div className="dockview-container">
        <DockviewWrapper />
      </div>
    </div>
  );
}
