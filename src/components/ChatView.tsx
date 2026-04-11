import { useEffect, useRef, useState } from "react";
import type { AgentEvent, AgentInfo } from "../bindings";
import { MessageInput } from "./MessageInput";

interface ChatViewProps {
  agent: AgentInfo;
  timeline: AgentEvent[];
}

/** Simple markdown to JSX renderer */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLanguage = "";
  let listItems: string[] = [];
  let listOrdered = false;
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems.map((item) => (
      <li key={`li-${key++}`}>{renderInline(item)}</li>
    ));
    elements.push(
      listOrdered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>,
    );
    listItems = [];
  };

  for (const line of lines) {
    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={key++}>
            <code data-language={codeLanguage}>{codeLines.join("\n")}</code>
          </pre>,
        );
        codeLines = [];
        codeLanguage = "";
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch && headerMatch[1] && headerMatch[2]) {
      flushList();
      const level = headerMatch[1].length;
      const content = renderInline(headerMatch[2]);
      if (level === 1) elements.push(<h1 key={key++}>{content}</h1>);
      else if (level === 2) elements.push(<h2 key={key++}>{content}</h2>);
      else if (level === 3) elements.push(<h3 key={key++}>{content}</h3>);
      else if (level === 4) elements.push(<h4 key={key++}>{content}</h4>);
      else if (level === 5) elements.push(<h5 key={key++}>{content}</h5>);
      else elements.push(<h6 key={key++}>{content}</h6>);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      flushList();
      elements.push(
        <blockquote key={key++}>{renderInline(line.slice(2))}</blockquote>,
      );
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    if (ulMatch && ulMatch[1]) {
      if (listOrdered && listItems.length > 0) flushList();
      listOrdered = false;
      listItems.push(ulMatch[1]);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    if (olMatch && olMatch[1]) {
      if (!listOrdered && listItems.length > 0) flushList();
      listOrdered = true;
      listItems.push(olMatch[1]);
      continue;
    }

    // Flush lists if we hit a non-list line
    flushList();

    // Empty line
    if (line.trim() === "") {
      continue;
    }

    // Regular paragraph
    elements.push(<p key={key++}>{renderInline(line)}</p>);
  }

  // Flush remaining
  if (inCodeBlock && codeLines.length > 0) {
    elements.push(
      <pre key={key++}>
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
  }
  flushList();

  return elements;
}

/** Render inline markdown: bold, italic, code, links */
function renderInline(text: string): React.ReactNode {
  // Process inline patterns with regex
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(<code key={key++}>{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a key={key++} href={linkMatch[2]} target="_blank" rel="noreferrer">
          {linkMatch[1]}
        </a>,
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Plain text — consume one character at a time until next special char
    const nextSpecial = remaining.slice(1).search(/[`*[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    }
    parts.push(remaining.slice(0, nextSpecial + 1));
    remaining = remaining.slice(nextSpecial + 1);
  }

  return parts.length === 1 ? parts[0] : parts;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

interface ToolCallState {
  [key: string]: boolean;
}

export function ChatView({ agent, timeline }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [toolCallOpen, setToolCallOpen] = useState<ToolCallState>({});

  // Auto-scroll on new events
  const prevLenRef = useRef(0);
  useEffect(() => {
    const len = timeline.length;
    if (len !== prevLenRef.current) {
      prevLenRef.current = len;
      if (autoScroll && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  });

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(isAtBottom);
  };

  const toggleToolCall = (eventKey: string) => {
    setToolCallOpen((prev) => ({
      ...prev,
      [eventKey]: !prev[eventKey],
    }));
  };

  // Filter timeline events for this agent
  const agentEvents = timeline.filter((e) => e.agent_id === agent.id);

  return (
    <>
      <div className="chat-view" ref={scrollRef} onScroll={handleScroll}>
        {agentEvents.length === 0 ? (
          <div className="empty-state">
            <p>Waiting for agent output...</p>
          </div>
        ) : (
          agentEvents.map((evt, i) => {
            const eventKey = `${evt.timestamp}-${i}`;

            // Tool call events
            if (
              evt.event_type === "tool_use" ||
              evt.event_type === "file_write" ||
              evt.event_type === "command_exec"
            ) {
              const isOpen = toolCallOpen[eventKey] ?? false;
              return (
                <div key={eventKey} className="chat-tool-call">
                  <button
                    type="button"
                    className="chat-tool-call-header"
                    onClick={() => toggleToolCall(eventKey)}
                  >
                    <span className="chat-tool-call-icon">T</span>
                    <span className="chat-tool-call-name">
                      {evt.event_type}
                    </span>
                    <span className="chat-tool-call-toggle">
                      {isOpen ? "\u25BE" : "\u25B8"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="chat-tool-call-body">
                      {evt.summary}
                      {evt.detail && (
                        <>
                          {"\n"}
                          {evt.detail}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            }

            // Message events — render as chat messages
            if (evt.event_type === "message") {
              return (
                <div key={eventKey} className="chat-message chat-message-agent">
                  <div className="chat-message-header">
                    <span className="chat-message-sender">
                      {agent.agent_type}
                    </span>
                    <span className="chat-message-time">
                      {formatTime(evt.timestamp)}
                    </span>
                  </div>
                  <div className="chat-message-content">
                    {renderMarkdown(evt.summary)}
                  </div>
                </div>
              );
            }

            // Status change / other events
            return (
              <div key={eventKey} className="chat-message chat-message-agent">
                <div className="chat-message-header">
                  <span className="chat-message-sender">{evt.event_type}</span>
                  <span className="chat-message-time">
                    {formatTime(evt.timestamp)}
                  </span>
                </div>
                <div className="chat-message-content">
                  <p>{evt.summary}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <MessageInput agentId={agent.id} />
    </>
  );
}
