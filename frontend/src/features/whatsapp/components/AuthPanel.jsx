import Button from "../../../shared/ui/Button.jsx";
import Card from "../../../shared/ui/Card.jsx";
import Spinner from "../../../shared/ui/Spinner.jsx";
import StatusPill from "../../../shared/ui/StatusPill.jsx";
import { WHATSAPP_STATUS } from "../constants.js";

export default function AuthPanel({ state, connectionIssue, onRetry }) {
  const showQr = state.status === WHATSAPP_STATUS.QR && state.qr;

  return (
    <Card className="wa-auth-panel" labelledBy="auth-title">
      <div className="wa-card-heading">
        <div>
          <p className="wa-eyebrow">WhatsApp session</p>
          <h2 id="auth-title">Authenticate account</h2>
        </div>
        <StatusPill status={state.status} />
      </div>

      <div className="wa-qr-stage">
        {showQr ? (
          <img src={state.qr} alt="WhatsApp authentication QR code" className="wa-qr-code" />
        ) : (
          <div className="wa-loading-block">
            <Spinner label="Waiting for WhatsApp QR code" />
            <span>{state.status === WHATSAPP_STATUS.AUTHENTICATED ? "Preparing session..." : "Waiting for QR code..."}</span>
          </div>
        )}
      </div>

      <p className="wa-state-message">{connectionIssue || state.message}</p>
      <Button type="button" variant="secondary" onClick={onRetry}>
        Recheck connection
      </Button>
    </Card>
  );
}
