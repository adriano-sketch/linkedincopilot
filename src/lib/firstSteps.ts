import { supabase } from '@/integrations/supabase/client';

export type FirstStep =
  | 'setup_opened'
  | 'about_saved'
  | 'audience_saved'
  | 'extension_step_opened'
  | 'store_link_clicked'
  | 'extension_connected'
  | 'setup_finished'
  | 'setup_finished_without_extension';

const sent = new Set<FirstStep>();

/**
 * Records the first time this person reaches a stage of the setup. Only the first time is kept,
 * and a failure here never reaches the screen: measuring must not get in the way of the setup.
 */
export function markFirstStep(step: FirstStep): void {
  if (sent.has(step)) return;
  sent.add(step);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (supabase as any).rpc('mark_first_step', { p_event: step }).then(
    ({ error }: { error: unknown }) => { if (error) sent.delete(step); },
    () => { sent.delete(step); },
  );
}
