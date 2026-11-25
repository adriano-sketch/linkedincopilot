// How an acceptance rate is shown.
//
// The rate is counted on "matured" invites only: the ones sent at least MATURE_DAYS ago. Younger
// invites are left out, the accepted ones too (they are shown apart, as "already accepted"): counting
// a young invite the moment it is accepted, while the unanswered ones of the same day wait, would
// push the rate up. With few matured invites the percentage moves a lot from one answer to the next,
// so it is shown with a warning until there are enough.

export const MATURE_DAYS = 14;
/** Below this many matured invites, one answer more or less moves the rate by ten points or more. */
export const FEW_INVITES = 10;

export type Acceptance = {
  /** "27%", or null when no invite has matured (or the numbers are not available). */
  rate: string | null;
  /** "8 of 30", the numbers behind the rate; empty when there is no rate. */
  basis: string;
  /** True when the rate exists but rests on few invites. */
  few: boolean;
  /** Invites too recent to count, and how many of those were already accepted. */
  waiting: number;
  acceptedEarly: number;
  /** False when the server did not send the numbers the rate needs (an older version of it). */
  known: boolean;
};

const whole = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
};

export function acceptance(input: { matured?: unknown; accepted_matured?: unknown; waiting?: unknown; accepted_early?: unknown }): Acceptance {
  const known = input.matured !== undefined && input.matured !== null;
  const matured = whole(input.matured);
  const waiting = whole(input.waiting);
  const acceptedEarly = Math.min(whole(input.accepted_early), waiting);
  if (whole(input.accepted_matured) > matured) console.warn('acceptance: more accepted than matured invites', input);
  // Never more accepted than matured: a number that says otherwise is not shown as a rate above 100%.
  const accepted = Math.min(whole(input.accepted_matured), matured);
  if (matured === 0) return { rate: null, basis: '', few: false, waiting, acceptedEarly, known };
  return {
    rate: `${Math.round((accepted / matured) * 100)}%`,
    basis: `${accepted} of ${matured}`,
    few: matured < FEW_INVITES,
    waiting,
    acceptedEarly,
    known,
  };
}

/** "9", or "9 (2 already accepted)". */
export function waitingText(a: Acceptance): string {
  if (!a.known) return '—';
  return a.acceptedEarly > 0 ? `${a.waiting} (${a.acceptedEarly} already accepted)` : String(a.waiting);
}
