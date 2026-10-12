export default function Spinner({ label = "Loading" }) {
  return (
    <span className="wa-spinner-wrap" role="status" aria-label={label}>
      <span className="wa-spinner" />
    </span>
  );
}
