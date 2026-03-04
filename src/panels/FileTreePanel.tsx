import type { IDockviewPanelProps } from "dockview-react";
import { FileTreeView } from "../components/FileTreeView";

interface FileTreePanelParams {
  rootPath: string;
}

export function FileTreePanel({
  params,
}: IDockviewPanelProps<FileTreePanelParams>) {
  return <FileTreeView rootPath={params.rootPath} />;
}
