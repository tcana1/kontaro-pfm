import { supabase } from '../../lib/supabase';

export async function getTags() {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('archived', false)
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getTagsAll() {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createTag(name: string, color: string) {
  const { data, error } = await supabase
    .from('tags')
    .insert({ name, color })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTag(id: number, updates: { name?: string; color?: string; archived?: boolean }) {
  const { data, error } = await supabase
    .from('tags')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getTagSummary(tagId: number) {
  const { data, error } = await supabase.rpc('get_tag_summary', { p_tag_id: tagId });
  if (error) throw error;
  return data as {
    total: number;
    count: number;
    first_date: string | null;
    last_date: string | null;
    breakdown: Array<{ category_name: string; category_color: string; total: number; count: number }>;
  } | null;
}

export async function deleteTag(id: number) {
  const { error } = await supabase
    .from('tags')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getTagTransactionCount(tagId: number): Promise<number> {
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('tag_id', tagId);
  if (error) throw error;
  return count || 0;
}

export async function getTagStats(): Promise<Record<number, { count: number; total: number }>> {
  const { data, error } = await supabase
    .from('transactions')
    .select('tag_id, amount')
    .not('tag_id', 'is', null)
    .eq('is_ignored', false);
  if (error) throw error;
  const stats: Record<number, { count: number; total: number }> = {};
  for (const t of (data || []) as Array<{ tag_id: number; amount: number }>) {
    if (!stats[t.tag_id]) stats[t.tag_id] = { count: 0, total: 0 };
    stats[t.tag_id].count++;
    stats[t.tag_id].total += Number(t.amount) * -1; // mirror RPC: expenses positive, reimbursements reduce total
  }
  return stats;
}

export async function mergeTag(fromId: number, toId: number): Promise<void> {
  const { error: updateError } = await supabase
    .from('transactions')
    .update({ tag_id: toId })
    .eq('tag_id', fromId);
  if (updateError) throw updateError;
  const { error: deleteError } = await supabase
    .from('tags')
    .delete()
    .eq('id', fromId);
  if (deleteError) throw deleteError;
}

export async function getTagTransactions(tagId: number, limit = 30) {
  const { data, error } = await supabase
    .from('transactions')
    .select(`
        id, payment_date, payee, amount,
        accounts!account_id ( name ),
        transaction_splits ( categories ( name, category_groups ( name ) ) )
      `)
    .eq('tag_id', tagId)
    .order('payment_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((t: any) => {
    const splits = t.transaction_splits ?? [];
    const firstCat = splits[0]?.categories;
    const category_name = firstCat?.name ?? '';
    const category_group_name = firstCat?.category_groups?.name ?? '';
    const splitCount = splits.length;
    return {
      id: t.id as number,
      payment_date: t.payment_date as string,
      payee: t.payee as string,
      amount: t.amount as string,
      account_name: (t.accounts as any)?.name ?? '',
      category_name: splitCount > 1 ? 'Split' : category_name,
      category_group_name: splitCount > 1 ? '' : category_group_name,
    };
  });
}

export async function setTransactionTag(transactionId: number, tagId: number | null) {
  const { error } = await supabase
    .from('transactions')
    .update({ tag_id: tagId })
    .eq('id', transactionId);
  if (error) throw error;
}

export async function bulkSetTransactionTag(transactionIds: number[], tagId: number | null) {
  const { error } = await supabase
    .from('transactions')
    .update({ tag_id: tagId })
    .in('id', transactionIds);
  if (error) throw error;
}
