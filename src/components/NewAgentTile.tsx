interface NewAgentTileProps {
  onSpawnAgent: () => void;
}

export function NewAgentTile({ onSpawnAgent }: NewAgentTileProps) {
  return (
    <button
      type="button"
      className="new-agent-tile"
      onClick={onSpawnAgent}
      aria-label="Spawn new agent"
    >
      <span className="new-agent-tile-icon">+</span>
      <span className="new-agent-tile-label">New Agent</span>
    </button>
  );
}
