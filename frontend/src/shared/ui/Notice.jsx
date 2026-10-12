export default function Notice({ notice, onDismiss }) {
  if (!notice) return null;

  return (
    <div className={`wa-notice ${notice.type}`} role="status" aria-live="polite">
      <span>{notice.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification">
        x
      </button>
    </div>
  );
}
