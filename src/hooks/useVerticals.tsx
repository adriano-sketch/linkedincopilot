import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Vertical {
  id: string;
  name: string;
  tier: number;
  default_titles: string[];
  expansion_titles: string[] | null;
  trap_titles: string[] | null;
  trap_explanations: Record<string, string> | null;
  default_employee_range: string[] | null;
  primary_compliance: string | null;
  fear_trigger: string | null;
  scan_detectors: string[] | null;
  default_pain_points: string[] | null;
  icon: string | null;
  description: string | null;
  sort_order: number;
  suggested_industries: string[] | null;
  suggested_keywords: string[] | null;
}

export function useVerticals() {
  const { user } = useAuth();

  const { data: verticals, isLoading } = useQuery({
    queryKey: ['verticals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('verticals')
        .select('*')
        .order('tier', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as Vertical[];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 60, // 1 hour - reference data rarely changes
  });

  return { verticals: verticals || [], isLoading };
}
