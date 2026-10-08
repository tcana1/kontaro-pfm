import { supabase } from '../../lib/supabase';

export async function getPayees(searchTerm?: string): Promise<{ id: number; name: string; default_category_id: number | null }[]> {
  if (!searchTerm || searchTerm.trim() === '') {
    return [];
  }

  const { data, error } = await supabase
    .from('payees')
    .select('id, name, default_category_id')
    .gt('id', 0)
    .ilike('name', `%${searchTerm}%`)
    .order('name', { ascending: true })
    .limit(50);

  if (error) {
    console.error('Error fetching payees:', error);
    throw error;
  }

  return data || [];
}

// PostgREST truncates any response to max_rows (1000 on Supabase Cloud and in
// supabase/config.toml) without reporting it, so a single request can't be trusted to
// return every payee. Page until a short page comes back.
const PAYEE_PAGE_SIZE = 1000;

export async function getAllPayeesWithCounts(): Promise<Array<{
  id: number;
  name: string;
  default_category_id: number | null;
  transaction_count: number;
}>> {
  const payees: Array<{
    id: number;
    name: string;
    default_category_id: number | null;
    transaction_count: number;
  }> = [];

  for (let offset = 0; ; offset += PAYEE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('v_payee_transaction_counts')
      .select('id, name, default_category_id, transaction_count')
      // id breaks ties so paging can't skip or repeat rows with duplicate names
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAYEE_PAGE_SIZE - 1);

    if (error) throw error;

    for (const row of data ?? []) {
      payees.push({
        id: row.id as number,
        name: row.name as string,
        default_category_id: row.default_category_id,
        transaction_count: row.transaction_count ?? 0,
      });
    }

    if (!data || data.length < PAYEE_PAGE_SIZE) break;
  }

  return payees;
}

export async function renamePayee(payeeId: number, newName: string): Promise<void> {
  const { error: payeeError } = await supabase
    .from('payees')
    .update({ name: newName })
    .eq('id', payeeId);
  if (payeeError) throw payeeError;

  // Keep transactions.payee in sync (trigger will re-resolve payee_id correctly)
  const { error: txError } = await supabase
    .from('transactions')
    .update({ payee: newName })
    .eq('payee_id', payeeId);
  if (txError) throw txError;
}

export async function mergePayees(sourceId: number, targetId: number): Promise<void> {
  // Fetch target name first so we can sync the payee text column
  const { data: target, error: fetchError } = await supabase
    .from('payees')
    .select('name')
    .eq('id', targetId)
    .single();
  if (fetchError) throw fetchError;

  // Re-point all transactions from source → target
  const { error: txError } = await supabase
    .from('transactions')
    .update({ payee_id: targetId, payee: target.name })
    .eq('payee_id', sourceId);
  if (txError) throw txError;

  // Delete the source payee (transactions no longer reference it)
  const { error: deleteError } = await supabase
    .from('payees')
    .delete()
    .eq('id', sourceId);
  if (deleteError) throw deleteError;
}

export async function setPayeeDefaultCategory(payeeId: number, categoryId: number | null): Promise<void> {
  const { error } = await supabase
    .from('payees')
    .update({ default_category_id: categoryId })
    .eq('id', payeeId);
  if (error) throw error;
}
