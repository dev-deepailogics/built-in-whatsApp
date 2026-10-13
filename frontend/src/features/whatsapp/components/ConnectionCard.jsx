import Card from "../../../shared/ui/Card.jsx";
import StatusPill from "../../../shared/ui/StatusPill.jsx";

export default function ConnectionCard({ state, sessionId }) {
  return (
    <Card className="wa-connection-card" labelledBy="connection-title">
      <div className="wa-card-heading">
        <div>
          <p className="wa-eyebrow">Connection</p>
          <h2 id="connection-title">Connected</h2>
        </div>
        <StatusPill status="connected" />
      </div>
      <p className="wa-state-message">{state.message}</p>
      <p className="wa-session-label">Session: {sessionId}</p>
      <p className="wa-timestamp">
        Last update: {state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : "Now"}
      </p>
    </Card>
  );
}
