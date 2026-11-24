/** Time zones for the "active hours" setting. The extension works in the person's own zone. */

const COMMON = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix', 'America/Toronto',
  'America/Mexico_City', 'America/Bogota', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Europe/London', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin',
  'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney', 'Pacific/Auckland',
];

function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The zone this browser is in, or null when the browser does not say (or says something unusable). */
export function browserTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(tz) ? tz : null;
  } catch {
    return null;
  }
}

/**
 * Options for the select: every zone the browser knows, or a short list on older browsers.
 * The current value and the browser's own zone are always present, so the select can show them.
 */
export function timezoneOptions(current?: string | null): string[] {
  let all: string[] = COMMON;
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone');
    if (supported && supported.length > 0) all = supported;
  } catch {
    // keep the short list
  }
  const set = new Set(all);
  const here = browserTimezone();
  if (here) set.add(here);
  if (isValidTimezone(current)) set.add(current);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function timezoneLabel(tz: string): string {
  return tz.replace(/_/g, ' ');
}
