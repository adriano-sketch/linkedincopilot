import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type IcpVerdict = 'broken' | 'needs_work' | 'ok' | 'good' | 'great';
export type IcpTier = 'poor' | 'ok' | 'good' | 'great';

export interface IcpPersona {
  name: string;
  role: string;
  expected: 'yes' | 'no' | 'edge';
  verdict: 'yes' | 'no' | 'edge';
  reasoning: string;
}

export interface IcpSuggestion {
  priority: 'high' | 'medium' | 'low';
  message: string;
  example?: string;
}

export interface IcpFitResponse {
  score: number;
  verdict: IcpVerdict;
  strengths: string[];
  weaknesses: string[];
  suggestions: IcpSuggestion[];
  simulation: { personas: IcpPersona[] } | null;
  projected: {
    acceptance_tier: IcpTier;
    reply_tier: IcpTier;
    notes: string;
  } | null;
  ai_available: boolean;
  updated_at: string;
}

export interface IcpFitInput {
  icp_description?: string | null;
  icp_titles?: string[] | null;
  icp_industries?: string[] | null;
  pain_points?: string[] | null;
  value_proposition?: string | null;
  proof_points?: string | null;
  campaign_objective?: string | null;
  campaign_angle?: string | null;
}

interface UseIcpFitOptions {
  /** If true, auto-runs analysis whenever the input changes (debounced). */
  auto?: boolean;
  /** Debounce delay in ms for auto-run. Defaults to 1500. */
  debounceMs?: number;
}

/**
 * Client hook for the analyze-icp-fit edge function. Not a React Query hook
 * because we want explicit, debounced, imperative runs — users type into
 * wizard fields and we re-analyze as they pause.
 */
export function useIcpFit(input: IcpFitInput, options: UseIcpFitOptions = {}) {
  const { auto = true, debounceMs = 1500 } = options;
  const { user } = useAuth();

  const [result, setResult] = useState<IcpFitResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastKeyRef = useRef<string>('');

  const run = async (override?: IcpFitInput) => {
    if (!user) return;
    const payload = override ?? input;
    // Skip if the ICP is totally empty — no point calling.
    const hasContent =
      (payload.icp_description?.trim()?.length || 0) > 0 ||
      (payload.icp_titles?.length || 0) > 0 ||
      (payload.pain_points?.length || 0) > 0 ||
      (payload.value_proposition?.trim()?.length || 0) > 0;
    if (!hasContent) {
      setResult(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('analyze-icp-fit', {
        body: {
          user_id: user.id,
          icp_description: payload.icp_description ?? null,
          icp_titles: payload.icp_titles ?? [],
          icp_industries: payload.icp_industries ?? [],
          pain_points: (payload.pain_points ?? []).filter((p) => p && p.trim().length > 0),
          value_proposition: payload.value_proposition ?? null,
          proof_points: payload.proof_points ?? null,
          campaign_objective: payload.campaign_objective ?? null,
          campaign_angle: payload.campaign_angle ?? null,
        },
      });
      if (fnErr) throw fnErr;
      setResult(data as IcpFitResponse);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-run with debounce + structural de-dup so we don't re-analyze on
  // every keystroke or when the parent re-renders with a new object identity
  // but identical content.
  useEffect(() => {
    if (!auto || !user) return;
    const key = JSON.stringify({
      d: input.icp_description || '',
      t: input.icp_titles || [],
      i: input.icp_industries || [],
      p: (input.pain_points || []).filter(Boolean),
      v: input.value_proposition || '',
      pp: input.proof_points || '',
      o: input.campaign_objective || '',
      a: input.campaign_angle || '',
    });
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    const t = setTimeout(() => {
      run();
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    auto,
    user?.id,
    input.icp_description,
    JSON.stringify(input.icp_titles),
    JSON.stringify(input.icp_industries),
    JSON.stringify(input.pain_points),
    input.value_proposition,
    input.proof_points,
    input.campaign_objective,
    input.campaign_angle,
    debounceMs,
  ]);

  return { result, isLoading, error, run };
}
