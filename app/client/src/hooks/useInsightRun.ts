import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';

export interface InsightRun {
  id: number;
  month: string;
  model: string;
  content: string;
  created_at: string;
}

export function useInsightRun(selectedMonth: Date) {
  const monthKey = format(selectedMonth, 'yyyy-MM');

  return useQuery<InsightRun | null>({
    queryKey: ['insight_runs', monthKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('insight_runs')
        .select('*')
        .eq('month', monthKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });
}

// Invalidates every month's cached run — use after a report has been saved by
// an external agent so the drawer reflects it without a hard refresh.
export const insightRunsQueryKey = ['insight_runs'] as const;
