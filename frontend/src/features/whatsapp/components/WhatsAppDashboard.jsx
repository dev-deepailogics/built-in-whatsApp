import { useState } from "react";
import Notice from "../../../shared/ui/Notice.jsx";
import StatusPill from "../../../shared/ui/StatusPill.jsx";
import { WHATSAPP_STATUS } from "../constants.js";
import useWhatsAppConnection from "../hooks/useWhatsAppConnection.js";
import AuthPanel from "./AuthPanel.jsx";
import ConnectionCard from "./ConnectionCard.jsx";
import MessageForm from "./MessageForm.jsx";

export default function WhatsAppDashboard() {
  const { whatsAppState, connectionIssue, refreshStatus } = useWhatsAppConnection();
  const [notice, setNotice] = useState(null);

  const isConnected = whatsAppState.status === WHATSAPP_STATUS.CONNECTED;

  return (
    <main className="wa-page">
      <section className="wa-shell" aria-labelledby="page-title">
        <header className="wa-header">
          <div>
            <p className="wa-eyebrow">Silent background sender</p>
            <h1 id="page-title">WhatsApp Control Panel</h1>
            <p className="wa-lede">Connect your personal WhatsApp session, then send messages directly from this app.</p>
          </div>
          <StatusPill status={whatsAppState.status} />
        </header>

        <Notice notice={notice} onDismiss={() => setNotice(null)} />

        <div className="wa-grid">
          {!isConnected ? (
            <AuthPanel state={whatsAppState} connectionIssue={connectionIssue} onRetry={refreshStatus} />
          ) : (
            <>
              <ConnectionCard state={whatsAppState} />
              <MessageForm onNotice={setNotice} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
