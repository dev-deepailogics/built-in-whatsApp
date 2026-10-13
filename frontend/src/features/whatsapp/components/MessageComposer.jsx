import { useEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "../constants.js";
import { MESSAGE_TEMPLATES } from "../messageTemplates.js";

export default function MessageComposer({ disabled, isSending, onSend }) {
  const [text, setText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  const canSend = Boolean(text.trim()) && !isSending && !disabled && text.length <= MAX_MESSAGE_LENGTH;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setIsMenuOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setIsMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  function applyTemplate(template) {
    setText(template.body);
    setIsMenuOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submit() {
    if (!canSend) return;

    const wasSent = await onSend(text.trim());

    if (wasSent) {
      setText("");
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      className="wa-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="wa-composer-menu" ref={menuRef}>
        <button
          type="button"
          className={`wa-composer-plus ${isMenuOpen ? "open" : ""}`}
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label="Message templates"
          title="Message templates"
          disabled={disabled}
        >
          +
        </button>

        {isMenuOpen ? (
          <div className="wa-template-popover" role="menu">
            <p className="wa-template-popover-title">Message templates</p>
            {MESSAGE_TEMPLATES.map((template) => (
              <button type="button" role="menuitem" key={template.id} onClick={() => applyTemplate(template)}>
                <strong>{template.name}</strong>
                <span>{template.description}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <textarea
        ref={inputRef}
        className="wa-composer-input"
        rows="1"
        value={text}
        placeholder={disabled ? "Select a chat to start messaging" : "Type a message"}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || isSending}
        aria-label="Type a message"
      />

      <button type="submit" className="wa-composer-send" disabled={!canSend} aria-label="Send message" title="Send">
        {isSending ? "…" : "➤"}
      </button>
    </form>
  );
}
