/** Meeting mark: the letter O as two halves that face each other without merging, on an ink tile. Same drawing as public/favicon.svg. */
export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#15111F" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="#A78BFF" strokeWidth="9" strokeLinecap="round"
        strokeDasharray="38 62.53" transform="rotate(112 32 32)" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="#FF4FB0" strokeWidth="9" strokeLinecap="round"
        strokeDasharray="38 62.53" transform="rotate(-68 32 32)" />
    </svg>
  );
}
