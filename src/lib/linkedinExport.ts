// Parser for LinkedIn's official data export of connections ("Connections.csv").
// Settings & Privacy > Data privacy > Get a copy of your data > Connections.
// The file starts with a few "Notes" lines before the real header:
//   First Name,Last Name,URL,Email Address,Company,Position,Connected On
// Accepts the CSV itself or the whole export .zip (we pick Connections.csv inside it).
import JSZip from 'jszip';

export type ExportedConnection = {
  linkedin_url: string;
  full_name: string | null;
  company: string | null;
  position: string | null;
  connected_on: string | null; // YYYY-MM-DD
};

/** Same canonical form as the backend (normalizeProfileUrl): https://www.linkedin.com/in/<slug lowercased>. */
export function canonicalProfileUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return null;
  let slug = m[1];
  try { slug = decodeURIComponent(slug); } catch { /* keep raw */ }
  slug = slug.trim().toLowerCase();
  return slug ? `https://www.linkedin.com/in/${slug}` : null;
}

/** RFC 4180-ish CSV parser that handles quoted fields with commas, quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', fev: '02', mar: '03', apr: '04', abr: '04', may: '05', mai: '05', jun: '06',
  jul: '07', aug: '08', ago: '08', sep: '09', set: '09', oct: '10', out: '10', nov: '11', dec: '12', dez: '12',
};

function parseConnectedOn(v: string): string | null {
  const t = v.trim();
  let m = t.match(/^(\d{1,2})\s+([A-Za-zç]{3})[a-z]*\.?\s+(\d{4})$/); // 01 Oct 2024
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    return mon ? `${m[3]}-${mon}-${m[1].padStart(2, '0')}` : null;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // 10/1/2024 (US)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z]/g, '');

export function parseConnectionsCsv(text: string): { connections: ExportedConnection[]; skipped: number } {
  const rows = parseCsv(text);
  const headerIdx = rows.findIndex(r => {
    const cells = r.map(norm);
    return cells.includes('url') && (cells.includes('firstname') || cells.includes('nome'));
  });
  if (headerIdx === -1) throw new Error('This does not look like LinkedIn\'s Connections.csv (no "First Name, Last Name, URL" header).');
  const header = rows[headerIdx].map(norm);
  const col = (...names: string[]) => header.findIndex(h => names.includes(h));
  const iFirst = col('firstname', 'nome');
  const iLast = col('lastname', 'sobrenome');
  const iUrl = col('url');
  const iCompany = col('company', 'empresa');
  const iPosition = col('position', 'cargo');
  const iConnected = col('connectedon', 'conectadoem');

  const seen = new Set<string>();
  const connections: ExportedConnection[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    if (r.length === 1 && r[0].trim() === '') continue;
    const url = canonicalProfileUrl(r[iUrl]);
    if (!url || seen.has(url)) { skipped++; continue; }
    seen.add(url);
    const name = [r[iFirst], iLast >= 0 ? r[iLast] : ''].map(x => (x || '').trim()).filter(Boolean).join(' ');
    const val = (i: number) => (i >= 0 && r[i] ? r[i].trim() : '') || null;
    connections.push({
      linkedin_url: url,
      full_name: name || null,
      company: val(iCompany)?.slice(0, 200) ?? null,
      position: val(iPosition)?.slice(0, 300) ?? null,
      connected_on: iConnected >= 0 && r[iConnected] ? parseConnectedOn(r[iConnected]) : null,
    });
  }
  return { connections, skipped };
}

/** Reads a File that is either Connections.csv or the full LinkedIn export .zip. */
export async function readConnectionsFile(file: File): Promise<{ connections: ExportedConnection[]; skipped: number }> {
  if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = Object.values(zip.files).find(f => !f.dir && /(^|\/)connections\.csv$/i.test(f.name));
    if (!entry) throw new Error('Connections.csv was not found inside this .zip.');
    return parseConnectionsCsv(await entry.async('string'));
  }
  return parseConnectionsCsv(await file.text());
}
