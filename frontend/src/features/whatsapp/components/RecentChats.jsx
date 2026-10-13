import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../shared/ui/Button.jsx";
import AddContactModal from "./AddContactModal.jsx";
import MessageComposer from "./MessageComposer.jsx";
import {
  getChatMessages,
  getChatPhotoUrl,
  getMessageMedia,
  getRecentChats,
  sendWhatsAppMessage
} from "../api/whatsappApi.js";

const INITIAL_MESSAGE_LIMIT = 20;
const MESSAGE_PAGE_SIZE = 20;
const CHAT_PAGE_SIZE = 30;

function formatChatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFullTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp * 1000).toLocaleString();
}

function getMessagePreview(message) {
  if (!message) return "";
  if (message.body) return message.body;
  if (message.type === "call_log") return "[call]";
  if (message.hasMedia) return `[${message.type || "media"}]`;
  return "[empty message]";
}

function getChatInitial(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentPreview({ media, message }) {
  const [isOpen, setIsOpen] = useState(false);
  const [blobUrl, setBlobUrl] = useState("");
  const isPdf = media.mimetype?.startsWith("application/pdf");
  const name = media.filename || message.filename || message.body || "Document";

  // Chrome refuses to render data: URLs inside frames, so PDFs are previewed through a blob URL.
  useEffect(() => {
    if (!isPdf) return undefined;

    let objectUrl = "";
    let isMounted = true;

    fetch(media.dataUrl)
      .then((response) => response.blob())
      .then((blob) => {
        if (!isMounted) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setBlobUrl("");
    };
  }, [isPdf, media.dataUrl]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setIsOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const details = [media.mimetype, formatFileSize(media.filesize)].filter(Boolean).join(" · ");

  return (
    <>
      <button
        className="wa-document"
        type="button"
        onClick={() => (isPdf ? setIsOpen(true) : undefined)}
        disabled={!isPdf}
      >
        <span className="wa-document-head">
          <span className="wa-document-icon" aria-hidden="true">{isPdf ? "PDF" : "DOC"}</span>
          <span className="wa-document-copy">
            <strong title={name}>{name}</strong>
            <span>{details}</span>
          </span>
        </span>
        {isPdf && blobUrl ? (
          <iframe
            className="wa-document-thumb"
            src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            title={`${name} preview`}
            tabIndex={-1}
          />
        ) : null}
      </button>
      {!isPdf ? (
        <a className="wa-document-download" href={media.dataUrl} download={name}>Download</a>
      ) : null}

      {isOpen ? (
        <div className="wa-modal-backdrop" role="presentation" onClick={() => setIsOpen(false)}>
          <div
            className="wa-modal"
            role="dialog"
            aria-modal="true"
            aria-label={name}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="wa-modal-head">
              <strong title={name}>{name}</strong>
              <div className="wa-document-actions">
                <a href={media.dataUrl} download={name}>Download</a>
                <button type="button" onClick={() => setIsOpen(false)}>Close</button>
              </div>
            </header>
            {blobUrl ? (
              <iframe className="wa-modal-frame" src={blobUrl} title={name} />
            ) : (
              <p className="wa-help wa-modal-loading">Loading preview...</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function ChatAvatar({ sessionId, chat }) {
  const [hasPhotoError, setHasPhotoError] = useState(false);

  useEffect(() => {
    setHasPhotoError(false);
  }, [chat.id, sessionId]);

  return (
    <span className="wa-chat-avatar" aria-hidden="true">
      {hasPhotoError ? (
        getChatInitial(chat.name)
      ) : (
        <img
          src={getChatPhotoUrl({ sessionId, chatId: chat.id })}
          alt=""
          loading="lazy"
          onError={() => setHasPhotoError(true)}
        />
      )}
    </span>
  );
}

function ImageMessage({ media, message }) {
  const [isOpen, setIsOpen] = useState(false);
  const name = media.filename || message.filename || message.body || "WhatsApp image";

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") setIsOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button className="wa-image-button" type="button" onClick={() => setIsOpen(true)} aria-label={`Enlarge ${name}`}>
        <img className="wa-media-image" src={media.dataUrl} alt={name} />
      </button>

      {isOpen ? (
        <div className="wa-modal-backdrop wa-lightbox" role="presentation" onClick={() => setIsOpen(false)}>
          <div className="wa-lightbox-bar" onClick={(event) => event.stopPropagation()}>
            <strong title={name}>{name}</strong>
            <div className="wa-document-actions">
              <a href={media.dataUrl} download={name}>Download</a>
              <button type="button" onClick={() => setIsOpen(false)}>Close</button>
            </div>
          </div>
          <img
            className="wa-lightbox-image"
            src={media.dataUrl}
            alt={name}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

function MediaMessage({ sessionId, message }) {
  const [media, setMedia] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadMedia() {
      if (!message.hasMedia || !message.id) return;

      setIsLoading(true);
      setError("");

      try {
        const response = await getMessageMedia({ sessionId, messageId: message.id });

        if (isMounted) {
          setMedia(response);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || "Media unavailable.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadMedia();

    return () => {
      isMounted = false;
    };
  }, [message.hasMedia, message.id, sessionId]);

  if (!message.hasMedia) return null;

  if (isLoading) {
    return <div className="wa-media-placeholder">Loading {message.type || "media"}...</div>;
  }

  if (error || !media?.dataUrl) {
    const label = message.type === "ptt" || message.type === "audio" ? "Voice message" : message.type || "Media";
    return <div className="wa-media-placeholder">{label} unavailable{error && error !== "r" ? ` — ${error}` : ""}</div>;
  }

  if (media.mimetype?.startsWith("image/")) {
    return <ImageMessage media={media} message={message} />;
  }

  if (media.mimetype?.startsWith("video/")) {
    return <video className="wa-media-video" src={media.dataUrl} controls />;
  }

  if (media.mimetype?.startsWith("audio/")) {
    return <audio className="wa-media-audio" src={media.dataUrl} controls />;
  }

  return <DocumentPreview media={media} message={message} />;
}

function formatCallDuration(seconds) {
  const total = Number(seconds);
  if (!total) return "";
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes}m ${total % 60}s` : `${total}s`;
}

function getCallLabel(message) {
  const kind = message.isVideoCall ? "video call" : "voice call";
  const outcome = String(message.callOutcome || "").toLowerCase();

  if (outcome.includes("miss")) return `Missed ${kind}`;
  if (outcome.includes("reject") || outcome.includes("declin")) return `Declined ${kind}`;
  if (message.fromMe) return `Outgoing ${kind}`;
  return `Incoming ${kind}`;
}

function CallLog({ message }) {
  const duration = formatCallDuration(message.callDuration);
  const isMissed = String(message.callOutcome || "").toLowerCase().includes("miss");

  return (
    <div className={`wa-call-log ${isMissed ? "missed" : ""}`}>
      <span aria-hidden="true">{message.isVideoCall ? "🎥" : "📞"}</span>
      <span>{getCallLabel(message)}{duration ? ` · ${duration}` : ""}</span>
    </div>
  );
}

function getSenderLabel(message) {
  const sender = message.sender;
  return sender?.name || sender?.number || "Participant";
}

function getSenderColor(senderId) {
  const palette = ["#1f6f5c", "#7b4fb3", "#b3541e", "#1e6fb3", "#a3317a", "#6b7a1e", "#b3261e", "#2f7d8c"];
  let hash = 0;

  for (const character of String(senderId || "")) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return palette[hash % palette.length];
}

function MessageBubble({ sessionId, message, isGroup = false, showSender = false }) {
  if (message.type === "call_log") {
    return (
      <article className="wa-thread-message call-log">
        <div className="wa-message-bubble wa-call-bubble">
          <CallLog message={message} />
          <time>{formatChatTime(message.timestamp)}</time>
        </div>
      </article>
    );
  }

  const senderId = message.author || message.from;
  const isGroupIncoming = isGroup && !message.fromMe;
  const senderLabel = getSenderLabel(message);

  return (
    <article
      className={`wa-thread-message ${message.fromMe ? "from-me" : "from-them"} ${isGroupIncoming ? "in-group" : ""}`}
    >
      {isGroupIncoming ? (
        <div className="wa-sender-slot">
          {showSender ? (
            <ChatAvatar sessionId={sessionId} chat={{ id: senderId, name: senderLabel }} />
          ) : null}
        </div>
      ) : null}
      <div className="wa-message-bubble">
        {isGroupIncoming && showSender ? (
          <span className="wa-sender-name" style={{ color: getSenderColor(senderId) }} title={message.sender?.number || senderId}>
            {senderLabel}
            {message.sender?.isBusiness ? <em className="wa-business-badge">Business</em> : null}
          </span>
        ) : null}
        <MediaMessage sessionId={sessionId} message={message} />
        {message.body ? <p>{message.body}</p> : !message.hasMedia ? <p className="wa-muted-message">Unsupported message</p> : null}
        <time>{formatChatTime(message.timestamp)}</time>
      </div>
    </article>
  );
}

export default function RecentChats({ sessionId, onNotice }) {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageLimit, setMessageLimit] = useState(INITIAL_MESSAGE_LIMIT);
  const [isChatsLoading, setIsChatsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatLimit, setChatLimit] = useState(CHAT_PAGE_SIZE);
  const [hasMoreChats, setHasMoreChats] = useState(true);
  const [contactModal, setContactModal] = useState(null);
  const threadRef = useRef(null);
  const isLoadingOlderRef = useRef(false);

  const selectedChatTitle = selectedChat?.name || "Select a chat";
  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)),
    [messages]
  );

  async function loadChats({ keepSelection = true, limit = chatLimit } = {}) {
    setIsChatsLoading(true);
    setError("");

    try {
      const response = await getRecentChats({ sessionId, chatLimit: limit, messageLimit: 1 });
      const nextChats = response.chats || [];

      // Keep placeholder chats (just-added contacts with no history yet) at the top until WhatsApp lists them.
      setChats((current) => {
        const pending = current.filter(
          (chat) => chat.isPending && !nextChats.some((nextChat) => nextChat.id === chat.id)
        );
        return [...pending, ...nextChats];
      });
      setHasMoreChats(nextChats.length >= limit);

      if (!keepSelection || !selectedChat) {
        setSelectedChat(nextChats[0] || null);
        setMessageLimit(INITIAL_MESSAGE_LIMIT);
      }
    } catch (loadError) {
      setError(loadError.message || "Could not load chats.");
    } finally {
      setIsChatsLoading(false);
    }
  }

  function loadMoreChats() {
    if (isChatsLoading || !hasMoreChats) return;

    const nextLimit = chatLimit + CHAT_PAGE_SIZE;
    setChatLimit(nextLimit);
    loadChats({ limit: nextLimit });
  }

  function handleChatListScroll(event) {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;

    if (scrollHeight - scrollTop - clientHeight < 120) {
      loadMoreChats();
    }
  }

  async function loadMessages(chat, limit) {
    if (!chat?.id || chat.isPending) return;

    setIsMessagesLoading(true);
    setError("");

    const previousScrollHeight = threadRef.current?.scrollHeight || 0;
    const previousScrollTop = threadRef.current?.scrollTop || 0;

    try {
      const response = await getChatMessages({ sessionId, chatId: chat.id, limit });
      setMessages(response.messages || []);

      requestAnimationFrame(() => {
        if (!threadRef.current) return;

        if (limit > INITIAL_MESSAGE_LIMIT) {
          const nextScrollHeight = threadRef.current.scrollHeight;
          threadRef.current.scrollTop = nextScrollHeight - previousScrollHeight + previousScrollTop;
        } else {
          threadRef.current.scrollTop = threadRef.current.scrollHeight;
        }
      });
    } catch (loadError) {
      setError(loadError.message || "Could not load messages.");
    } finally {
      setIsMessagesLoading(false);
    }
  }

  async function handleSend(text) {
    if (!selectedChat) return false;

    setIsSending(true);

    try {
      await sendWhatsAppMessage({ sessionId, chatId: selectedChat.id, message: text });

      if (selectedChat.isPending) {
        // The chat now exists on WhatsApp; reload the list so it is no longer a placeholder.
        const response = await getRecentChats({ sessionId, chatLimit: 30, messageLimit: 1 });
        const nextChats = response.chats || [];
        const realChat = nextChats.find((chat) => chat.id === selectedChat.id);
        setChats(nextChats);
        if (realChat) setSelectedChat({ ...realChat, name: selectedChat.name });
      }

      await loadMessages(selectedChat.isPending ? { ...selectedChat, isPending: false } : selectedChat, messageLimit);
      return true;
    } catch (sendError) {
      onNotice?.({ type: "error", message: sendError.message || "Could not send the message." });
      return false;
    } finally {
      setIsSending(false);
    }
  }

  function openContactModal(chat) {
    const looksLikeNumber = (value) => /^[+\d\s()-]+$/.test(String(value || ""));

    setContactModal({
      name: chat && !looksLikeNumber(chat.name) ? chat.name : "",
      phone: chat?.phone || ""
    });
  }

  function handleContactSaved(contact) {
    setContactModal(null);
    onNotice?.({
      type: "success",
      message: `${contact.name} saved${contact.syncedToPhone ? " and synced to your phone" : ""}.`
    });

    const existing = chats.find((chat) => chat.id === contact.id);
    const chat = existing
      ? { ...existing, name: contact.name, phone: contact.phone }
      : { id: contact.id, name: contact.name, phone: contact.phone, isGroup: false, isPending: true, lastMessage: null };

    setChats((current) => [chat, ...current.filter((item) => item.id !== chat.id)]);
    selectChat(chat);
  }

  function selectChat(chat) {
    setSelectedChat(chat);
    setMessages([]);
    setMessageLimit(INITIAL_MESSAGE_LIMIT);
  }

  function loadOlderMessages() {
    if (!selectedChat || isLoadingOlderRef.current) return;

    isLoadingOlderRef.current = true;
    const nextLimit = messageLimit + MESSAGE_PAGE_SIZE;
    setMessageLimit(nextLimit);
    loadMessages(selectedChat, nextLimit).finally(() => {
      isLoadingOlderRef.current = false;
    });
  }

  function handleThreadScroll(event) {
    if (event.currentTarget.scrollTop < 80 && selectedChat && !isMessagesLoading) {
      loadOlderMessages();
    }
  }

  useEffect(() => {
    setChats([]);
    setSelectedChat(null);
    setMessages([]);
    setMessageLimit(INITIAL_MESSAGE_LIMIT);
    setChatLimit(CHAT_PAGE_SIZE);
    setHasMoreChats(true);
    loadChats({ keepSelection: false, limit: CHAT_PAGE_SIZE });
  }, [sessionId]);

  useEffect(() => {
    if (selectedChat) {
      loadMessages(selectedChat, INITIAL_MESSAGE_LIMIT);
    }
  }, [selectedChat?.id]);

  return (
    <section className="wa-chat-workspace" aria-labelledby="chat-browser-title">
      <aside className="wa-chat-sidebar">
        <div className="wa-chat-sidebar-head">
          <h2 id="chat-browser-title">Chats</h2>
          <div className="wa-sidebar-actions">
            <button
              type="button"
              className="wa-icon-button"
              onClick={() => loadChats()}
              disabled={isChatsLoading}
              title="Refresh chats"
              aria-label="Refresh chats"
            >
              {isChatsLoading ? "…" : "⟳"}
            </button>
            <button
              type="button"
              className="wa-icon-button primary"
              onClick={() => openContactModal(null)}
              title="New contact"
              aria-label="New contact"
            >
              +
            </button>
          </div>
        </div>

        {error && !selectedChat ? <p className="wa-error wa-sidebar-error">{error}</p> : null}

        <div className="wa-chat-list-panel" onScroll={handleChatListScroll}>
          {chats.map((chat) => (
            <button
              className={`wa-chat-list-item ${selectedChat?.id === chat.id ? "active" : ""}`}
              type="button"
              key={chat.id}
              onClick={() => selectChat(chat)}
            >
              <ChatAvatar sessionId={sessionId} chat={chat} />
              <span className="wa-chat-list-copy">
                <strong>{chat.name}{chat.isBusiness ? <em className="wa-business-badge">Business</em> : null}</strong>
                <span>{getMessagePreview(chat.lastMessage)}</span>
              </span>
              <span className="wa-chat-list-meta">
                <time>{formatChatTime(chat.timestamp)}</time>
                {chat.unreadCount ? <em>{chat.unreadCount}</em> : null}
              </span>
            </button>
          ))}

          {isChatsLoading && chats.length > 0 ? <p className="wa-help wa-chat-list-more">Loading more chats...</p> : null}

          {!isChatsLoading && chats.length === 0 ? <p className="wa-help wa-empty-chats">No recent chats found.</p> : null}
        </div>
      </aside>

      <section className="wa-thread-panel" aria-label={selectedChatTitle}>
        <header className="wa-thread-head">
          {selectedChat ? (
            <>
              <ChatAvatar sessionId={sessionId} chat={selectedChat} />
              <div className="wa-thread-title">
                <h2>{selectedChat.name}{selectedChat.isBusiness ? <em className="wa-business-badge">Business</em> : null}</h2>
                <p>
                  {selectedChat.isGroup
                    ? "Group"
                    : [selectedChat.businessName && selectedChat.businessName !== selectedChat.name ? selectedChat.businessName : null,
                        selectedChat.phone || (selectedChat.phoneTitle !== selectedChat.name ? selectedChat.phoneTitle : null)]
                        .filter(Boolean)
                        .join(" · ") || (selectedChat.isBusiness ? "Business account" : "Chat")}
                </p>
              </div>
              {!selectedChat.isGroup ? (
                <button type="button" className="wa-pill-button" onClick={() => openContactModal(selectedChat)}>
                  Add contact
                </button>
              ) : null}
            </>
          ) : (
            <div>
              <h2>Select a chat</h2>
              <p>Choose a sender or group to view messages.</p>
            </div>
          )}
        </header>

        {error && selectedChat ? <p className="wa-error wa-thread-error">{error}</p> : null}

        <div className="wa-thread-scroll" ref={threadRef} onScroll={handleThreadScroll}>
          {selectedChat ? (
            <>
              <button className="wa-load-older" type="button" onClick={loadOlderMessages} disabled={isMessagesLoading}>
                {isMessagesLoading ? "Loading..." : "Load 20 older messages"}
              </button>

              <div className="wa-thread-date">{formatFullTime(orderedMessages[0]?.timestamp) || "Recent messages"}</div>

              {orderedMessages.map((message, index) => {
                const previous = orderedMessages[index - 1];
                const showSender =
                  !previous ||
                  previous.fromMe !== message.fromMe ||
                  previous.type === "call_log" ||
                  (previous.author || previous.from) !== (message.author || message.from);

                return (
                  <MessageBubble
                    key={message.id}
                    sessionId={sessionId}
                    message={message}
                    isGroup={Boolean(selectedChat.isGroup)}
                    showSender={showSender}
                  />
                );
              })}
            </>
          ) : (
            <div className="wa-thread-empty">No chat selected</div>
          )}
        </div>

        <MessageComposer disabled={!selectedChat} isSending={isSending} onSend={handleSend} />
      </section>

      {contactModal ? (
        <AddContactModal
          sessionId={sessionId}
          initialName={contactModal.name}
          initialPhone={contactModal.phone}
          onClose={() => setContactModal(null)}
          onSaved={handleContactSaved}
        />
      ) : null}
    </section>
  );
}
