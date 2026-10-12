export default function Card({ children, className = "", labelledBy }) {
  return (
    <section className={`wa-card ${className}`.trim()} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}
