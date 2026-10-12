export default function Button({ children, className = "", variant = "primary", isLoading = false, disabled = false, ...props }) {
  const variantClass = variant === "secondary" ? "wa-secondary-button" : "wa-primary-button";

  return (
    <button className={`${variantClass} ${className}`.trim()} disabled={disabled || isLoading} {...props}>
      <span className={isLoading ? "wa-hidden-label" : ""}>{children}</span>
      {isLoading ? (
        <span className="wa-spinner-wrap" role="status" aria-label="Loading">
          <span className="wa-spinner" />
        </span>
      ) : null}
    </button>
  );
}
