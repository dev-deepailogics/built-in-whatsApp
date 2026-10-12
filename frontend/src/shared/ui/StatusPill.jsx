const DANGER_STATES = new Set(["error", "auth_failure"]);

function getStatusTone(status) {
  if (status === "connected") return "success";
  if (DANGER_STATES.has(status)) return "danger";
  return "warning";
}

function getStatusLabel(status) {
  if (status === "qr") return "Scan QR";
  return status.replace(/_/g, " ");
}

export default function StatusPill({ status = "starting" }) {
  return <span className={`wa-status-pill ${getStatusTone(status)}`}>{getStatusLabel(status)}</span>;
}
