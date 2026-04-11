import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AgentEvent, commands, events } from "../bindings";

const EVENT_ICONS: Record<string, string> = {
  tool_use: "T",
  file_write: "F",
  command_exec: ">",
  status_change: "*",
  token_usage: "$",
  error: "!",
  message: "M",
  subagent: "S",
  notification: "N",
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function AgentTerminalPanel({ agentId }: { agentId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineEvents, setTimelineEvents] = useState<AgentEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);

  const handleResize = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    const terminal = terminalRef.current;
    if (!fitAddon || !terminal) return;

    try {
      fitAddon.fit();
      commands.resizeAgent(agentId, terminal.cols, terminal.rows);
    } catch {
      // Ignore resize errors during initialization
    }
  }, [agentId]);

  // Auto-scroll timeline when new events arrive
  const scrollTimeline = useCallback(() => {
    if (autoScroll && timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [autoScroll]);

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

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available
    }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        commands.resizeAgent(agentId, term.cols, term.rows);
      } catch {
        // Ignore initial resize
      }
    });

    // Input: terminal -> agent PTY
    const onDataDisposable = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      commands.writeAgent(agentId, bytes);
    });

    // Output: agent PTY -> terminal
    const unlistenOutput = events.agentOutputEvent.listen((event) => {
      if (event.payload.agent_id === agentId) {
        const bytes = new Uint8Array(event.payload.data);
        term.write(bytes);
      }
    });

    // Status events -> timeline sidebar
    const unlistenStatus = events.agentStatusEvent.listen((event) => {
      if (event.payload.agent_id === agentId && event.payload.event) {
        setTimelineEvents((prev) => [
          ...prev,
          event.payload.event as AgentEvent,
        ]);
        requestAnimationFrame(scrollTimeline);
      }
    });

    // Exit event
    const unlistenExit = events.agentExitEvent.listen((event) => {
      if (event.payload.agent_id === agentId) {
        term.write("\r\n[Agent exited]\r\n");
      }
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(handleResize);
    });
    resizeObserver.observe(container);

    return () => {
      onDataDisposable.dispose();
      unlistenOutput.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [agentId, handleResize, scrollTimeline]);

  const handleTimelineScroll = () => {
    const el = timelineRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className="agent-terminal-panel">
      <div className="agent-terminal-area" ref={containerRef} />
      <div
        className="agent-timeline-sidebar"
        ref={timelineRef}
        onScroll={handleTimelineScroll}
      >
        <div className="timeline-header">Timeline</div>
        {timelineEvents.length === 0 ? (
          <div className="timeline-empty">Waiting for events...</div>
        ) : (
          timelineEvents.map((evt, i) => (
            <div
              key={`${evt.timestamp}-${i}`}
              className={`timeline-event timeline-event-${evt.event_type}`}
            >
              <span className="timeline-event-icon">
                {EVENT_ICONS[evt.event_type] ?? "?"}
              </span>
              <span className="timeline-event-summary" title={evt.summary}>
                {evt.summary}
              </span>
              <span className="timeline-event-time">
                {formatTime(evt.timestamp)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
