import BrandMark from '@/components/BrandMark';
import { cn } from '@/lib/utils';

/**
 * The stroke over the "a": part of the drawing, not of the name. The name is written "Olanovo"
 * everywhere (texts, page titles, the address, the label read by screen readers); only the logo
 * carries the stroke. Its round ends and its pink repeat the arcs of the mark. Sizes are in em, so
 * it scales with the wordmark, and they are tuned to the display typeface at bold weight.
 */
const ACCENT: React.CSSProperties = {
  position: 'absolute', left: '38%', top: '0.015em', width: '0.27em', height: '0.12em',
  borderRadius: '1em', background: '#FF4FB0', transform: 'rotate(-48deg)', pointerEvents: 'none',
};

/**
 * The letters of the logo, with the stroke. For a place that sets its own type size and colour;
 * the parent must carry the accessible name ("Olanovo") and hide this from screen readers, as
 * Logo does, because the letters are split around the stroke.
 */
export function Wordmark() {
  return (
    <>
      Ol
      {/* Its own line height, so the stroke sits the same whatever line height the parent uses. */}
      <span className="relative inline-block" style={{ lineHeight: 1 }}>
        a
        <span style={ACCENT} />
      </span>
      novo
    </>
  );
}

/** Brand lockup: Meeting mark + wordmark. `tone="dark"` for navy backgrounds, `"light"` for paper/white. */
export default function Logo({
  tone = 'light', short = false, className = '', markClassName = 'w-8 h-8',
}: { tone?: 'light' | 'dark'; short?: boolean; className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} role="img" aria-label="Olanovo">
      <BrandMark className={markClassName} />
      <span
        aria-hidden="true"
        className={cn(
          'font-display font-bold tracking-tight whitespace-nowrap leading-none',
          tone === 'dark' ? 'text-white' : 'text-foreground',
        )}
        style={{ fontSize: '1.2em' }}
      >
        <Wordmark />
      </span>
    </span>
  );
}
