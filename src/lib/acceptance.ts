// How an acceptance rate is shown.
//
// The rate is "accepted out of settled": settled invites are the ones that got an answer (accepted
// or withdrawn) or were sent at least SETTLE_DAYS ago. An invite sent yesterday is not counted
// against the rate. With few settled invites the percentage moves a lot from one answer to the
// next, so it is shown with a warning until there are enough.

export const SETTLE_DAYS = 14;
/** Below this many settled invites, one answer more or less moves the rate by ten points or more. */
export const FEW_INVITES = 10;

export type Acceptance = {
  /** "27%", or null when no invite is settled yet. */
  rate: string | null;
  /** "8 of 30", the numbers behind the rate; empty when there is no rate. */
  basis: string;
  /** True when the rate exists but rests on few invites. */
  few: boolean;
  /** Invites too recent to count. */
  waiting: number;
};

const whole = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
};

export function acceptance(input: { accepted?: unknown; settled?: unknown; waiting?: unknown }): Acceptance {
  const settled = whole(input.settled);
  // Never more accepted than settled: the server counts accepted inside settled, and a number that
  // says otherwise is not shown as a rate above 100%.
  const accepted = Math.min(whole(input.accepted), settled);
  const waiting = whole(input.waiting);
  if (settled === 0) return { rate: null, basis: '', few: false, waiting };
  return {
    rate: `${Math.round((accepted / settled) * 100)}%`,
    basis: `${accepted} of ${settled}`,
    few: settled < FEW_INVITES,
    waiting,
  };
}
