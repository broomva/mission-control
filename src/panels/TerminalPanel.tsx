import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { IDockviewPanelProps } from "dockview-react";
import { useCallback, useEffect, useRef } from "react";
import { commands, events } from "../bindings";

interface TerminalPanelParams {
  terminalId: string;
}

export function TerminalPanel({
  params,
}: IDockviewPanelProps<TerminalPanelParams>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const terminalId = params.terminalId;

  const handleResize = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    const terminal = terminalRef.current;
    if (!fitAddon || !terminal) return;

    try {
      fitAddon.fit();
      commands.resizeTerminal(terminalId, terminal.cols, terminal.rows);
    } catch {
      // Ignore resize errors during initialization
    }
  }, [terminalId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: "#1a1a2e",
        foreground: "#e0e0e0",
        cursor: "#e0e0e0",
        selectionBackground: "#3d3d5c",
      },
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(container);

    // Try WebGL, fall back gracefully
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available, software rendering is fine
    }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Initial fit
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        commands.resizeTerminal(terminalId, term.cols, term.rows);
      } catch {
        // Ignore initial resize errors
      }
    });

    // Input: terminal -> PTY
    const onDataDisposable = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      commands.writeTerminal(terminalId, bytes);
    });

    // Output: PTY -> terminal
    const unlistenData = events.terminalDataEvent.listen((event) => {
      if (event.payload.terminal_id === terminalId) {
        const bytes = new Uint8Array(event.payload.data);
        term.write(bytes);
      }
    });

    // Exit event
    const unlistenExit = events.terminalExitEvent.listen((event) => {
      if (event.payload.terminal_id === terminalId) {
        term.write("\r\n[Process exited]\r\n");
      }
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(handleResize);
    });
    resizeObserver.observe(container);

    return () => {
      onDataDisposable.dispose();
      unlistenData.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [terminalId, handleResize]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    />
  );
}
