export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 34 34" fill="none" stroke="hsl(var(--gold))" strokeWidth="1.7" className={className} aria-hidden="true">
      <circle cx="17" cy="17" r="15" />
      <circle cx="17" cy="17" r="9" strokeOpacity="0.5" />
      <path d="M17 2v6M17 26v6M2 17h6M26 17h6" />
      <path d="M10 19l7-9 7 9-7-3z" fill="hsl(var(--gold))" stroke="none" />
    </svg>
  );
}
