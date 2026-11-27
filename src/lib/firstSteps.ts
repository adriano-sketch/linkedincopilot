import { supabase } from '@/integrations/supabase/client';

export type FirstStep =
  | 'setup_opened'
  | 'about_saved'
  | 'audience_saved'
  | 'extension_step_opened'
  | 'store_link_clicked'
  | 'extension_detect_started'
  | 'extension_connected'
  | 'setup_finished'
  | 'setup_finished_without_extension';

const MAX_ATTEMPTS = 2;
// Per person and stage: two accounts used in the same tab must not hide each other's stages.
const done = new Set<string>();
const attempts = new Map<string, number>();

/**
 * Records the first time this person reaches a stage of the setup. Only the first time is kept,
 * and a failure here never reaches the screen: measuring must not get in the way of the setup.
 */
export function markFirstStep(step: FirstStep, userId: string | undefined | null): void {
  if (!userId) return;
  const key = `${userId}:${step}`;
  if (done.has(key)) return;
  const tried = attempts.get(key) ?? 0;
  if (tried >= MAX_ATTEMPTS) return;
  attempts.set(key, tried + 1);
  done.add(key);
  const failed = () => { done.delete(key); };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (supabase as any).rpc('mark_first_step', { p_event: step }).then(
    ({ error }: { error: unknown }) => { if (error) failed(); },
    failed,
  );
}
