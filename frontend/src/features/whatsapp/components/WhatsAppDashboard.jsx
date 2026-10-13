import { useState } from "react";
import Notice from "../../../shared/ui/Notice.jsx";
import { WHATSAPP_STATUS } from "../constants.js";
import useWhatsAppConnection from "../hooks/useWhatsAppConnection.js";
import AuthPanel from "./AuthPanel.jsx";
import ConnectionBar from "./ConnectionBar.jsx";
import RecentChats from "./RecentChats.jsx";

// crypto.randomUUID only exists in secure contexts (HTTPS/localhost), so fall back for plain-HTTP deploys.
function generateRandomSuffix() {
  const webCrypto = globalThis.crypto;

  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID().slice(0, 8);
  }

  if (typeof webCrypto?.getRandomValues === "function") {
    const bytes = webCrypto.getRandomValues(new Uint8Array(4));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return Math.random().toString(16).slice(2, 10).padEnd(8, "0");
}

function getInitialSessionId() {
  let existingSessionId = null;

  try {
    existingSessionId = window.localStorage.getItem("whatsappSessionId");
  } catch (error) {
    // Storage can be blocked (private mode); fall through and generate an ID for this load.
  }

  if (existingSessionId) {
    return existingSessionId;
  }

  const generatedSessionId = `user-${generateRandomSuffix()}`;

  try {
    window.localStorage.setItem("whatsappSessionId", generatedSessionId);
  } catch (error) {
    // Not persisted; the session ID will change on reload.
  }

  return generatedSessionId;
}

function normalizeSessionId(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function WhatsAppDashboard() {
  const [sessionId, setSessionId] = useState(getInitialSessionId);
  const [sessionDraft, setSessionDraft] = useState(sessionId);
  const { whatsAppState, connectionIssue, reconnect, clearSession } = useWhatsAppConnection(sessionId);
  const [notice, setNotice] = useState(null);

  const isConnected = whatsAppState.status === WHATSAPP_STATUS.CONNECTED;

  function handleSessionSubmit(event) {
    event.preventDefault();
    const nextSessionId = normalizeSessionId(sessionDraft);

    if (nextSessionId.length < 3) {
      setNotice({ type: "error", message: "Session key must be at least 3 characters." });
      return;
    }

    window.localStorage.setItem("whatsappSessionId", nextSessionId);
    setSessionDraft(nextSessionId);
    setSessionId(nextSessionId);
    setNotice(null);
  }

  return (
    <main className="wa-page">
      <section className="wa-shell" aria-labelledby="page-title">
        <ConnectionBar
          state={whatsAppState}
          sessionId={sessionId}
          sessionDraft={sessionDraft}
          onSessionDraftChange={setSessionDraft}
          onSessionSubmit={handleSessionSubmit}
        />

        <Notice notice={notice} onDismiss={() => setNotice(null)} />

        {!isConnected ? (
          <div className="wa-auth-wrap">
            <AuthPanel
              state={whatsAppState}
              sessionId={sessionId}
              connectionIssue={connectionIssue}
              onRetry={reconnect}
              onClearSession={clearSession}
            />
          </div>
        ) : (
          <RecentChats sessionId={sessionId} onNotice={setNotice} />
        )}
      </section>
    </main>
  );
}
