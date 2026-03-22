export type CsvRow = Record<string, string>;

const LINKEDIN_HEADER_ALIASES = new Set([
  'linkedin_url',
  'linkedin',
  'linkedinurl',
  'linkedin_profile',
  'linkedin_profile_url',
  'profile_url',
  'li_url',
  'url',
  'person_linkedin_url',
]);

const HEADER_ALIAS_MAP: Record<string, string> = {
  name: 'full_name',
  full_name: 'full_name',
  fullname: 'full_name',
  first_name: 'first_name',
  firstname: 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  job_title: 'title',
  current_title: 'title',
  company_name: 'company',
  company_name_for_emails: 'company',
  companyname: 'company',
};

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function normalizeHeader(header: string): string {
  const cleaned = header.trim().toLowerCase().replace(/["\s-]+/g, '_').replace(/^_|_$/g, '');
  const stripped = cleaned.replace(/_?\d+$/, '');
  if (LINKEDIN_HEADER_ALIASES.has(cleaned) || LINKEDIN_HEADER_ALIASES.has(stripped)) {
    return 'linkedin_url';
  }
  if (HEADER_ALIAS_MAP[cleaned]) return HEADER_ALIAS_MAP[cleaned];
  if (HEADER_ALIAS_MAP[stripped]) return HEADER_ALIAS_MAP[stripped];
  return cleaned;
}

export function normalizeLinkedInUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  let url = rawUrl.trim();
  if (!url) return null;
  url = url.replace(/^<|>$/g, '');

  // If the raw string contains a public /in/ profile, extract it first
  const inMatch = url.match(/https?:\/\/[^\s]*linkedin\.com\/in\/[^\s?#]+/i)
    || url.match(/linkedin\.com\/in\/[^\s?#]+/i);
  if (inMatch && inMatch[0]) {
    url = inMatch[0];
  }

  if (url.startsWith('www.')) url = `https://${url}`;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes('linkedin.com')) return null;
    parsed.protocol = 'https:';
    if (!parsed.hostname.toLowerCase().startsWith('www.')) {
      parsed.hostname = `www.${parsed.hostname}`;
    }
    parsed.hash = '';
    parsed.search = '';
    const normalized = parsed.toString().replace(/\/+$/, '');
    return normalized;
  } catch {
    return null;
  }
}

function pickLinkedInColumn(rawHeaders: string[]): number | null {
  let bestIdx: number | null = null;
  let bestScore = -1;
  rawHeaders.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (!key) return;
    const hasLinkedin = key.includes('linkedin') || key.includes('linked in');
    if (!hasLinkedin) return;
    let score = 0;
    if (hasLinkedin) score += 1;
    if (key.includes('person') || key.includes('contact')) score += 3;
    if (key.includes('profile')) score += 2;
    if (key.includes('url')) score += 1;
    if (key.includes('company')) score -= 2;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });
  return bestIdx;
}

export function parseLeadCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return { rows: [], invalidRows: 0, duplicateRows: 0, totalRows: 0, headers: [] as string[] };
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);
  const linkedinIdx = pickLinkedInColumn(rawHeaders);
  const rows: CsvRow[] = [];
  const seenUrls = new Set<string>();
  let invalidRows = 0;
  let duplicateRows = 0;

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] || '').trim();
    });

    if (linkedinIdx !== null && linkedinIdx >= 0 && linkedinIdx < values.length) {
      row.linkedin_url = (values[linkedinIdx] || '').trim();
    }

    if (!row.linkedin_url) {
      invalidRows++;
      continue;
    }

    const normalizedUrl = normalizeLinkedInUrl(row.linkedin_url);
    if (!normalizedUrl) {
      invalidRows++;
      continue;
    }

    if (seenUrls.has(normalizedUrl)) {
      duplicateRows++;
      continue;
    }

    row.linkedin_url = normalizedUrl;
    rows.push(row);
    seenUrls.add(normalizedUrl);
  }

  return { rows, invalidRows, duplicateRows, totalRows: lines.length - 1, headers };
}
