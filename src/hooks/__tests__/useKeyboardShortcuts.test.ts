import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStore } from "../../stores/agentStore";
import { useLayoutStore } from "../../stores/layoutStore";
import { useTileLayoutStore } from "../../stores/tileLayoutStore";
import {
  type KeyboardShortcutConfig,
  useKeyboardShortcuts,
} from "../useKeyboardShortcuts";

function fireKey(
  key: string,
  opts: { metaKey?: boolean; shiftKey?: boolean } = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

describe("useKeyboardShortcuts", () => {
  let config: KeyboardShortcutConfig;

  beforeEach(() => {
    config = {
      onSpawnAgent: vi.fn(),
      onCloseAgent: vi.fn(),
    };

    // Reset stores
    useTileLayoutStore.setState({
      maximizedTileId: null,
      minimizedTileIds: [],
      focusedTileId: null,
    });

    useLayoutStore.setState({
      leftPaneVisible: true,
      rightPaneVisible: true,
    });

    const emptyTokenUsage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      cost_usd: 0,
    };

    useAgentStore.setState({
      agents: [
        {
          id: "agent-1",
          project_id: "proj-1",
          agent_type: "claude-code",
          status: "running",
          pid: 1234,
          session_id: null,
          started_at: "2026-01-01T00:00:00Z",
          prompt: null,
          cwd: "/tmp",
          token_usage: emptyTokenUsage,
        },
        {
          id: "agent-2",
          project_id: "proj-1",
          agent_type: "codex",
          status: "running",
          pid: 1235,
          session_id: null,
          started_at: "2026-01-01T00:00:01Z",
          prompt: null,
          cwd: "/tmp",
          token_usage: emptyTokenUsage,
        },
      ],
    });
  });

  it("Escape calls restoreGrid when a tile is maximized", () => {
    useTileLayoutStore.setState({ maximizedTileId: "agent-1" });

    renderHook(() => useKeyboardShortcuts(config));
    fireKey("Escape");

    expect(useTileLayoutStore.getState().maximizedTileId).toBeNull();
  });

  it("Escape does nothing when no tile is maximized", () => {
    renderHook(() => useKeyboardShortcuts(config));
    fireKey("Escape");

    expect(useTileLayoutStore.getState().maximizedTileId).toBeNull();
  });

  it("Cmd+Shift+D toggles right pane", () => {
    expect(useLayoutStore.getState().rightPaneVisible).toBe(true);

    renderHook(() => useKeyboardShortcuts(config));
    fireKey("D", { metaKey: true, shiftKey: true });

    expect(useLayoutStore.getState().rightPaneVisible).toBe(false);
  });

  it("Cmd+Shift+F toggles left pane", () => {
    expect(useLayoutStore.getState().leftPaneVisible).toBe(true);

    renderHook(() => useKeyboardShortcuts(config));
    fireKey("F", { metaKey: true, shiftKey: true });

    expect(useLayoutStore.getState().leftPaneVisible).toBe(false);
  });

  it("Cmd+1 focuses first agent tile", () => {
    renderHook(() => useKeyboardShortcuts(config));
    fireKey("1", { metaKey: true });

    expect(useTileLayoutStore.getState().focusedTileId).toBe("agent-1");
  });

  it("Cmd+2 focuses second agent tile", () => {
    renderHook(() => useKeyboardShortcuts(config));
    fireKey("2", { metaKey: true });

    expect(useTileLayoutStore.getState().focusedTileId).toBe("agent-2");
  });

  it("Cmd+9 does nothing when fewer than 9 agents exist", () => {
    renderHook(() => useKeyboardShortcuts(config));
    fireKey("9", { metaKey: true });

    expect(useTileLayoutStore.getState().focusedTileId).toBeNull();
  });

  it("Cmd+N calls onSpawnAgent", () => {
    renderHook(() => useKeyboardShortcuts(config));
    fireKey("n", { metaKey: true });

    expect(config.onSpawnAgent).toHaveBeenCalledOnce();
  });

  it("Cmd+W calls onCloseAgent with focused tile id", () => {
    useTileLayoutStore.setState({ focusedTileId: "agent-1" });

    renderHook(() => useKeyboardShortcuts(config));
    fireKey("w", { metaKey: true });

    expect(config.onCloseAgent).toHaveBeenCalledWith("agent-1");
  });

  it("Cmd+W does nothing when no tile is focused", () => {
    renderHook(() => useKeyboardShortcuts(config));
    fireKey("w", { metaKey: true });

    expect(config.onCloseAgent).not.toHaveBeenCalled();
  });

  it("Cmd+Shift+M minimizes focused tile", () => {
    useTileLayoutStore.setState({ focusedTileId: "agent-1" });

    renderHook(() => useKeyboardShortcuts(config));
    fireKey("M", { metaKey: true, shiftKey: true });

    expect(useTileLayoutStore.getState().minimizedTileIds).toContain(
      "agent-1",
    );
  });

  it("Cmd+Shift+M does nothing when no tile is focused", () => {
    renderHook(() => useKeyboardShortcuts(config));
    fireKey("M", { metaKey: true, shiftKey: true });

    expect(useTileLayoutStore.getState().minimizedTileIds).toEqual([]);
  });

  it("Cmd+. stops agent in focused tile", () => {
    useTileLayoutStore.setState({ focusedTileId: "agent-1" });
    const stopSpy = vi.spyOn(useAgentStore.getState(), "stopAgent");

    renderHook(() => useKeyboardShortcuts(config));
    fireKey(".", { metaKey: true });

    expect(stopSpy).toHaveBeenCalledWith("agent-1");
    stopSpy.mockRestore();
  });

  it("does not intercept when typing in an input element", () => {
    renderHook(() => useKeyboardShortcuts(config));

    // Create an input and dispatch the event from it
    const input = document.createElement("input");
    document.body.appendChild(input);

    const event = new KeyboardEvent("keydown", {
      key: "n",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    // Override target by dispatching from the input
    input.dispatchEvent(event);

    expect(config.onSpawnAgent).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("cleans up event listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useKeyboardShortcuts(config));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
  });
});
