import { supabase } from '../../lib/supabase';

export async function getExpenseBreakdown(options: any) {
  const { data, error } = await supabase.rpc('get_expense_breakdown', options);
  if (error) throw error;
  return data;
}

export async function getCategoryBreakdown(options: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.rpc('get_category_breakdown' as any, options);
  if (error) throw error;
  return data;
}
