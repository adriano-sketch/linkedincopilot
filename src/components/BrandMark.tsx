/** Orbit mark: the letter C as an open ring with one point in orbit, on an ink tile. Same drawing as public/favicon.svg. */
export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#15111F" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="#A78BFF" strokeWidth="9" strokeLinecap="round"
        strokeDasharray="66.53 34" transform="rotate(60.88 32 32)" />
      <circle cx="48" cy="32" r="5.5" fill="#FF4FB0" />
    </svg>
  );
}
