import BrandMark from '@/components/BrandMark';
import { cn } from '@/lib/utils';

/** Brand lockup: radar mark + wordmark. `tone="dark"` for navy backgrounds, `"light"` for paper/white. */
export default function Logo({
  tone = 'light', short = false, className = '', markClassName = 'w-8 h-8',
}: { tone?: 'light' | 'dark'; short?: boolean; className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} aria-label="LinkedIn Copilot">
      <BrandMark className={markClassName} />
      <span
        aria-hidden="true"
        className={cn(
          'font-display font-bold uppercase tracking-[0.06em] whitespace-nowrap leading-none',
          tone === 'dark' ? 'text-white' : 'text-foreground',
        )}
        style={{ fontSize: '1.2em' }}
      >
        {short ? 'Copilot' : 'LinkedIn Copilot'}
      </span>
    </span>
  );
}
