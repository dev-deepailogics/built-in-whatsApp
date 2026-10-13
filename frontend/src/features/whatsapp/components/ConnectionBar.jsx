import StatusPill from "../../../shared/ui/StatusPill.jsx";

export default function ConnectionBar({ state, sessionId, sessionDraft, onSessionDraftChange, onSessionSubmit }) {
  const lastUpdated = state.lastUpdated
    ? new Date(state.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Now";

  return (
    <header className="wa-topbar">
      <div className="wa-topbar-brand">
        <span className="wa-topbar-logo" aria-hidden="true">W</span>
        <div>
          <h1 id="page-title">WhatsApp Control Panel</h1>
          <p>Session {sessionId}</p>
        </div>
      </div>

      <div className="wa-topbar-status" role="status" aria-live="polite">
        <StatusPill status={state.status} />
        <span className="wa-topbar-message">{state.message}</span>
        <span className="wa-topbar-time">Updated {lastUpdated}</span>
      </div>

      <form className="wa-topbar-session" onSubmit={onSessionSubmit} noValidate>
        <label htmlFor="session-id" className="wa-visually-hidden">User/session key</label>
        <input
          id="session-id"
          value={sessionDraft}
          onChange={(event) => onSessionDraftChange(event.target.value)}
          placeholder="user-company-name"
        />
        <button type="submit">Use session</button>
      </form>
    </header>
  );
}
