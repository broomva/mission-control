import { useCallback, useRef, useState } from "react";
import { useAgentStore } from "../stores/agentStore";

interface MessageInputProps {
  agentId: string;
}

export function MessageInput({ agentId }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { writeAgent } = useAgentStore();

  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text) return;

    // Send as bytes to the agent PTY
    const bytes = Array.from(new TextEncoder().encode(text + "\n"));
    await writeAgent(agentId, bytes);
    setMessage("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [message, agentId, writeAgent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-grow textarea
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const isCommand = message.startsWith("/");

  return (
    <div className="message-input-bar">
      <div className="message-input-field-container">
        <textarea
          ref={textareaRef}
          className={`message-input-field${isCommand ? " message-input-command" : ""}`}
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Send a message..."
          rows={1}
        />
        {!isFocused && !message && (
          <span className="message-input-hint">&#8984;L to focus</span>
        )}
      </div>
      <div className="message-input-actions">
        <button type="button" className="message-input-btn" title="Attach file">
          +
        </button>
        <button
          type="button"
          className="message-input-btn message-input-send"
          onClick={handleSend}
          disabled={!message.trim()}
          title="Send message"
        >
          &uarr;
        </button>
      </div>
    </div>
  );
}
