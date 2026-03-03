import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { useCallback, useEffect, useRef } from "react";
import { ProjectDashboard } from "../panels/ProjectDashboard";
import { TerminalPanel } from "../panels/TerminalPanel";
import { useLayoutStore } from "../stores/layoutStore";

const components: Record<
  string,
  React.FunctionComponent<IDockviewPanelProps<any>>
> = {
  dashboard: ProjectDashboard,
  terminal: TerminalPanel,
};

export function DockviewWrapper() {
  const { setDockviewApi, saveLayout, loadLayout } = useLayoutStore();
  const initialized = useRef(false);

  const handleReady = useCallback(
    async (event: DockviewReadyEvent) => {
      const api = event.api;
      setDockviewApi(api);

      // Try to restore saved layout
      const savedLayout = await loadLayout();
      if (savedLayout) {
        try {
          const layoutData = JSON.parse(savedLayout);
          api.fromJSON(layoutData);
          initialized.current = true;
          return;
        } catch {
          // Corrupt layout, create default
        }
      }

      // Create default layout with dashboard panel
      api.addPanel({
        id: "project-dashboard",
        component: "dashboard",
        title: "Projects",
      });

      initialized.current = true;
    },
    [setDockviewApi, loadLayout],
  );

  // Save layout on changes (debounced via store)
  const { dockviewApi } = useLayoutStore();
  useEffect(() => {
    if (!dockviewApi || !initialized.current) return;

    const disposable = dockviewApi.onDidLayoutChange(() => {
      if (initialized.current) {
        saveLayout();
      }
    });

    return () => disposable.dispose();
  }, [dockviewApi, saveLayout]);

  return (
    <DockviewReact
      className="dockview-theme-abyss"
      components={components}
      onReady={handleReady}
    />
  );
}
