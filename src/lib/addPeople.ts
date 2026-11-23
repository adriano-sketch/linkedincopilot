import { supabase } from '@/integrations/supabase/client';
import type { PickedContact } from '@/components/contacts/ContactPicker';

/**
 * The one form a profile address is stored in: https://www.linkedin.com/in/<slug>, lowercase, with no
 * query string, fragment, trailing slash or sub-page. Returns null when the text is not a LinkedIn
 * profile address (wrong host, or no identifier after /in/). A scheme is optional.
 */
export function profileUrlFrom(input: string): string | null {
  // Only ASCII whitespace is trimmed: String.trim() would also remove an ideographic space that belongs
  // to a real identifier, and the result would then change when read a second time.
  // eslint-disable-next-line no-control-regex
  const raw = (input || '').replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '').replace(/^<|>$/g, '');
  if (!raw) return null;
  let parsed: URL;
  try { parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null;
  const m = parsed.pathname.match(/^\/in\/([^/]+)/i);
  if (!m) return null;
  let slug = m[1];
  try { slug = decodeURIComponent(slug); } catch { /* keep as typed */ }
  // Checked on the decoded text, before anything else touches it. A separator, an escape character or
  // an ASCII space or control character would change the identifier when the result is read again.
  // Other characters stay: real identifiers carry accents, emoji and signs such as ® or ’.
  // eslint-disable-next-line no-control-regex
  if (!slug || /[/\\?#%\x00-\x20\x7f]/.test(slug)) return null;
  slug = slug.toLowerCase();
  return `https://www.linkedin.com/in/${slug}`;
}

/**
 * Adds people to a list: contacts picked from the user's own connections plus pasted profile URLs.
 * They enter as "ready", which is what the reading cycle picks up. Someone already in any of the
 * user's lists is skipped (one person, one list).
 */
export async function addPeopleToList(
  userId: string, listId: string, picked: PickedContact[], urls: string[],
): Promise<{ inserted: number; skipped: number; rejected: number }> {
  const byUrl = new Map<string, Record<string, unknown>>();
  // Addresses that are not a LinkedIn profile: reported apart from duplicates, which are a different thing.
  let rejected = 0;
  // Both sources are reduced to the same stored form, so one person is one row whatever was pasted.
  for (const c of picked) {
    const url = profileUrlFrom(c.linkedin_url);
    if (!url) { rejected++; continue; }
    byUrl.set(url, {
      user_id: userId, campaign_profile_id: listId, linkedin_url: url,
      full_name: c.full_name || url.split('/in/')[1] || null, title: c.title, company: c.company,
      source: 'my_contacts', status: 'ready',
    });
  }
  for (const typed of urls) {
    const url = profileUrlFrom(typed);
    if (!url) { rejected++; continue; }
    if (byUrl.has(url)) continue;
    const vanity = url.split('/in/')[1] || '';
    byUrl.set(url, {
      user_id: userId, campaign_profile_id: listId, linkedin_url: url,
      full_name: vanity.replace(/-/g, ' '), source: 'manual', status: 'ready',
    });
  }
  const payload = Array.from(byUrl.values());
  let inserted = 0;
  for (let i = 0; i < payload.length; i += 200) {
    const { data, error } = await supabase
      .from('campaign_leads')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload.slice(i, i + 200) as any, { onConflict: 'user_id,linkedin_url', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    inserted += data?.length || 0;
  }
  return { inserted, skipped: payload.length - inserted, rejected };
}
