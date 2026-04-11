import { FileTreeView } from "../components/FileTreeView";

interface FileTreePanelProps {
  rootPath: string;
}

export function FileTreePanel({ rootPath }: FileTreePanelProps) {
  return <FileTreeView rootPath={rootPath} />;
}
