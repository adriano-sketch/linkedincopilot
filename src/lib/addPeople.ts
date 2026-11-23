import { supabase } from '@/integrations/supabase/client';
import type { PickedContact } from '@/components/contacts/ContactPicker';

/** Turns what the person typed into a LinkedIn profile URL, or null when it is not one. */
export function profileUrlFrom(input: string): string | null {
  const url = input.trim();
  if (!url || !url.includes('linkedin.com/in/')) return null;
  return url.startsWith('http') ? url : `https://www.${url.replace(/^www\./, '')}`;
}

/**
 * Adds people to a list: contacts picked from the user's own connections plus pasted profile URLs.
 * They enter as "ready", which is what the reading cycle picks up. Someone already in any of the
 * user's lists is skipped (one person, one list).
 */
export async function addPeopleToList(
  userId: string, listId: string, picked: PickedContact[], urls: string[],
): Promise<{ inserted: number; skipped: number }> {
  const byUrl = new Map<string, Record<string, unknown>>();
  for (const c of picked) {
    byUrl.set(c.linkedin_url, {
      user_id: userId, campaign_profile_id: listId, linkedin_url: c.linkedin_url,
      full_name: c.full_name || c.linkedin_url.split('/in/')[1] || null, title: c.title, company: c.company,
      source: 'my_contacts', status: 'ready',
    });
  }
  for (const url of urls) {
    if (byUrl.has(url)) continue;
    const vanity = url.split('/in/')[1]?.replace(/\/$/, '') || '';
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
  return { inserted, skipped: payload.length - inserted };
}
