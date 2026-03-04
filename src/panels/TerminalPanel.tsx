import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { IDockviewPanelProps } from "dockview-react";
import { useCallback, useEffect, useRef } from "react";
import { commands, events } from "../bindings";

interface TerminalPanelParams {
  terminalId: string;
  restoredSession?: boolean;
}

export function TerminalPanel({
  params,
}: IDockviewPanelProps<TerminalPanelParams>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const terminalId = params.terminalId;
  const restoredSession = params.restoredSession ?? false;

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
      fontFamily:
        "'SF Mono', Menlo, Monaco, 'Cascadia Code', 'Courier New', monospace",
      theme: {
        background: "#0a0a16",
        foreground: "rgba(255, 255, 255, 0.92)",
        cursor: "#007AFF",
        cursorAccent: "#0a0a16",
        selectionBackground: "rgba(0, 122, 255, 0.25)",
        black: "#1c1c1e",
        brightBlack: "#48484a",
        red: "#FF453A",
        brightRed: "#FF6961",
        green: "#30D158",
        brightGreen: "#4BDE80",
        yellow: "#FFD60A",
        brightYellow: "#FFE620",
        blue: "#007AFF",
        brightBlue: "#409CFF",
        magenta: "#BF5AF2",
        brightMagenta: "#DA8FFF",
        cyan: "#5AC8FA",
        brightCyan: "#70D7FF",
        white: "rgba(255, 255, 255, 0.85)",
        brightWhite: "rgba(255, 255, 255, 0.95)",
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

    // Restore scrollback if this is a restored session
    if (restoredSession) {
      commands.getTerminalScrollback(terminalId).then((result) => {
        if (result.status === "ok" && result.data.length > 0) {
          const bytes = new Uint8Array(result.data);
          term.write(bytes);
          term.write(
            new Uint8Array(
              new TextEncoder().encode("\r\n[Session restored]\r\n"),
            ),
          );
        } else {
          term.write(
            new Uint8Array(
              new TextEncoder().encode("\r\n[Session exited]\r\n"),
            ),
          );
        }
      });
    }

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
  }, [terminalId, restoredSession, handleResize]);

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
