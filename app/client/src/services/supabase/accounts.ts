import { supabase } from '../../lib/supabase';
import { getTodayISO } from '../../lib/date-utils';

export async function getAccounts() {
  const { data, error } = await supabase.from('accounts').select('*');
  if (error) throw error;
  return data; // Return data as-is since it's already in snake_case
}

export async function getAccountBalances(): Promise<Record<number, number>> {
  const { data, error } = await supabase.rpc('get_account_balances' as any, { p_today: getTodayISO() });
  if (error) throw error;
  const map: Record<number, number> = {};
  for (const row of (data ?? [])) {
    map[row.account_id] = parseFloat(row.total_balance ?? 0);
  }
  return map;
}

export async function deleteAccount(accountId: number): Promise<void> {
  const { error } = await supabase.rpc('delete_account' as any, { p_account_id: accountId });
  if (error) throw error;
}
